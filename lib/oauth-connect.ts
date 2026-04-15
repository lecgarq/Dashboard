import { googleChatAuthScopeString } from "@/lib/google-oauth";

export type OAuthConnectProvider = "google" | "google-chat";

const OAUTH_CONNECT_PROVIDERS = ["google", "google-chat"] as const;

type OAuthConnectOptions = {
  callbackUrl: string;
  forceConsent?: boolean;
};

export function isOAuthConnectProvider(value: string): value is OAuthConnectProvider {
  return (OAUTH_CONNECT_PROVIDERS as readonly string[]).includes(value);
}

export function buildOAuthConnectPath(
  provider: OAuthConnectProvider,
  options: OAuthConnectOptions
) {
  const params = new URLSearchParams({
    callbackUrl: options.callbackUrl,
  });

  if (options.forceConsent) {
    params.set("forceConsent", "1");
  }

  return `/api/connect/${provider}?${params.toString()}`;
}

export function startOAuthConnect(
  provider: OAuthConnectProvider,
  options: OAuthConnectOptions
) {
  if (typeof window === "undefined") {
    return;
  }

  const authorizationParams: Record<string, string> = {
    prompt: options.forceConsent ? "consent select_account" : "select_account",
    access_type: "offline",
    response_type: "code",
  };

  if (provider === "google-chat") {
    authorizationParams.scope = googleChatAuthScopeString;
  }

  void import("next-auth/react").then(({ signIn }) =>
    signIn(provider, { redirectTo: options.callbackUrl }, authorizationParams)
  );
}
