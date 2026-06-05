import type { PrismaClient } from "@prisma/client";

const BASE = "https://developer.api.autodesk.com";
const USER_EMAIL = process.env.APS_USER_EMAIL || "luis.cortes@hermosillo.com";

/**
 * Refresh luis's 3-leg Autodesk access token from the stored Account row and
 * PERSIST the rotated refresh token. APS v2 refresh tokens are single-use; not
 * persisting the rotation breaks dashboard login. Pass a PrismaClient (scripts
 * create their own; server code can pass the app db). Returns a bearer token.
 * No "server-only" import — must be importable from Node scripts via tsx.
 */
export async function refreshAndPersistFromDb(
  prisma: PrismaClient,
  scope = "data:read",
): Promise<string> {
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { id: true, refresh_token: true },
  });
  if (!acct?.refresh_token) throw new Error(`No stored Autodesk refresh_token for ${USER_EMAIL}.`);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: acct.refresh_token,
    client_id: process.env.APS_CLIENT_ID ?? "",
    client_secret: process.env.APS_CLIENT_SECRET ?? "",
    scope,
  });
  const res = await fetch(`${BASE}/authentication/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Token refresh failed (${res.status}): ${JSON.stringify(json)}`);
  }
  await prisma.account.update({
    where: { id: acct.id },
    data: {
      access_token: json.access_token,
      refresh_token: json.refresh_token ?? acct.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (json.expires_in || 3600),
      scope: json.scope ?? scope,
    },
  });
  return json.access_token;
}
