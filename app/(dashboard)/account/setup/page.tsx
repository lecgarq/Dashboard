"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/core/trpc";

export default function AccountSetupPage() {
  const { data: session, update: updateSession, status } = useSession();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Redirect away if already has credentials
  useEffect(() => {
    if (status === "authenticated" && session?.user?.hasCredentials) {
      router.replace("/");
    }
  }, [status, session, router]);

  const setupCredentials = trpc.users.setupCredentials.useMutation({
    onSuccess: async () => {
      await updateSession();
      router.push("/");
    },
    onError: (err) => {
      setError(err.message);
      setLoading(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setupCredentials.mutate({ username: username.trim().toLowerCase(), password });
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-6">
      <div className="w-full max-w-[440px] space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Set Up Local Credentials</h1>
          <p className="text-sm text-muted-foreground">
            Your account was created via OAuth. Add a username and password so you can also sign
            in with local credentials.
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-3 rounded-lg flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="username">
              Username <span className="text-muted-foreground text-xs">(min. 3 chars)</span>
            </label>
            <input
              id="username"
              type="text"
              placeholder="Choose a username"
              required
              minLength={3}
              className="w-full h-12 px-4 rounded-xl bg-card border border-border/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="password">
              Password <span className="text-muted-foreground text-xs">(min. 6 chars)</span>
            </label>
            <input
              id="password"
              type="password"
              placeholder="New password"
              required
              minLength={6}
              className="w-full h-12 px-4 rounded-xl bg-card border border-border/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="confirmPassword">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="Confirm password"
              required
              className="w-full h-12 px-4 rounded-xl bg-card border border-border/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 transition-all disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Credentials"}
          </button>
        </form>
      </div>
    </div>
  );
}
