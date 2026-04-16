// components/dashboard/MailService.tsx
"use client";

import { useMailPanel } from "./mail-panel-context";
import { useMailNotifications } from "@/hooks/use-mail-notifications";
import { Mail } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { MailPanel } from "./MailPanel";

export function MailService() {
  const { open, setOpen } = useMailPanel();
  const { unreadCount } = useMailNotifications(true); // Always enabled for the dashboard

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 left-5 z-50 w-12 h-12 rounded-full shadow-2xl",
          "flex items-center justify-center transition-all duration-200",
          "bg-slate-900 border border-slate-800 text-white hover:scale-110 hover:bg-slate-800",
          open && "pointer-events-none opacity-0"
        )}
        title="Open Mail"
      >
        <Mail size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-[11px] font-bold leading-none shadow-md">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <MailPanel />
    </>
  );
}
