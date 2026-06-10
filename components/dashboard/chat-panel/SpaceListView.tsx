"use client";

import { Loader2 } from "lucide-react";
import { type SpaceSelection } from "@/components/dashboard/chat-panel-context";
import { trpc } from "@/lib/core/trpc";
import { cn } from "@/lib/core/utils";
import {
  ChatAvatar,
  ChatStateCard,
  DrawerHeader,
  ReconnectGooglePrompt,
} from "./ChatChrome";
import { formatListTime, startGoogleChatSignIn } from "./helpers";

export function SpaceListView({
  open,
  onClose,
  onSelectSpace,
  getUnreadCount,
}: {
  open: boolean;
  onClose: () => void;
  onSelectSpace: (space: SpaceSelection) => void;
  getUnreadCount?: (spaceName: string) => number;
}) {
  const { data, error, isLoading } = trpc.chat.getSpaces.useQuery(undefined, {
    enabled: open,
    staleTime: 30_000,
    retry: false,
  });

  const spaces = data?.status === "ok" ? data.spaces : [];
  const spacesError = error?.message ?? (data?.status === "error" ? data.message : null);

  // Collect counterpart emails for presence lookup
  const dmEmails = spaces
    .filter((s) => s.spaceType === "DIRECT_MESSAGE" && s.counterpartEmail)
    .map((s) => s.counterpartEmail as string);

  const { data: presenceData } = trpc.chat.getPresence.useQuery(
    { emails: dmEmails },
    { enabled: open && dmEmails.length > 0, refetchInterval: 60000 }
  );

  return (
    <>
      <DrawerHeader
        title="Google Chat"
        subtitle="Direct messages and spaces"
        onClose={onClose}
      />
      <div className="border-b border-border bg-white px-4 py-3">
        <div className="rounded-full bg-muted px-4 py-2 text-xs text-muted-foreground">
          Conversations sync from your Google Chat account
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-muted/40 px-2 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : data?.status === "not_linked" ? (
          <div className="h-full">
            <ChatStateCard
              title="Link Google"
              description={data.message ?? "Link your Google Chat account to use Google Chat."}
              actionLabel="Link Google Chat"
              actionOnClick={() => startGoogleChatSignIn(true)}
            />
          </div>
        ) : data?.status === "reconnect_required" ? (
          <ReconnectGooglePrompt message={data.message} />
        ) : spacesError ? (
          <ChatStateCard
            title="Google Chat is unavailable"
            description={spacesError}
            actionLabel="Open Google Chat"
            actionHref="https://chat.google.com"
          />
        ) : spaces.length === 0 ? (
          <ChatStateCard
            title="No chat spaces found"
            description="Google Chat returned zero spaces for this account."
            actionLabel="Open Google Chat"
            actionHref="https://chat.google.com"
          />
        ) : (
          <div className="space-y-1">
            {spaces.map((space) => {
              const unread = getUnreadCount?.(space.name) ?? 0;
              return (
                <button
                  key={space.name}
                  onClick={() =>
                    onSelectSpace({
                      spaceName: space.name,
                      displayName: space.displayName,
                      avatarUrl: space.avatarUrl,
                      subtitle: space.subtitle,
                      spaceType: space.spaceType,
                      counterpartEmail: space.counterpartEmail,
                    })
                  }
                  className={cn(
                    "w-full rounded-2xl border border-transparent px-3 py-3 text-left transition-all",
                    "hover:border-[#d2e3fc] hover:bg-white hover:shadow-sm",
                    unread > 0
                      ? "bg-white border-[#d2e3fc] shadow-sm"
                      : "bg-white/70"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <ChatAvatar
                        name={space.displayName}
                        avatarUrl={space.avatarUrl}
                        spaceType={space.spaceType}
                        className="h-11 w-11 text-sm"
                        presence={
                          space.spaceType === "DIRECT_MESSAGE" && space.counterpartEmail && presenceData
                            ? presenceData[space.counterpartEmail]
                              ? "in_meeting"
                              : "active"
                            : undefined
                        }
                        presenceSize="md"
                      />
                      {unread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#1a73e8] text-white text-[10px] font-bold leading-none shadow">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <p
                          className={cn(
                            "flex-1 truncate text-sm text-foreground",
                            unread > 0 ? "font-bold" : "font-semibold"
                          )}
                        >
                          {space.displayName}
                        </p>
                        {space.lastMessageTime ? (
                          <span
                            className={cn(
                              "shrink-0 text-[11px]",
                              unread > 0
                                ? "text-[#1a73e8] font-semibold"
                                : "text-muted-foreground"
                            )}
                          >
                            {formatListTime(space.lastMessageTime)}
                          </span>
                        ) : null}
                      </div>
                      <p
                        className={cn(
                          "truncate text-[12px]",
                          unread > 0
                            ? "text-foreground font-medium"
                            : "text-muted-foreground"
                        )}
                      >
                        {space.previewText ?? space.subtitle ?? "Conversation"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
