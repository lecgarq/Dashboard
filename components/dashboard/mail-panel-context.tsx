// components/dashboard/mail-panel-context.tsx
"use client";

import { createContext, useContext, useState, useMemo, type ReactNode } from "react";

type ComposeSeed = {
  mode: "new" | "reply" | "forward";
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
};

type View =
  | { type: "inbox" }
  | { type: "message"; id: string }
  | { type: "compose"; seed?: ComposeSeed };

type MailPanelContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  view: View;
  setView: (view: View) => void;
};

const MailPanelContext = createContext<MailPanelContextValue | null>(null);

export function MailPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ type: "inbox" });

  const value = useMemo<MailPanelContextValue>(
    () => ({ open, setOpen, view, setView }),
    [open, view]
  );

  return <MailPanelContext.Provider value={value}>{children}</MailPanelContext.Provider>;
}

export function useMailPanel() {
  const context = useContext(MailPanelContext);
  if (!context) {
    throw new Error("useMailPanel must be used within MailPanelProvider");
  }
  return context;
}

export type { ComposeSeed };
