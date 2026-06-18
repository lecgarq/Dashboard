"use client";

/**
 * PersonAvatar — avatar component for OrgPerson display.
 *
 * Extracted from PersonDetailModal.tsx to break the circular import
 * PersonDetailModal ↔ UserProfilePanel (PersonDetailModal dynamically imports
 * UserProfilePanel; UserProfilePanel needed PersonAvatar — causing a cycle).
 *
 * Both PersonDetailModal and UserProfilePanel import from this file.
 */

import { cn } from "@/lib/core/utils";
import type { OrgPerson } from "./directoryUtils";

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
