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

export interface GmailOAuthConfig extends GooglePrimaryOAuthClientConfig {
  refreshToken: string;
  redirectUri: string;
}

let cachedDriveOAuthClient:
  | {
      key: string;
      client: InstanceType<typeof google.auth.OAuth2>;
    }
  | null = null;
let cachedGmailOAuthClient:
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
    "GOOGLE_CLIENT_ID",
    "GMAIL_OAUTH_CLIENT_ID",
    "GOOGLE_CLIENT_ID-FOR-MAIL",
  ]);
  const clientSecret = getFirstConfiguredEnv([
    "GOOGLE_CLIENT_SECRET",
    "GMAIL_OAUTH_CLIENT_SECRET",
    "GOOGLE_SECRET_ID-FOR-MAIL",
  ]);
  const refreshToken = getFirstConfiguredEnv([
    "GOOGLE_DRIVE_REFRESH_TOKEN",
    "GMAIL_REFRESH_TOKEN",
  ]);
  const redirectUri =
    process.env.GMAIL_OAUTH_REDIRECT_URI?.trim() ||
    "https://developers.google.com/oauthplayground";

  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_CLIENT_ID (or GMAIL_OAUTH_CLIENT_ID)");
  if (!clientSecret) {
    missing.push("GOOGLE_CLIENT_SECRET (or GMAIL_OAUTH_CLIENT_SECRET)");
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

export function getGmailOAuthConfig(): GmailOAuthConfig {
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
    "GMAIL_REFRESH_TOKEN",
    "GOOGLE_DRIVE_REFRESH_TOKEN",
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
    missing.push("GMAIL_REFRESH_TOKEN (or GOOGLE_DRIVE_REFRESH_TOKEN)");
  }

  if (missing.length > 0) {
    throw new Error(`Missing Gmail OAuth config: ${missing.join(", ")}`);
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

  // If the config changed, or we don't have a cached client, create a new one
  if (cachedDriveOAuthClient?.key !== key) {
    const oauth2 = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    // Hardened Token Management: Listen for refresh events
    // This allows us to track when Google issues a new access token
    oauth2.on("tokens", (tokens) => {
      console.log(`[GoogleDriveAuth] Tokens refreshed for client ${config.clientId.slice(0, 8)}...`);
      if (tokens.refresh_token) {
        // Warning: This usually shouldn't happen unless "prompt=consent" was used,
        // but if it does, we should log it so the admin knows to update their .env
        console.warn("[GoogleDriveAuth] A new REFRESH_TOKEN was issued. Please update your environment variables if persistence fails.");
      }
    });

    oauth2.setCredentials({ refresh_token: config.refreshToken });
    
    cachedDriveOAuthClient = {
      key,
      client: oauth2,
    };
  }

  return cachedDriveOAuthClient.client;
}

export function buildGmailOAuthClient() {
  const config = getGmailOAuthConfig();
  const key = [
    config.clientId,
    config.clientSecret,
    config.refreshToken,
    config.redirectUri,
  ].join("::");

  if (cachedGmailOAuthClient?.key !== key) {
    const oauth2 = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    oauth2.on("tokens", (tokens) => {
      console.log(`[GmailAuth] Tokens refreshed for client ${config.clientId.slice(0, 8)}...`);
      if (tokens.refresh_token) {
        console.warn("[GmailAuth] A new REFRESH_TOKEN was issued. Please update your environment variables if persistence fails.");
      }
    });

    oauth2.setCredentials({ refresh_token: config.refreshToken });

    cachedGmailOAuthClient = {
      key,
      client: oauth2,
    };
  }

  return cachedGmailOAuthClient.client;
}
