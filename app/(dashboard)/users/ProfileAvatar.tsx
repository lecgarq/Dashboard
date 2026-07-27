"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/core/utils";
import { getInitials } from "./getInitials";

export function ProfileAvatar({
  name,
  email,
  photoUrl,
  size = "lg",
  external = false,
}: {
  name?: string | null;
  email: string;
  photoUrl?: string | null;
  size?: "sm" | "default" | "lg";
  /** External collaborator — tints the avatar fill sky to stand out from org users. */
  external?: boolean;
}): React.JSX.Element {
  return (
    <Avatar
      size={size}
      className={cn("shrink-0 border", external ? "border-sky-500/50" : "border-border/40")}
    >
      {photoUrl ? (
        <AvatarImage src={photoUrl} alt={name || email} referrerPolicy="no-referrer" />
      ) : null}
      <AvatarFallback
        className={cn(
          "text-xs font-semibold uppercase",
          external && "bg-sky-500/15 text-sky-400",
        )}
      >
        {getInitials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
