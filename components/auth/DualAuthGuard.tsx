"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { HardDrive, X } from "lucide-react";
import { Button } from "../ui/button";
import { useDashboardAuth } from "@/components/providers/dashboard-auth-provider";

const DISMISS_KEY = "bim-autodesk-banner-dismissed";

export function DualAuthGuard({ children }: { children: React.ReactNode }) {
  const { status, hasAutodesk } = useDashboardAuth();
  const [dismissed, setDismissed] = useState(true); // start true to avoid flash

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  }

  const showBanner = status !== "loading" && !hasAutodesk && !dismissed;

  return (
    <>
      {showBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm text-amber-950 shadow-md">
          <div className="flex items-center gap-2">
            <HardDrive size={16} className="shrink-0" />
            <span>
              <strong>Autodesk APS not linked.</strong> Link it to access BIM viewer features.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-amber-700 bg-transparent text-amber-950 hover:bg-amber-600"
              onClick={() => signIn("autodesk", { callbackUrl: window.location.href })}
            >
              Link Autodesk
            </Button>
            <button
              onClick={dismiss}
              className="rounded p-0.5 hover:bg-amber-600 transition-colors"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
