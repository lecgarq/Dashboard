"use client";

import { type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Link2,
  MessageCircle,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/core/utils";
import { startGoogleChatSignIn, type PresenceStatus } from "./helpers";

export function LinkGooglePrompt({ onClose }: { onClose: () => void }) {
  return (
    <>
      <DrawerHeader
        title="Google Chat"
        subtitle="Link Chat to open your conversations here."
        onClose={onClose}
      />
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <MessageCircle size={48} className="text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          Link your Google Chat account to use Chat.
        </p>
        <button
          onClick={() => startGoogleChatSignIn(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Link2 size={14} />
          Link Google Account
        </button>
      </div>
    </>
  );
}

export function DrawerHeader({
  title,
  subtitle,
  leading,
  onClose,
  onBack,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="min-h-16 flex items-center gap-3 px-4 border-b border-border bg-white shrink-0">
      <div className="flex items-center gap-2 shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            title="Go back"
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        {leading}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold truncate">{title}</h2>
        {subtitle ? (
          <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onClose}
          title="Close chat"
          className="p-1.5 rounded-full hover:bg-muted transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function PresenceDot({ status, size = "sm" }: { status: PresenceStatus; size?: "sm" | "md" }) {
  const dotSize = size === "md" ? "w-3 h-3" : "w-2.5 h-2.5";
  const borderSize = size === "md" ? "border-[2px]" : "border-[1.5px]";
  const position = size === "md" ? "-bottom-0.5 -right-0.5" : "-bottom-px -right-px";

  const color = {
    active: "bg-emerald-500",
    in_meeting: "bg-red-500",
    offline: "bg-gray-400",
  }[status];

  return (
    <span
      className={cn(
        "absolute block rounded-full border-white",
        dotSize,
        borderSize,
        position,
        color
      )}
      title={
        status === "active"
          ? "Active"
          : status === "in_meeting"
            ? "In a meeting"
            : "Offline"
      }
    />
  );
}

export function ChatAvatar({
  name,
  avatarUrl,
  spaceType,
  className,
  presence,
  presenceSize,
}: {
  name: string;
  avatarUrl?: string | null;
  spaceType?: string | null;
  className?: string;
  presence?: PresenceStatus | null;
  presenceSize?: "sm" | "md";
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const isDirectMessage = spaceType === "DIRECT_MESSAGE";

  return (
    <div
      className={cn(
        "relative shrink-0",
        className
      )}
    >
      <div className="h-full w-full overflow-hidden rounded-full bg-[#e8f0fe] text-[#1a73e8] flex items-center justify-center font-semibold">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : isDirectMessage ? (
          <span>{initial}</span>
        ) : (
          <Users size={18} />
        )}
      </div>
      {presence && <PresenceDot status={presence} size={presenceSize} />}
    </div>
  );
}

export function ChatStateCard({
  title,
  description,
  actionLabel,
  actionHref,
  actionOnClick,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionHref?: string;
  actionOnClick?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center p-6 h-full">
      <AlertTriangle size={32} className="text-muted-foreground/40" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {actionHref ? (
        <a
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Link2 size={14} />
          {actionLabel}
        </a>
      ) : (
        <button
          onClick={actionOnClick}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Link2 size={14} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ReconnectGooglePrompt({ message }: { message?: string }) {
  return (
    <ChatStateCard
      title="Reconnect Google"
      description={message ?? "The linked Google account is missing Chat permissions."}
      actionLabel="Reconnect Google"
      actionOnClick={() => startGoogleChatSignIn(true)}
    />
  );
}
