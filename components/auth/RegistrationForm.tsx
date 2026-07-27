"use client";

import { useState } from "react";
import { trpc } from "@/lib/core/trpc";
import { signIn } from "next-auth/react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Loader2, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function RegistrationForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);

  const registerMutation = trpc.users.register.useMutation({
    onSuccess: async (_, variables) => {
      // Auto-login to establish session for linking
      const result = await signIn("credentials", {
        userIdentifier: variables.username,
        password: variables.password,
        redirect: false,
      });

      if (result?.error) {
        setError("Account created but auto-login failed. Please sign in manually.");
      } else {
        setStep(2);
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    registerMutation.mutate(formData);
  };

  if (step === 2) {
    return (
      <div className="surface-card animate-fadeIn space-y-8 rounded-[2rem] border px-6 py-8 text-center sm:px-8">
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-success/10 text-success">
            <CheckCircle2 size={42} />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-foreground">
            Account created
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">
            Your local account is ready. Link Google or Autodesk to sign in with them later.
          </p>
        </div>

        <div className="space-y-4 pt-2">
          <p className="text-sm font-semibold text-muted-foreground">Link accounts</p>
          <div className="grid gap-4">
            <Button
              variant="outline"
              className="h-[3.25rem] justify-start gap-4 rounded-2xl"
              onClick={() => signIn("google", { callbackUrl: window.location.href })}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white dark:bg-zinc-900">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <span>Link Google Workspace</span>
            </Button>

            <Button
              variant="outline"
              className="h-[3.25rem] justify-start gap-4 rounded-2xl"
              onClick={() => signIn("autodesk", { callbackUrl: window.location.href })}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CheckCircle2 size={16} />
              </div>
              <span>Link Autodesk APS</span>
            </Button>
          </div>
        </div>

        <Button className="mt-2 w-full rounded-2xl" onClick={() => router.push("/login")}>
          Back to login <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    );
  }

  return (
    <div className="surface-card animate-fadeIn space-y-6 rounded-[2rem] border px-6 py-8 sm:px-8">
      <div className="space-y-3">
        <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-foreground">
          Create your account
        </h2>
        <p className="text-sm leading-7 text-muted-foreground">
          Start with a local profile, then connect the services your BIM operations rely on.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/90 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 p-4 text-sm">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="ml-1 text-sm font-semibold text-foreground/80">Full name</label>
          <Input
            placeholder="John Doe"
            required
            className="h-12 rounded-2xl border-input"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="ml-1 text-sm font-semibold text-foreground/80">Username</label>
            <Input
              placeholder="jdoe"
              required
              className="h-12 rounded-2xl border-input"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="ml-1 text-sm font-semibold text-foreground/80">Email</label>
            <Input
              type="email"
              placeholder="john@example.com"
              required
              className="h-12 rounded-2xl border-input"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="ml-1 text-sm font-semibold text-foreground/80">Password</label>
          <Input
            type="password"
            placeholder="At least 6 characters"
            required
            className="h-12 rounded-2xl border-input"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />
        </div>

        <Button
          type="submit"
          disabled={registerMutation.isPending}
          className="mt-2 h-12 w-full rounded-2xl font-semibold text-base"
        >
          {registerMutation.isPending ? (
            <>
              <Loader2 className="mr-2 animate-spin" />
              Creating account
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary hover:text-primary/80">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
