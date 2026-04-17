"use client";

import { ModuleDocumentationPage } from "@/components/modules/ModuleDocumentationPage";

export default function ClashDetectionPage() {
  return (
    <ModuleDocumentationPage
      module="clash"
      streamUrl="/api/clash-updates"
      title="Clash Detection"
    />
  );
}
