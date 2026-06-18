"use client";

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden as VisuallyHiddenPrimitive } from "radix-ui";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Building2,
  Briefcase,
  Phone,
  DollarSign,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/core/utils";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { OrgPerson } from "./directoryUtils";

// ---------------------------------------------------------------------------
// UserProfilePanel dynamic import — modal is its only consumer in this module
// ---------------------------------------------------------------------------

const UserProfilePanel = dynamic<{
  user: BulkAccUser | null;
  email: string;
  variant?: "dialog" | "rail";
}>(
  () => import("./UserProfilePanel").then((m) => m.UserProfilePanel),
  { ssr: false, loading: () => <div className="mt-5 h-24 rounded-xl bg-muted/20" /> },
);

// ---------------------------------------------------------------------------
// Sub-components (moved verbatim from UsersDirectoryClient.tsx)
// ---------------------------------------------------------------------------

export function PersonAvatar({
  person,
  size = "lg",
}: {
  person: OrgPerson;
  size?: "sm" | "md" | "lg";
}) {
  const dim = {
    sm: "w-9 h-9 text-xs",
    md: "w-12 h-12 text-base",
    lg: "w-20 h-20 text-2xl",
  }[size];

  const initials = person.displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  if (person.photoUrl) {
    return (
      <img
        src={person.photoUrl}
        alt={person.displayName}
        referrerPolicy="no-referrer"
        className={cn("rounded-full object-cover ring-2 ring-primary/20 shrink-0", dim)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br from-primary to-chart-4 flex items-center justify-center ring-2 ring-primary/20 font-bold text-white shrink-0",
        dim
      )}
    >
      {initials || "?"}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); copy(); }}
      className="opacity-0 group-hover/row:opacity-100 hover:text-primary transition-all"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  );
}

function InfoRow({
  icon: Icon,
  children,
  href,
  copyText,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  href?: string;
  copyText?: string;
}) {
  const content = href ? (
    <a
      href={href}
      className="hover:text-primary truncate transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  ) : (
    <span className="truncate">{children}</span>
  );

  return (
    <div className="group/row flex items-center gap-2 text-muted-foreground text-sm">
      <Icon size={13} className="shrink-0 text-primary/50" />
      {content}
      {copyText && <CopyButton text={copyText} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PersonDetailModal — centered shadcn Dialog profile modal
// ---------------------------------------------------------------------------

export function PersonDetailModal({
  person,
  accUser,
  open,
  onOpenChange,
}: {
  person: OrgPerson | null;
  accUser: BulkAccUser | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!person) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex flex-col max-w-3xl w-[90vw] bg-card border-border/50 text-foreground p-0 overflow-hidden shadow-2xl shadow-black/20"
        style={{ resize: "both", minWidth: 380, minHeight: 400, maxHeight: "90vh" }}
      >
        <VisuallyHiddenPrimitive.Root>
          <DialogTitle>{person.displayName}</DialogTitle>
        </VisuallyHiddenPrimitive.Root>

        {/* Header banner */}
        <div className="h-20 bg-gradient-to-br from-primary/25 via-chart-4/15 to-primary/8 relative shrink-0">
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
            <PersonAvatar person={person} size="lg" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="pt-12 pb-6 px-6">
            <div className="text-center mb-5">
              <h2 className="text-lg font-bold">{person.displayName}</h2>
              {person.jobTitle && (
                <p className="text-sm text-muted-foreground mt-0.5">{person.jobTitle}</p>
              )}
            </div>

            {/* Tags */}
            <div className="flex flex-wrap justify-center gap-1.5 mb-5">
              {person.department && (
                <Badge variant="secondary" className="text-[11px] gap-1">
                  <Building2 size={10} />
                  {person.department}
                </Badge>
              )}
              {person.costCenter && (
                <Badge variant="secondary" className="text-[11px] gap-1">
                  <DollarSign size={10} />
                  {person.costCenter}
                </Badge>
              )}
            </div>

            <div className="space-y-3 pt-4 border-t border-border/30">
              <InfoRow icon={Mail} href={`mailto:${person.email}`} copyText={person.email}>
                {person.email}
              </InfoRow>
              {person.department && (
                <InfoRow icon={Building2}>{person.department}</InfoRow>
              )}
              {person.jobTitle && (
                <InfoRow icon={Briefcase}>{person.jobTitle}</InfoRow>
              )}
              {person.costCenter && (
                <InfoRow icon={DollarSign}>{person.costCenter}</InfoRow>
              )}
              {person.phoneNumber && (
                <InfoRow icon={Phone} href={`tel:${person.phoneNumber}`} copyText={person.phoneNumber}>
                  {person.phoneNumber}
                </InfoRow>
              )}
            </div>

            {/* Autodesk ACC profile section */}
            <UserProfilePanel user={accUser} email={person.email} variant="dialog" />

            {/* Quick actions */}
            <div className="flex gap-2 mt-5 pt-4 border-t border-border/30">
              <a
                href={`mailto:${person.email}`}
                className="flex-1 flex items-center justify-center gap-2 text-xs font-medium py-2.5 rounded-xl bg-primary/8 text-primary hover:bg-primary/15 border border-primary/10 transition-all"
              >
                <Mail size={13} />
                Email
              </a>
              {person.phoneNumber && (
                <a
                  href={`tel:${person.phoneNumber}`}
                  className="flex-1 flex items-center justify-center gap-2 text-xs font-medium py-2.5 rounded-xl bg-primary/8 text-primary hover:bg-primary/15 border border-primary/10 transition-all"
                >
                  <Phone size={13} />
                  Call
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Resize handle hint */}
        <div className="absolute bottom-1 right-1 pointer-events-none opacity-20">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M11 1v10H1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M11 5v6H5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M11 9v2H9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
      </DialogContent>
    </Dialog>
  );
}
