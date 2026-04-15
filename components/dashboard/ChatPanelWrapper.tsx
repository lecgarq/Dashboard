// components/dashboard/ChatPanelWrapper.tsx
"use client";

import dynamic from "next/dynamic";
import { ChatPanelProvider } from "@/components/dashboard/chat-panel-context";
import { useDashboardAuth } from "@/components/providers/dashboard-auth-provider";
import { useChatNotifications } from "@/hooks/use-chat-notifications";

const ChatPanel = dynamic(
  () => import("@/components/dashboard/ChatPanel").then((m) => m.ChatPanel),
  { ssr: false }
);

function ChatPanelInner() {
  const { hasGoogleChat } = useDashboardAuth();
  const { unreadSpaceCount, getUnreadCount, clearUnread } = useChatNotifications(hasGoogleChat);

  return (
    <ChatPanel
      unreadSpaceCount={unreadSpaceCount}
      getUnreadCount={getUnreadCount}
      clearUnread={clearUnread}
    />
  );
}

export function ChatPanelWrapper() {
  return (
    <ChatPanelProvider>
      <ChatPanelInner />
    </ChatPanelProvider>
  );
}
