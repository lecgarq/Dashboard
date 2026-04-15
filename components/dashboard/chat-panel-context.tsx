// components/dashboard/chat-panel-context.tsx
"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";

type SpaceSelection = {
  spaceName: string;
  displayName: string;
  avatarUrl?: string | null;
  subtitle?: string | null;
  spaceType?: string | null;
  counterpartEmail?: string | null;
};

type View = { type: "spaces" } | ({ type: "conversation" } & SpaceSelection);

type ChatPanelContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  view: View;
  setView: (view: View) => void;
  navigateTo: (spaceName: string, displayName: string) => void;
};

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null);

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ type: "spaces" });

  const navigateTo = useCallback((spaceName: string, displayName: string) => {
    setView({ type: "conversation", spaceName, displayName });
    setOpen(true);
  }, []);

  const value = useMemo<ChatPanelContextValue>(
    () => ({ open, setOpen, view, setView, navigateTo }),
    [open, view, navigateTo]
  );

  return <ChatPanelContext.Provider value={value}>{children}</ChatPanelContext.Provider>;
}

export function useChatPanel() {
  const context = useContext(ChatPanelContext);
  if (!context) {
    throw new Error("useChatPanel must be used within ChatPanelProvider");
  }
  return context;
}

export type { View as ChatPanelView, SpaceSelection };
