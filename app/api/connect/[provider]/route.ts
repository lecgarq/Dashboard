import { NextRequest, NextResponse } from "next/server";

import { isOAuthConnectProvider } from "@/lib/google/oauth-connect";

function toSafeRedirectTarget(target: string | null, request: NextRequest) {
  const origin = request.nextUrl.origin;

  if (!target) {
    return "/";
  }

  try {
    const normalized = new URL(target, origin);
    if (normalized.origin !== origin) {
      return "/";
    }

    return `${normalized.pathname}${normalized.search}${normalized.hash}` || "/";
  } catch {
    return "/";
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  if (!isOAuthConnectProvider(provider)) {
    return NextResponse.json({ error: "Unsupported OAuth provider." }, { status: 404 });
  }

  const callbackUrl =
    request.nextUrl.searchParams.get("callbackUrl") ?? request.headers.get("referer");
  const redirectTo = toSafeRedirectTarget(callbackUrl, request);
  const forceConsent = request.nextUrl.searchParams.get("forceConsent") === "1";

  const loginUrl = new URL("/login", request.nextUrl.origin);
  loginUrl.searchParams.set("connect", provider);
  loginUrl.searchParams.set("callbackUrl", redirectTo);
  if (forceConsent) {
    loginUrl.searchParams.set("forceConsent", "1");
  }

  return NextResponse.redirect(loginUrl);
}
