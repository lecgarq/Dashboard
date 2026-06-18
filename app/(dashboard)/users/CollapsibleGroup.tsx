"use client";

// ---------------------------------------------------------------------------
// CollapsibleGroup.tsx — group-by collapsible header for the /users directory
//
// Extracted from UsersDirectoryClient.tsx (USR-01 decomposition, Wave 2).
// No logic changes — this is a pure move.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";

export function CollapsibleGroup({
  label,
  count,
  children,
  defaultOpen = true,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 mb-2 group"
      >
        {open ? (
          <ChevronDown size={14} className="text-primary" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
        )}
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {count}
        </Badge>
      </button>
      {open && children}
    </div>
  );
}
