"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Mail, Sparkles } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

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
    <AuthShell
      eyebrow="Account recovery"
      title="Recover access without breaking the visual flow."
      description="Request a reset link and return to the workspace with the same polished onboarding experience."
      highlights={[
        "Reset requests keep users in a calm, guided UI instead of a dead-end form.",
        "Feedback states are clearer, which reduces duplicate recovery requests.",
        "The auth pages now read like one product instead of isolated screens.",
      ]}
      statusLabel="Recovery service active"
    >
      <div className="surface-card animate-fadeIn rounded-[2rem] border px-6 py-8 sm:px-8">
        <div className="space-y-3">
          <div className="surface-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Password recovery
          </div>
          <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            Forgot password
          </h2>
          <p className="text-sm leading-7 text-slate-600">
            Enter the email tied to your account and we will send a secure reset link.
          </p>
        </div>

        {submitted ? (
          <div className="mt-8 space-y-5 text-center">
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-4 text-sm text-emerald-700">
              If that email exists, a reset link has been sent. Check your inbox and spam folder.
            </div>
            <Button asChild variant="outline" className="rounded-2xl">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error && (
              <div className="rounded-2xl border border-rose-200/80 bg-rose-50/90 px-4 py-4 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="ml-1 text-sm font-semibold text-slate-700">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  placeholder="you@company.com"
                  required
                  className="h-12 rounded-2xl border-white/70 pl-11"
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
