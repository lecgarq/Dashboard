import "server-only";

import { google } from "googleapis";

function getFirstConfiguredEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export interface GooglePrimaryOAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export interface GoogleDriveOAuthConfig extends GooglePrimaryOAuthClientConfig {
  refreshToken: string;
  redirectUri: string;
}

let cachedDriveOAuthClient:
  | {
      key: string;
      client: InstanceType<typeof google.auth.OAuth2>;
    }
  | null = null;

export function getPrimaryGoogleOAuthClientConfig(): GooglePrimaryOAuthClientConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const missing: string[] = [];

  if (!clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");

  if (missing.length > 0) {
    throw new Error(`Missing Google OAuth client config: ${missing.join(", ")}`);
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
  };
}

export function buildPrimaryGoogleOAuthClient() {
  const config = getPrimaryGoogleOAuthClientConfig();
  return new google.auth.OAuth2(config.clientId, config.clientSecret);
}

export function getGoogleDriveOAuthConfig(): GoogleDriveOAuthConfig {
  const clientId = getFirstConfiguredEnv([
    "GMAIL_OAUTH_CLIENT_ID",
    "GOOGLE_CLIENT_ID-FOR-MAIL",
    "GOOGLE_CLIENT_ID",
  ]);
  const clientSecret = getFirstConfiguredEnv([
    "GMAIL_OAUTH_CLIENT_SECRET",
    "GOOGLE_SECRET_ID-FOR-MAIL",
    "GOOGLE_CLIENT_SECRET",
  ]);
  const refreshToken = getFirstConfiguredEnv([
    "GOOGLE_DRIVE_REFRESH_TOKEN",
    "GMAIL_REFRESH_TOKEN",
  ]);
  const redirectUri =
    process.env.GMAIL_OAUTH_REDIRECT_URI?.trim() ||
    "https://developers.google.com/oauthplayground";

  const missing: string[] = [];
  if (!clientId) missing.push("GMAIL_OAUTH_CLIENT_ID (or GOOGLE_CLIENT_ID)");
  if (!clientSecret) {
    missing.push("GMAIL_OAUTH_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET)");
  }
  if (!refreshToken) {
    missing.push("GOOGLE_DRIVE_REFRESH_TOKEN (or GMAIL_REFRESH_TOKEN)");
  }

  if (missing.length > 0) {
    throw new Error(`Missing Google Drive OAuth config: ${missing.join(", ")}`);
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    refreshToken: refreshToken!,
    redirectUri,
  };
}

export function buildGoogleDriveOAuthClient() {
  const config = getGoogleDriveOAuthConfig();
  const key = [
    config.clientId,
    config.clientSecret,
    config.refreshToken,
    config.redirectUri,
  ].join("::");

  if (cachedDriveOAuthClient?.key === key) {
    cachedDriveOAuthClient.client.setCredentials({
      refresh_token: config.refreshToken,
    });
    return cachedDriveOAuthClient.client;
  }

  const oauth2 = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );
  oauth2.setCredentials({ refresh_token: config.refreshToken });
  cachedDriveOAuthClient = {
    key,
    client: oauth2,
  };
  return oauth2;
}
