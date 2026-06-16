"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "./getInitials";

export function ProfileAvatar({
  name,
  email,
  photoUrl,
  size = "lg",
}: {
  name?: string | null;
  email: string;
  photoUrl?: string | null;
  size?: "sm" | "default" | "lg";
}): React.JSX.Element {
  return (
    <Avatar size={size} className="shrink-0 border border-border/40">
      {photoUrl ? (
        <AvatarImage src={photoUrl} alt={name || email} referrerPolicy="no-referrer" />
      ) : null}
      <AvatarFallback className="text-xs font-semibold uppercase">
        {getInitials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
