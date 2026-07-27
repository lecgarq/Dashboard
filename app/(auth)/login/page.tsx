"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, KeyRound, Loader2, ShieldAlert, UserCircle2 } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startOAuthConnect } from "@/lib/google/oauth-connect";
import { trpc } from "@/lib/core/trpc";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountAlreadyLinked: "This account is already linked to a different user.",
  OAuthAccountNotLinked:
    "This email exists with another sign-in method. Try your original provider and we will link accounts automatically.",
  OAuthCreateAccount: "We could not create your account from the Google sign-in. Please try again.",
  EmailAlreadyInUse: "This email is already associated with another account.",
  OAuthSignin: "OAuth sign-in failed. Please try again.",
  OAuthCallbackError: "OAuth sign-in failed while returning from Google. Please try again.",
  Callback: "OAuth sign-in failed while completing the callback. Please try again.",
  AccessDenied:
    "This account is not approved for access yet. Contact your BIM manager if you should already have access.",
  Configuration:
    "Authentication is temporarily unavailable. Please try again in a moment.",
  CredentialsSignin: "Invalid username or password.",
  "reset=success": "Password updated. Sign in with your new password.",
};

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AutodeskMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2 2 7l10 5 10-5-10-5Zm-10 10 10 5 10-5M2 17l10 5 10-5" />
    </svg>
  );
}

function getSafeClientCallbackTarget(target: string | null) {
  if (!target || typeof window === "undefined") {
    return "/";
  }

  try {
    const normalized = new URL(target, window.location.origin);
    if (normalized.origin !== window.location.origin) {
      return "/";
    }

    return `${normalized.pathname}${normalized.search}${normalized.hash}` || "/";
  } catch {
    return "/";
  }
}

function Notice({
  tone,
  children,
}: {
  tone: "success" | "error" | "info";
  children: React.ReactNode;
}) {
  const styles =
    tone === "success"
      ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
      : tone === "error"
        ? "border-rose-200/80 bg-rose-50/90 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
        : "border-sky-200/80 bg-sky-50/90 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300";

  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${styles}`}>
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const resetSuccess = searchParams.get("reset") === "success";
  const connectProvider = searchParams.get("connect");
  const connectCallbackUrl = getSafeClientCallbackTarget(searchParams.get("callbackUrl"));
  const forceConsent = searchParams.get("forceConsent") === "1";
  const urlErrorMessage = urlError
    ? (OAUTH_ERROR_MESSAGES[urlError] ?? "Sign-in error. Please try again.")
    : null;

  const [loading, setLoading] = useState<string | null>(null);
  const [userIdentifier, setUserIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [providerHint, setProviderHint] = useState<string | null>(null);

  const error = formError ?? urlErrorMessage;

  const { refetch: fetchProviders } = trpc.users.getProvidersByEmail.useQuery(
    { userIdentifier },
    { enabled: false }
  );

  useEffect(() => {
    if (!connectProvider || loading) return;
    if (connectProvider !== "google" && connectProvider !== "google-chat" && connectProvider !== "autodesk") return;

    setLoading(connectProvider);
    if (connectProvider === "autodesk") {
      void signIn("autodesk", { redirectTo: connectCallbackUrl }, { prompt: forceConsent ? "login consent" : "login" });
      return;
    }

    startOAuthConnect(connectProvider, {
      callbackUrl: connectCallbackUrl,
      forceConsent,
    });
  }, [connectProvider, connectCallbackUrl, forceConsent, loading]);

  const handleOAuthSignIn = (provider: string) => {
    setLoading(provider);
    if (provider === "google" || provider === "google-chat") {
      startOAuthConnect(provider, { callbackUrl: connectCallbackUrl });
      return;
    }
    if (provider === "autodesk") {
      signIn(provider, { redirectTo: connectCallbackUrl }, { prompt: "login" });
      return;
    }
    signIn(provider, { redirectTo: connectCallbackUrl });
  };

  const handleCredentialsSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading("credentials");
    setFormError(null);
    setProviderHint(null);

    try {
      const result = await signIn("credentials", {
        userIdentifier,
        password,
        redirect: false,
      });

      if (result?.error) {
        const { data } = await fetchProviders();
        const providers = data?.providers ?? [];

        if (providers.length === 1) {
          const name =
            providers[0] === "google"
              ? "Google"
              : providers[0] === "autodesk"
                ? "Autodesk"
                : providers[0];
          setProviderHint(`This account uses ${name} sign-in. Use the matching provider button below.`);
          setFormError(null);
        } else if (providers.length >= 2) {
          setProviderHint("This account is linked to more than one provider. Use one of the identity buttons below.");
          setFormError(null);
        } else {
          setFormError("Invalid username or password.");
        }

        setLoading(null);
        return;
      }

      window.location.href = "/";
    } catch {
      setFormError("An unexpected error occurred.");
      setLoading(null);
    }
  };

  return (
    <AuthShell>
      <div className="surface-card animate-fade-up rounded-[2rem] border px-6 py-7 sm:px-8 sm:py-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-foreground">
              Sign in
            </h2>
            <p className="text-sm leading-7 text-muted-foreground">
              Use your local credentials, or sign in with Google or Autodesk.
            </p>
          </div>

          {resetSuccess && <Notice tone="success">Password updated. Sign in with your new password.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          {providerHint && <Notice tone="info">{providerHint}</Notice>}

          <form onSubmit={handleCredentialsSignIn} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground/80">Username or email</label>
              <div className="relative">
                <UserCircle2 className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  type="text"
                  placeholder="you@company.com"
                  required
                  className="h-12 rounded-2xl border-input pl-11"
                  value={userIdentifier}
                  onChange={(event) => setUserIdentifier(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-semibold text-foreground/80">Password</label>
                <Link href="/forgot-password" className="text-sm font-medium text-primary transition-colors hover:text-primary/80">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  type="password"
                  placeholder="Enter your password"
                  required
                  className="h-12 rounded-2xl border-input pl-11"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={!!loading}
              size="lg"
              className="h-12 w-full rounded-2xl font-semibold"
            >
              {loading === "credentials" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying access
                </>
              ) : (
                <>
                  Continue to dashboard
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-4 text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground/60">
                Or use identity provider
              </span>
            </div>
          </div>

          <div className="grid gap-3">
            <button
              type="button"
              disabled={!!loading}
              onClick={() => handleOAuthSignIn("google")}
              className="surface-panel surface-card-hover flex h-14 items-center justify-between rounded-2xl px-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-3">
                {loading === "google" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <GoogleMark />
                )}
                <div>
                  <p className="font-semibold text-foreground">Continue with Google</p>
                  <p className="text-sm text-muted-foreground">Use Workspace identity and shared permissions.</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/60" />
            </button>

            <button
              type="button"
              disabled={!!loading}
              onClick={() => handleOAuthSignIn("autodesk")}
              className="surface-panel surface-card-hover flex h-14 items-center justify-between rounded-2xl px-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-3">
                {loading === "autodesk" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <AutodeskMark />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-foreground">Continue with Autodesk</p>
                  <p className="text-sm text-muted-foreground">Link project cloud access and model workflows.</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/60" />
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
            Access is limited to approved team accounts. If you cannot sign in, contact your BIM manager before creating a support ticket.
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Do not have a local account?{" "}
            <Link href="/register" className="font-semibold text-primary hover:text-primary/80">
              Register
            </Link>
          </p>
        </div>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
