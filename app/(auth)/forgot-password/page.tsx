"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Mail } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/core/trpc";

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestReset = trpc.users.requestPasswordReset.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setLoading(false);
    },
    onError: (err) => {
      setError(err.message || "Password reset email could not be sent right now.");
      setLoading(false);
    },
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(false);
    setError(null);
    setLoading(true);
    requestReset.mutate({ email: email.trim().toLowerCase() });
  };

  return (
    <AuthShell>
      <div className="surface-card animate-fadeIn rounded-[2rem] border px-6 py-8 sm:px-8">
        <div className="space-y-3">
          <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-foreground">
            Forgot password
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">
            Enter the email tied to your account and we will send a secure reset link.
          </p>
        </div>

        {submitted ? (
          <div className="mt-8 space-y-5 text-center">
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 px-4 py-4 text-sm">
              If that email exists, a reset link has been sent. Check your inbox and spam folder.
            </div>
            <Button asChild variant="outline" className="rounded-2xl">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error && (
              <div className="rounded-2xl border border-rose-200/80 bg-rose-50/90 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 px-4 py-4 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="ml-1 text-sm font-semibold text-foreground/80">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  type="email"
                  placeholder="you@company.com"
                  required
                  className="h-12 rounded-2xl border-input pl-11"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>

            <Button type="submit" disabled={loading} className="h-12 w-full rounded-2xl font-semibold">
              {loading ? "Sending reset link" : "Send reset link"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>

            <div className="pt-2 text-center">
              <Link href="/login" className="text-sm font-medium text-primary hover:text-primary/80">
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
