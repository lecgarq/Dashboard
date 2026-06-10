"use client";

import { useCallback, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { useDashboardAuth } from "@/components/providers/dashboard-auth-provider";
import { useChatPanel } from "@/components/dashboard/chat-panel-context";
import { cn } from "@/lib/core/utils";
import { PanelErrorBoundary } from "@/components/ui/panel-error-boundary";
import { LinkGooglePrompt } from "./chat-panel/ChatChrome";
import { ConversationView } from "./chat-panel/ConversationView";
import { SpaceListView } from "./chat-panel/SpaceListView";

export function ChatPanel({
  unreadSpaceCount = 0,
  getUnreadCount,
  clearUnread,
}: {
  unreadSpaceCount?: number;
  getUnreadCount?: (spaceName: string) => number;
  clearUnread?: (spaceName: string) => void;
}) {
  const { open, setOpen, view, setView } = useChatPanel();
  const { hasGoogleChat } = useDashboardAuth();

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => setView({ type: "spaces" }), 300);
  }, [setOpen, setView]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  return (
    <PanelErrorBoundary label="chat-panel">
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full shadow-2xl",
          "flex items-center justify-center transition-all duration-200",
          "bg-[#1a73e8] text-white hover:scale-110 hover:bg-[#1557b0]",
          open && "pointer-events-none opacity-0"
        )}
        title="Open Google Chat"
      >
        <MessageCircle size={20} />
        {unreadSpaceCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold leading-none shadow-md">
            {unreadSpaceCount > 9 ? "9+" : unreadSpaceCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/30 transition-opacity"
          onClick={close}
        />
      )}

      <div
        className={cn(
          "fixed top-0 right-0 z-[70] h-full w-[400px] max-w-[90vw]",
          "bg-card border-l border-border shadow-2xl",
          "flex flex-col transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)",
          open ? "translate-x-0" : "translate-x-full shadow-none"
        )}
      >
        {!hasGoogleChat ? (
          <LinkGooglePrompt onClose={close} />
        ) : view.type === "spaces" ? (
          <SpaceListView
            open={open}
            onClose={close}
            getUnreadCount={getUnreadCount}
            onSelectSpace={(space) => {
              setView({ type: "conversation", ...space });
              clearUnread?.(space.spaceName);
            }}
          />
        ) : (
          <ConversationView
            spaceName={view.spaceName}
            displayName={view.displayName}
            avatarUrl={view.avatarUrl}
            subtitle={view.subtitle}
            spaceType={view.spaceType}
            counterpartEmail={view.counterpartEmail}
            onBack={() => setView({ type: "spaces" })}
            onClose={close}
          />
        )}
      </div>
    </PanelErrorBoundary>
  );
}
