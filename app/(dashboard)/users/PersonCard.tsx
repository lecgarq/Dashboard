"use client";

import { Building2, Briefcase, DollarSign, Phone } from "lucide-react";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { OrgPerson } from "./directoryUtils";
import { PersonAvatar } from "./PersonDetailModal";
import { AccBadge } from "./DirectoryPills";

// ---------------------------------------------------------------------------
// PersonCard — grid-view card for the /users directory.
// Moved from UsersDirectoryClient (USR-01 decomposition, Wave 6).
// ---------------------------------------------------------------------------
export function PersonCard({
  person,
  accSummary,
  onClick,
}: {
  person: OrgPerson;
  accSummary?: BulkAccUser;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left p-4 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start gap-3">
        <PersonAvatar person={person} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate leading-tight">
            {person.displayName}
          </p>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {person.email}
          </p>
        </div>
      </div>
      <div className="mt-2.5 space-y-1">
        {person.department && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Building2 size={10} className="shrink-0" />
            <span className="truncate">{person.department}</span>
          </div>
        )}
        {person.jobTitle && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Briefcase size={10} className="shrink-0" />
            <span className="truncate">{person.jobTitle}</span>
          </div>
        )}
        {person.costCenter && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <DollarSign size={10} className="shrink-0" />
            <span className="truncate">{person.costCenter}</span>
          </div>
        )}
        {person.phoneNumber && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Phone size={10} className="shrink-0" />
            <span className="truncate">{person.phoneNumber}</span>
          </div>
        )}
      </div>
      <div className="mt-2.5">
        <AccBadge summary={accSummary} />
      </div>
    </button>
  );
}
