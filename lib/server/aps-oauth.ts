/**
 * APS OAuth helpers — CJS/CLI-safe (NO `server-only` import).
 *
 * Lifted out of `scripts/dc-ingest-where-i-admin.cjs` per Phase 8 RESEARCH
 * "Do Not Hand-Roll" so the Phase 8 Wave-2 orchestrator (`lib/acc/dcIngest.ts`)
 * and the daily cron entry (`scripts/dc-daily-ingest.cjs`) can share token
 * lifecycle with all other DC scripts.
 *
 * Why a new file (not reuse `lib/server/aps-user-token.ts`)?
 *   - That module imports `server-only` and uses the request-scoped Prisma
 *     instance from `@/server/db`. The cron runs OUTSIDE Next.js — its own
 *     PrismaClient is injected.
 *
 * 3-leg user context only — 2-leg is permanently blocked for Data Connector
 * (memory note `project_data_connector_declined.md`, 2026-05-12).
 */
import type { PrismaClient } from '@prisma/client';

const APS_TOKEN_URL =
  'https://developer.api.autodesk.com/authentication/v2/token';
const REFRESH_BUFFER_SEC = 5 * 60;
const DC_SCOPES =
  'openid data:read data:create viewables:read user:read account:read';

export interface RefreshUserTokenOptions {
  /** Email of the Autodesk-linked user whose refresh_token we will use. */
  userEmail: string;
}

/**
 * Refresh — or reuse if still fresh — the 3-leg APS access token for the
 * given user email. Persists the new token (+ refresh_token rotation +
 * expires_at) back to the `Account` row.
 *
 * Throws on configuration or refresh-grant failure (see authentication_gates
 * in execute-plan workflow — caller treats as a checkpoint, not a bug).
 */
export async function refreshUserToken(
  prisma: PrismaClient,
  opts: RefreshUserTokenOptions,
): Promise<string> {
  const acct = await prisma.account.findFirst({
    where: { provider: 'autodesk', user: { email: opts.userEmail } },
    select: {
      id: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });
  if (!acct?.refresh_token) {
    throw new Error(
      `[aps-oauth] No refresh_token in DB for ${opts.userEmail}. Log in via Autodesk OAuth.`,
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (
    acct.access_token &&
    acct.expires_at &&
    acct.expires_at > nowSec + REFRESH_BUFFER_SEC
  ) {
    return acct.access_token;
  }

  const clientId = process.env.APS_CLIENT_ID?.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      '[aps-oauth] APS_CLIENT_ID / APS_CLIENT_SECRET env vars not set.',
    );
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: acct.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
    scope: DC_SCOPES,
  });
  const res = await fetch(APS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `[aps-oauth] User token refresh failed (${res.status}): ${
        json.error_description ?? json.error ?? JSON.stringify(json).slice(0, 200)
      }`,
    );
  }

  await prisma.account.update({
    where: { id: acct.id },
    data: {
      access_token: json.access_token,
      refresh_token: json.refresh_token ?? acct.refresh_token,
      expires_at:
        Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
      scope: json.scope ?? DC_SCOPES,
    },
  });

  return json.access_token;
}
