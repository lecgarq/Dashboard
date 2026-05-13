"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { UsersDirectoryClient } from "../UsersDirectoryClient";
import { trpc } from "@/lib/core/trpc";
import { useAccessAnalysis } from "./AccessAnalysisContext";
import { CHANGE_STREAM_META } from "@/lib/acc/accessAnalysisTypes";

export function DirectoryAccordion() {
  const { isDirectoryOpen, setDirectoryOpen, directoryFilter, setDirectoryFilter } = useAccessAnalysis();
  const kpiQuery = trpc.accMembers.getKpiSummary.useQuery({ window: "all" }, { staleTime: 300_000 });
  const memberCount = kpiQuery.data?.members.value ?? 0;

  return (
    <div id="directory-accordion">
      <Accordion
        type="single"
        collapsible
        value={isDirectoryOpen ? "directory" : ""}
        onValueChange={(v) => setDirectoryOpen(v === "directory")}
      >
        <AccordionItem value="directory">
          <AccordionTrigger className="text-base">
            <span className="flex items-center gap-3">
              Browse all {memberCount.toLocaleString()} members
              {directoryFilter ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal normal-case">
                  Filtered: {CHANGE_STREAM_META[directoryFilter.stream].label}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDirectoryFilter(null);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Clear filter"
                  >
                    ×
                  </button>
                </span>
              ) : null}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <UsersDirectoryClient />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
