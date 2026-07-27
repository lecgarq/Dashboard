"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/core/trpc";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetPassword = trpc.users.resetPassword.useMutation({
    onSuccess: () => {
      router.push("/login?reset=success");
    },
    onError: (err) => {
      setError(
        err.message.includes("expired") || err.message.includes("Invalid")
          ? "This link is invalid or expired. Request a new one."
          : "Something went wrong. Please try again."
      );
      setLoading(false);
    },
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("Missing reset token. Please use the link from your email.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    resetPassword.mutate({ token, newPassword });
  };

  return (
    <AuthShell>
      <div className="surface-card animate-fadeIn rounded-[2rem] border px-6 py-8 sm:px-8">
        <div className="space-y-3">
          <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-foreground">
            Reset password
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">
            Choose a new password and return to the dashboard immediately after verification.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-rose-200/80 bg-rose-50/90 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 px-4 py-4 text-sm">
            {error}{" "}
            {error.includes("invalid or expired") && (
              <Link href="/forgot-password" className="font-semibold underline">
                Request a new one.
              </Link>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <label className="ml-1 text-sm font-semibold text-foreground/80">New password</label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                type="password"
                placeholder="Minimum 6 characters"
                required
                minLength={6}
                className="h-12 rounded-2xl border-input pl-11"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="ml-1 text-sm font-semibold text-foreground/80">Confirm password</label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                type="password"
                placeholder="Repeat your new password"
                required
                className="h-12 rounded-2xl border-input pl-11"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || !token}
            className="h-12 w-full rounded-2xl font-semibold"
          >
            {loading ? "Updating password" : "Set new password"}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>

          <div className="pt-2 text-center">
            <Link href="/login" className="text-sm font-medium text-primary hover:text-primary/80">
              Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
