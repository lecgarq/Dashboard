"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useDashboardAuth } from "@/components/providers/dashboard-auth-provider";

const DISMISSED_KEY = "credentials_banner_dismissed";

export function CredentialsBanner() {
  const { status, hasCredentials } = useDashboardAuth();
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    const wasDismissed = sessionStorage.getItem(DISMISSED_KEY) === "true";
    setDismissed(wasDismissed);
  }, []);

  if (status !== "authenticated") return null;
  if (hasCredentials) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-500/10 border-b border-blue-500/20 text-blue-600 dark:text-blue-400 text-sm">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span className="flex-1">
        Your account was created via OAuth. Add a username and password for local access.
      </span>
      <Link
        href="/account/setup"
        className="shrink-0 font-semibold underline-offset-2 hover:underline"
      >
        Set Up Credentials →
      </Link>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="shrink-0 ml-2 text-blue-400 hover:text-blue-600 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}
