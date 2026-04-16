// components/dashboard/MailPanelWrapper.tsx
"use client";

import dynamic from "next/dynamic";
import { MailPanelProvider } from "@/components/dashboard/mail-panel-context";

const MailService = dynamic(
  () => import("@/components/dashboard/MailService").then((m) => m.MailService),
  { ssr: false }
);

export function MailPanelWrapper() {
  return (
    <MailPanelProvider>
      <MailService />
    </MailPanelProvider>
  );
}
