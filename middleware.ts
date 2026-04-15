import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextRequest, NextResponse } from "next/server";
import type { JWT } from "next-auth/jwt";

const { auth } = NextAuth(authConfig);

const configuredAuthOrigins = new Set(
  [process.env.NEXTAUTH_URL, process.env.AUTH_URL]
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return new URL(value).origin.toLowerCase();
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value))
);

const PUBLIC_PATHS = ["/login", "/register", "/unauthorized", "/forgot-password", "/reset-password"];

const MODULE_ROUTES: Record<string, string> = {
  "/families": "families",
  "/clash-detection": "clash",
  "/exam": "exam",
  "/trello": "trello",
  "/tasks": "tasks",
  "/lod-checker": "lod",
  "/sim-automation": "sim",
};

function isLocalOrPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "0.0.0.0") {
    return true;
  }

  if (/^10\.\d+\.\d+\.\d+$/.test(normalized)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(normalized)) return true;

  return false;
}

function getEffectiveRequestOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const protocol = forwardedProto || request.nextUrl.protocol.replace(/:$/, "");

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return request.nextUrl.origin;
  }
}

function rewriteAuthRedirectLocation(location: string, request: NextRequest) {
  const requestOrigin = getEffectiveRequestOrigin(request);
  const requestHostname = new URL(requestOrigin).hostname;

  if (!isLocalOrPrivateHostname(requestHostname)) {
    return location;
  }

  let target: URL;
  try {
    target = new URL(location, requestOrigin);
  } catch {
    return location;
  }

  if (target.origin === requestOrigin) {
    return target.toString();
  }

  if (!configuredAuthOrigins.has(target.origin.toLowerCase())) {
    return location;
  }

  const callbackUrl = target.searchParams.get("callbackUrl");
  if (callbackUrl) {
    try {
      const normalizedCallbackUrl = new URL(callbackUrl, requestOrigin);
      if (configuredAuthOrigins.has(normalizedCallbackUrl.origin.toLowerCase())) {
        normalizedCallbackUrl.protocol = new URL(requestOrigin).protocol;
        normalizedCallbackUrl.host = new URL(requestOrigin).host;
        target.searchParams.set("callbackUrl", normalizedCallbackUrl.toString());
      }
    } catch {
      // Keep the original callbackUrl if it is malformed.
    }
  }

  target.protocol = new URL(requestOrigin).protocol;
  target.host = new URL(requestOrigin).host;

  return target.toString();
}

export default async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Run the standard auth check first
  const authResponse = await (auth as any)(req);

  // If auth redirects (not authenticated), return that response
  if (authResponse && authResponse.status !== 200 && authResponse.headers.get("location")) {
    const location = authResponse.headers.get("location");
    if (location) {
      authResponse.headers.set("location", rewriteAuthRedirectLocation(location, req));
    }
    return authResponse;
  }

  // Module-level access check
  const matchedModule = Object.entries(MODULE_ROUTES).find(([route]) => pathname.startsWith(route));
  if (matchedModule) {
    const [, moduleKey] = matchedModule;
    // Read token from cookie (edge-safe)
    const tokenCookie =
      req.cookies.get("authjs.session-token")?.value ??
      req.cookies.get("__Secure-authjs.session-token")?.value;

    if (tokenCookie) {
      try {
        const { getToken } = await import("next-auth/jwt");
        const token = (await getToken({
          req: req as any,
          secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
        })) as (JWT & { role?: string; moduleAccess?: string[] }) | null;

        if (token && token.role !== "ADMIN") {
          const moduleAccess: string[] = token.moduleAccess ?? [];
          if (!moduleAccess.includes(moduleKey)) {
            const url = req.nextUrl.clone();
            url.pathname = "/unauthorized";
            url.search = "?reason=no_module_access";
            return NextResponse.redirect(url);
          }
        }
      } catch {
        // If token decoding fails, fall through (auth will handle it)
      }
    }
  }

  return authResponse ?? NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/auth|api/trpc|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
