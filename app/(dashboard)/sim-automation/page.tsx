"use client";

import { ModuleDocumentationPage } from "@/components/modules/ModuleDocumentationPage";

export default function SimAutomationPage() {
  return (
    <ModuleDocumentationPage
      module="sim"
      streamUrl="/api/sim-updates"
      title="Sim Automation"
    />
  );
}
