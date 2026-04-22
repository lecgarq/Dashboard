import "server-only";

import { google } from "googleapis";

import { GOOGLE_DRIVE_REQUIRED_SCOPES, getMissingGoogleScopes } from "@/lib/google/oauth";
import { buildGoogleDriveOAuthClient, getPrimaryGoogleOAuthClientConfig } from "@/lib/server/google-service-auth";
import { createLogger } from "@/lib/server/logger";
import { db } from "@/server/db";

const logger = createLogger("wiki-media-auth");

type AccountTokenPatch = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
};

async function buildUserGoogleDriveOAuthClient(userId: string) {
  const account = await db.account.findFirst({
    where: { userId, provider: "google" },
    select: {
      access_token: true,
      expires_at: true,
      provider: true,
      providerAccountId: true,
      refresh_token: true,
      scope: true,
    },
  });

  if (!account?.refresh_token) {
    return null;
  }

  const missingScopes = getMissingGoogleScopes(
    account.scope,
    GOOGLE_DRIVE_REQUIRED_SCOPES
  );

  if (missingScopes.length > 0) {
    return null;
  }

  const { clientId, clientSecret } = getPrimaryGoogleOAuthClientConfig();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);

  oauth2.on("tokens", async (tokens) => {
    const data: AccountTokenPatch = {};
    if (tokens.access_token) data.access_token = tokens.access_token;
    if (tokens.refresh_token) data.refresh_token = tokens.refresh_token;
    if (tokens.expiry_date) data.expires_at = Math.floor(tokens.expiry_date / 1000);
    if (tokens.scope) data.scope = tokens.scope;

    if (Object.keys(data).length === 0) {
      return;
    }

    try {
      await db.account.update({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
        data,
      });
    } catch (error) {
      logger.warn("Failed to persist refreshed user Google Drive token", { error });
    }
  });

  oauth2.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  return oauth2;
}

export async function buildWikiMediaDriveOAuthClient(userId: string | null | undefined) {
  if (userId) {
    const userDriveAuth = await buildUserGoogleDriveOAuthClient(userId);
    if (userDriveAuth) {
      return userDriveAuth;
    }
  }

  return buildGoogleDriveOAuthClient();
}
