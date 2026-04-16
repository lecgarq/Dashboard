import "server-only";

import { IntegrationError } from "@/lib/server/integration-errors";
import { createLogger } from "@/lib/server/logger";
import { db } from "@/server/db";

const logger = createLogger("aps-user-token");

const APS_TOKEN_URL =
  "https://developer.api.autodesk.com/authentication/v2/token";
const APS_REFRESH_BUFFER_SEC = 5 * 60;
const DEFAULT_AUTODESK_SCOPES =
  "openid data:read viewables:read user:read account:read";

type AutodeskAccountRecord = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  scope: string | null;
};

export type AutodeskAccessToken = {
  accessToken: string;
  expiresAt: number | null;
};

function reconnectRequired(message: string, details?: Record<string, unknown>) {
  return new IntegrationError(
    message,
    401,
    "reconnect_required",
    "Autodesk",
    details
  );
}

function unavailable(message: string, details?: Record<string, unknown>) {
  return new IntegrationError(message, 502, "unavailable", "Autodesk", details);
}

function configMissing(message: string, details?: Record<string, unknown>) {
  return new IntegrationError(
    message,
    500,
    "config_missing",
    "Autodesk",
    details
  );
}

async function getAutodeskAccount(
  userId: string
): Promise<AutodeskAccountRecord | null> {
  return db.account.findFirst({
    where: { userId, provider: "autodesk" },
    select: {
      id: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
      scope: true,
    },
  });
}

function hasFreshAccessToken(account: AutodeskAccountRecord) {
  if (!account.access_token) return false;
  if (!account.expires_at) return true;

  const nowSec = Math.floor(Date.now() / 1000);
  return account.expires_at > nowSec + APS_REFRESH_BUFFER_SEC;
}

async function refreshAutodeskAccessToken(
  account: AutodeskAccountRecord
): Promise<AutodeskAccessToken> {
  const clientId = process.env.APS_CLIENT_ID?.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw configMissing("Autodesk APS credentials are not configured.");
  }

  if (!account.refresh_token) {
    throw reconnectRequired(
      "Autodesk connection expired. Reconnect Autodesk and try again."
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: account.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
    scope: account.scope?.trim() || DEFAULT_AUTODESK_SCOPES,
  });

  const response = await fetch(APS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  const raw = await response.text();
  let payload: Record<string, unknown> | null = null;

  try {
    payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorText =
      (typeof payload?.error_description === "string" &&
        payload.error_description) ||
      (typeof payload?.developerMessage === "string" &&
        payload.developerMessage) ||
      (typeof payload?.error === "string" && payload.error) ||
      raw ||
      `${response.status} ${response.statusText}`;

    logger.warn("Autodesk token refresh failed", {
      status: response.status,
      error: errorText,
    });

    if (
      response.status === 400 ||
      response.status === 401 ||
      response.status === 403 ||
      errorText.toLowerCase().includes("invalid_grant")
    ) {
      await db.account
        .update({
          where: { id: account.id },
          data: {
            access_token: null,
            expires_at: null,
          },
        })
        .catch(() => null);

      throw reconnectRequired(
        "Autodesk connection expired. Reconnect Autodesk and try again.",
        {
          status: response.status,
          error: errorText,
        }
      );
    }

    throw unavailable("Autodesk token refresh failed.", {
      status: response.status,
      error: errorText,
    });
  }

  const accessToken =
    typeof payload?.access_token === "string" ? payload.access_token : null;

  if (!accessToken) {
    throw unavailable("Autodesk token refresh returned no access token.", {
      payload,
    });
  }

  const expiresIn =
    typeof payload?.expires_in === "number"
      ? payload.expires_in
      : Number(payload?.expires_in ?? 0);
  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? Math.floor(Date.now() / 1000) + expiresIn
      : null;

  await db.account.update({
    where: { id: account.id },
    data: {
      access_token: accessToken,
      refresh_token:
        typeof payload?.refresh_token === "string"
          ? payload.refresh_token
          : account.refresh_token,
      expires_at: expiresAt,
      scope:
        typeof payload?.scope === "string"
          ? payload.scope
          : account.scope ?? DEFAULT_AUTODESK_SCOPES,
    },
  });

  logger.info("Autodesk token refreshed", {
    expiresAt,
  });

  return {
    accessToken,
    expiresAt,
  };
}

export async function getValidAutodeskAccessToken(
  userId: string
): Promise<AutodeskAccessToken> {
  const account = await getAutodeskAccount(userId);

  if (!account) {
    throw reconnectRequired(
      "Link Autodesk to continue with APS search and viewer features."
    );
  }

  if (hasFreshAccessToken(account)) {
    return {
      accessToken: account.access_token!,
      expiresAt: account.expires_at,
    };
  }

  if (account.access_token && !account.expires_at) {
    return {
      accessToken: account.access_token,
      expiresAt: null,
    };
  }

  return refreshAutodeskAccessToken(account);
}
