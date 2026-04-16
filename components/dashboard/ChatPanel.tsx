"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  Send,
  Users,
  X,
} from "lucide-react";
import type { ChatAttachment } from "@/lib/google-chat";
import { useDashboardAuth } from "@/components/providers/dashboard-auth-provider";
import { useChatPanel, type SpaceSelection } from "@/components/dashboard/chat-panel-context";
import { startOAuthConnect } from "@/lib/oauth-connect";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// ─── Attachment helpers ──────────────────────────────────────────────────────

function getMediaProxyUrl(att: ChatAttachment): string {
  const params = new URLSearchParams({ source: att.source });
  if (att.source === "DRIVE_FILE" && att.driveFileId) {
    params.set("driveFileId", att.driveFileId);
  } else if (att.resourceName) {
    params.set("resourceName", att.resourceName);
  } else {
    params.set("name", att.name);
  }
  return `/api/chat/media?${params.toString()}`;
}

function isImage(ct: string) {
  return ct.startsWith("image/");
}
function isVideo(ct: string) {
  return ct.startsWith("video/");
}
function isPdf(ct: string) {
  return ct === "application/pdf";
}
function isGoogleDoc(ct: string) {
  return ct === "application/vnd.google-apps.document";
}
function isGoogleSheet(ct: string) {
  return ct === "application/vnd.google-apps.spreadsheet";
}
function isGoogleSlides(ct: string) {
  return ct === "application/vnd.google-apps.presentation";
}
function isGoogleWorkspace(ct: string) {
  return ct.startsWith("application/vnd.google-apps.");
}

function getGoogleWorkspaceLabel(ct: string) {
  if (isGoogleDoc(ct)) return "Google Docs";
  if (isGoogleSheet(ct)) return "Google Sheets";
  if (isGoogleSlides(ct)) return "Google Slides";
  if (ct.includes("form")) return "Google Forms";
  if (ct.includes("drawing")) return "Google Drawing";
  return "Google File";
}

function getGoogleWorkspaceIcon(ct: string) {
  if (isGoogleSheet(ct)) return FileSpreadsheet;
  if (isGoogleSlides(ct)) return Film;
  return FileText;
}

function getGoogleWorkspaceColor(ct: string) {
  if (isGoogleDoc(ct)) return "text-blue-600 bg-blue-50 border-blue-200";
  if (isGoogleSheet(ct)) return "text-green-600 bg-green-50 border-green-200";
  if (isGoogleSlides(ct)) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  return "text-purple-600 bg-purple-50 border-purple-200";
}

function MessageAttachments({
  attachments,
  own,
  onPreview,
}: {
  attachments: ChatAttachment[];
  own: boolean;
  onPreview: (att: ChatAttachment) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 mt-1.5">
      {attachments.map((att) => {
        const url = getMediaProxyUrl(att);

        // ─── Images & GIFs ───
        if (isImage(att.contentType)) {
          return (
            <button
              key={att.name}
              type="button"
              onClick={() => onPreview(att)}
              className="block rounded-lg overflow-hidden max-w-[260px] border border-black/5 cursor-pointer hover:opacity-90 transition-opacity text-left"
            >
              <img
                src={att.thumbnailUri || url}
                alt={att.contentName}
                className="w-full h-auto object-cover"
                loading="lazy"
                onError={(e) => {
                  if (e.currentTarget.src !== url) {
                    e.currentTarget.src = url;
                  }
                }}
              />
            </button>
          );
        }

        // ─── Videos ───
        if (isVideo(att.contentType)) {
          return (
            <button
              key={att.name}
              type="button"
              onClick={() => onPreview(att)}
              className="rounded-lg overflow-hidden max-w-[260px] border border-black/5 cursor-pointer hover:opacity-90 transition-opacity relative group"
            >
              <video
                src={url}
                preload="metadata"
                className="w-full h-auto pointer-events-none"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                  <Film size={18} className="text-gray-800 ml-0.5" />
                </div>
              </div>
            </button>
          );
        }

        // ─── PDFs ───
        if (isPdf(att.contentType)) {
          return (
            <button
              key={att.name}
              type="button"
              onClick={() => onPreview(att)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 border transition-colors text-left",
                own
                  ? "border-white/20 bg-white/10 hover:bg-white/20"
                  : "border-red-200 bg-red-50 hover:bg-red-100"
              )}
            >
              <FileText
                size={20}
                className={own ? "text-white/70" : "text-red-500"}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-xs font-medium truncate",
                    own ? "text-white" : "text-foreground"
                  )}
                >
                  {att.contentName}
                </p>
                <p
                  className={cn(
                    "text-[10px]",
                    own ? "text-white/50" : "text-muted-foreground"
                  )}
                >
                  PDF
                </p>
              </div>
              <ExternalLink
                size={12}
                className={own ? "text-white/40" : "text-muted-foreground/40"}
              />
            </button>
          );
        }

        // ─── Google Workspace files (Docs, Sheets, Slides) ───
        if (att.source === "DRIVE_FILE" && att.driveFileId) {
          const driveUrl = `https://drive.google.com/file/d/${att.driveFileId}/view`;
          const isWorkspace = isGoogleWorkspace(att.contentType);
          const Icon = isWorkspace
            ? getGoogleWorkspaceIcon(att.contentType)
            : FileText;
          const colorClass = isWorkspace
            ? getGoogleWorkspaceColor(att.contentType)
            : own
              ? ""
              : "text-gray-600 bg-gray-50 border-gray-200";
          const label = isWorkspace
            ? getGoogleWorkspaceLabel(att.contentType)
            : att.contentType.split("/").pop()?.toUpperCase() ?? "File";

          return (
            <a
              key={att.name}
              href={driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 border transition-colors",
                own
                  ? "border-white/20 bg-white/10 hover:bg-white/20"
                  : cn(colorClass, "hover:brightness-95")
              )}
            >
              <Icon
                size={20}
                className={own ? "text-white/70" : undefined}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-xs font-medium truncate",
                    own ? "text-white" : "text-foreground"
                  )}
                >
                  {att.contentName}
                </p>
                <p
                  className={cn(
                    "text-[10px]",
                    own ? "text-white/50" : "text-muted-foreground"
                  )}
                >
                  {label}
                </p>
              </div>
              <ExternalLink
                size={12}
                className={own ? "text-white/40" : "text-muted-foreground/40"}
              />
            </a>
          );
        }

        // ─── Generic file fallback ───
        return (
          <a
            key={att.name}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3 py-2.5 border transition-colors",
              own
                ? "border-white/20 bg-white/10 hover:bg-white/20"
                : "border-border bg-muted/50 hover:bg-muted"
            )}
          >
            <Paperclip
              size={16}
              className={own ? "text-white/70" : "text-muted-foreground"}
            />
            <p
              className={cn(
                "text-xs font-medium truncate flex-1 min-w-0",
                own ? "text-white" : "text-foreground"
              )}
            >
              {att.contentName}
            </p>
            <ExternalLink
              size={12}
              className={own ? "text-white/40" : "text-muted-foreground/40"}
            />
          </a>
        );
      })}
    </div>
  );
}

// ─── Media Preview Modal ────────────────────────────────────────────────────

function MediaPreviewModal({
  attachment,
  allPreviewable,
  onClose,
  onNavigate,
}: {
  attachment: ChatAttachment;
  allPreviewable: ChatAttachment[];
  onClose: () => void;
  onNavigate: (att: ChatAttachment) => void;
}) {
  const url = getMediaProxyUrl(attachment);
  const currentIndex = allPreviewable.findIndex((a) => a.name === attachment.name);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allPreviewable.length - 1;
  const isImg = isImage(attachment.contentType);

  // Zoom & pan state (images only)
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  // Reset zoom/pan on navigate
  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [attachment.name]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(allPreviewable[currentIndex - 1]);
      if (e.key === "ArrowRight" && hasNext) onNavigate(allPreviewable[currentIndex + 1]);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [attachment.name, hasPrev, hasNext, onClose, onNavigate, currentIndex, allPreviewable]);

  // Scroll-wheel zoom (images)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isImg) return;
    e.preventDefault();
    e.stopPropagation();
    setScale((prev) => Math.min(8, Math.max(0.5, prev - e.deltaY * 0.002)));
  }, [isImg]);

  // Middle-click pan (images)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isImg || scale <= 1) return;
    // middle button (1) or left button (0) when zoomed
    if (e.button === 1 || (e.button === 0 && scale > 1)) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { ...pan };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, [isImg, scale, pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    setPan({
      x: panOrigin.current.x + (e.clientX - panStart.current.x),
      y: panOrigin.current.y + (e.clientY - panStart.current.y),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Double-click to reset zoom
  const handleDoubleClick = useCallback(() => {
    if (!isImg) return;
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [isImg]);

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-3 z-20 bg-gradient-to-b from-black/60 to-transparent">
        <p className="text-white/90 text-sm font-medium truncate max-w-[60%]">
          {attachment.contentName}
          {isImg && scale !== 1 && (
            <span className="ml-2 text-white/50 text-xs">{Math.round(scale * 100)}%</span>
          )}
        </p>
        <div className="flex items-center gap-1">
          <a
            href={url}
            download={attachment.contentName}
            onClick={(e) => e.stopPropagation()}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white"
            title="Download"
          >
            <Download size={18} />
          </a>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Navigation arrows */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(allPreviewable[currentIndex - 1]); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        >
          <ChevronLeft size={28} />
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(allPreviewable[currentIndex + 1]); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Content */}
      <div
        className="w-screen h-screen flex items-center justify-center overflow-hidden pt-12 pb-4 px-12"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: isImg && scale > 1 ? "grab" : undefined }}
      >
        {isImg && (
          <img
            src={url}
            alt={attachment.contentName}
            className="max-w-full max-h-full object-contain select-none"
            draggable={false}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transition: isPanning.current ? "none" : "transform 0.15s ease-out",
            }}
          />
        )}
        {isVideo(attachment.contentType) && (
          <video
            src={url}
            controls
            autoPlay
            className="max-w-full max-h-full rounded-lg shadow-2xl"
          />
        )}
        {isPdf(attachment.contentType) && (
          <iframe
            src={url}
            title={attachment.contentName}
            className="w-full h-full rounded-lg shadow-2xl bg-white"
          />
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ─────────────────────────────────────────────────────────────────────────────

export function ChatPanel({
  unreadSpaceCount = 0,
  getUnreadCount,
  clearUnread,
}: {
  unreadSpaceCount?: number;
  getUnreadCount?: (spaceName: string) => number;
  clearUnread?: (spaceName: string) => void;
}) {
  const { open, setOpen, view, setView } = useChatPanel();
  const { hasGoogleChat } = useDashboardAuth();

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => setView({ type: "spaces" }), 300);
  }, [setOpen, setView]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full shadow-2xl",
          "flex items-center justify-center transition-all duration-200",
          "bg-[#1a73e8] text-white hover:scale-110 hover:bg-[#1557b0]",
          open && "pointer-events-none opacity-0"
        )}
        title="Open Google Chat"
      >
        <MessageCircle size={20} />
        {unreadSpaceCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold leading-none shadow-md">
            {unreadSpaceCount > 9 ? "9+" : unreadSpaceCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/30 transition-opacity"
          onClick={close}
        />
      )}

      <div
        className={cn(
          "fixed top-0 right-0 z-[70] h-full w-[400px] max-w-[90vw]",
          "bg-card border-l border-border shadow-2xl",
          "flex flex-col transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)",
          open ? "translate-x-0" : "translate-x-full shadow-none"
        )}
      >
        {!hasGoogleChat ? (
          <LinkGooglePrompt onClose={close} />
        ) : view.type === "spaces" ? (
          <SpaceListView
            onClose={close}
            getUnreadCount={getUnreadCount}
            onSelectSpace={(space) => {
              setView({ type: "conversation", ...space });
              clearUnread?.(space.spaceName);
            }}
          />
        ) : (
          <ConversationView
            spaceName={view.spaceName}
            displayName={view.displayName}
            avatarUrl={view.avatarUrl}
            subtitle={view.subtitle}
            spaceType={view.spaceType}
            counterpartEmail={view.counterpartEmail}
            onBack={() => setView({ type: "spaces" })}
            onClose={close}
          />
        )}
      </div>
    </>
  );
}

function startGoogleChatSignIn(forceConsent = false) {
  startOAuthConnect("google-chat", {
    callbackUrl: window.location.href,
    forceConsent,
  });
}

function LinkGooglePrompt({ onClose }: { onClose: () => void }) {
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

function DrawerHeader({
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

type PresenceStatus = "active" | "in_meeting" | "offline";

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

function ChatAvatar({
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

function formatListTime(iso?: string | null) {
  if (!iso) return null;

  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  if (diff < 6 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: "short" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ChatStateCard({
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

function ReconnectGooglePrompt({ message }: { message?: string }) {
  return (
    <ChatStateCard
      title="Reconnect Google"
      description={message ?? "The linked Google account is missing Chat permissions."}
      actionLabel="Reconnect Google"
      actionOnClick={() => startGoogleChatSignIn(true)}
    />
  );
}

function SpaceListView({
  onClose,
  onSelectSpace,
  getUnreadCount,
}: {
  onClose: () => void;
  onSelectSpace: (space: SpaceSelection) => void;
  getUnreadCount?: (spaceName: string) => number;
}) {
  const { data, error, isLoading } = trpc.chat.getSpaces.useQuery();

  const spaces = data?.status === "ok" ? data.spaces : [];
  const spacesError = error?.message ?? (data?.status === "error" ? data.message : null);

  // Collect counterpart emails for presence lookup
  const dmEmails = spaces
    .filter((s) => s.spaceType === "DIRECT_MESSAGE" && s.counterpartEmail)
    .map((s) => s.counterpartEmail as string);

  const { data: presenceData } = trpc.chat.getPresence.useQuery(
    { emails: dmEmails },
    { enabled: dmEmails.length > 0, refetchInterval: 60000 }
  );

  return (
    <>
      <DrawerHeader
        title="Google Chat"
        subtitle="Direct messages and spaces"
        onClose={onClose}
      />
      <div className="border-b border-border bg-white px-4 py-3">
        <div className="rounded-full bg-[#f1f3f4] px-4 py-2 text-xs text-muted-foreground">
          Conversations sync from your Google Chat account
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-[#f8fafd] px-2 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : data?.status === "not_linked" ? (
          <div className="h-full">
            <ChatStateCard
              title="Link Google"
              description={data.message ?? "Link your Google Chat account to use Google Chat."}
              actionLabel="Link Google Chat"
              actionOnClick={() => startGoogleChatSignIn(true)}
            />
          </div>
        ) : data?.status === "reconnect_required" ? (
          <ReconnectGooglePrompt message={data.message} />
        ) : spacesError ? (
          <ChatStateCard
            title="Google Chat is unavailable"
            description={spacesError}
            actionLabel="Open Google Chat"
            actionHref="https://chat.google.com"
          />
        ) : spaces.length === 0 ? (
          <ChatStateCard
            title="No chat spaces found"
            description="Google Chat returned zero spaces for this account."
            actionLabel="Open Google Chat"
            actionHref="https://chat.google.com"
          />
        ) : (
          <div className="space-y-1">
            {spaces.map((space) => {
              const unread = getUnreadCount?.(space.name) ?? 0;
              return (
                <button
                  key={space.name}
                  onClick={() =>
                    onSelectSpace({
                      spaceName: space.name,
                      displayName: space.displayName,
                      avatarUrl: space.avatarUrl,
                      subtitle: space.subtitle,
                      spaceType: space.spaceType,
                      counterpartEmail: space.counterpartEmail,
                    })
                  }
                  className={cn(
                    "w-full rounded-2xl border border-transparent px-3 py-3 text-left transition-all",
                    "hover:border-[#d2e3fc] hover:bg-white hover:shadow-sm",
                    unread > 0
                      ? "bg-white border-[#d2e3fc] shadow-sm"
                      : "bg-white/70"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <ChatAvatar
                        name={space.displayName}
                        avatarUrl={space.avatarUrl}
                        spaceType={space.spaceType}
                        className="h-11 w-11 text-sm"
                        presence={
                          space.spaceType === "DIRECT_MESSAGE" && space.counterpartEmail && presenceData
                            ? presenceData[space.counterpartEmail]
                              ? "in_meeting"
                              : "active"
                            : undefined
                        }
                        presenceSize="md"
                      />
                      {unread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#1a73e8] text-white text-[10px] font-bold leading-none shadow">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <p
                          className={cn(
                            "flex-1 truncate text-sm text-foreground",
                            unread > 0 ? "font-bold" : "font-semibold"
                          )}
                        >
                          {space.displayName}
                        </p>
                        {space.lastMessageTime ? (
                          <span
                            className={cn(
                              "shrink-0 text-[11px]",
                              unread > 0
                                ? "text-[#1a73e8] font-semibold"
                                : "text-muted-foreground"
                            )}
                          >
                            {formatListTime(space.lastMessageTime)}
                          </span>
                        ) : null}
                      </div>
                      <p
                        className={cn(
                          "truncate text-[12px]",
                          unread > 0
                            ? "text-foreground font-medium"
                            : "text-muted-foreground"
                        )}
                      >
                        {space.previewText ?? space.subtitle ?? "Conversation"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ─── File Upload helpers ─────────────────────────────────────────────────────

const ACCEPTED_TYPES = [
  "image/*",
  "video/*",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
].join(",");

function getFilePreviewIcon(file: File) {
  if (file.type.startsWith("image/")) return ImageIcon;
  if (file.type.startsWith("video/")) return Film;
  if (file.type === "application/pdf") return FileText;
  if (file.type.includes("spreadsheet") || file.type.includes("excel") || file.type.includes("csv"))
    return FileSpreadsheet;
  return Paperclip;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilePreviewImage({ file }: { file: File }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!previewUrl) {
    return <div className="w-[72px] h-[72px] bg-muted" />;
  }

  return (
    <img
      src={previewUrl}
      alt={file.name}
      className="w-[72px] h-[72px] object-cover"
    />
  );
}

function FilePreviewBar({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 px-1">
      {files.map((file, i) => {
        const Icon = getFilePreviewIcon(file);
        const isImg = file.type.startsWith("image/");
        return (
          <div
            key={`${file.name}-${i}`}
            className="relative group shrink-0 rounded-xl border border-border bg-muted/50 overflow-hidden"
            style={{ width: isImg ? 72 : "auto", maxWidth: 180 }}
          >
            {isImg ? (
              <FilePreviewImage file={file} />
            ) : (
              <div className="flex items-center gap-2 px-3 py-2">
                <Icon size={16} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium truncate">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={() => onRemove(i)}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={10} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ConversationView({
  spaceName,
  displayName,
  avatarUrl,
  subtitle,
  spaceType,
  counterpartEmail,
  onBack,
  onClose,
}: {
  spaceName: string;
  displayName: string;
  avatarUrl?: string | null;
  subtitle?: string | null;
  spaceType?: string | null;
  counterpartEmail?: string | null;
  onBack: () => void;
  onClose: () => void;
}) {
  const { user } = useDashboardAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewAtt, setPreviewAtt] = useState<ChatAttachment | null>(null);

  const { data: presenceData } = trpc.chat.getPresence.useQuery(
    { emails: counterpartEmail ? [counterpartEmail] : [] },
    { enabled: !!counterpartEmail, refetchInterval: 60000 }
  );
  const presence: PresenceStatus | undefined = counterpartEmail && presenceData
    ? presenceData[counterpartEmail] ? "in_meeting" : "active"
    : undefined;
  const wasAtBottomRef = useRef(true);

  const { data, error, isLoading } = trpc.chat.getMessages.useQuery(
    { spaceName }
  );

  const utils = trpc.useUtils();
  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      setInput("");
      setSendError(null);
      utils.chat.getMessages.invalidate({ spaceName });
    },
    onError: (mutationError) => {
      setSendError(mutationError.message);
    },
  });

  const messages = data?.status === "ok" ? data.messages ?? [] : [];
  const conversationError = error?.message ?? (data?.status === "error" ? data.message : null);
  const canSend = data?.status === "ok";

  const checkIfAtBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    if (data?.status !== "ok") return;
    if (wasAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [data?.status, messages.length]);

  useEffect(() => {
    if (data?.status === "ok" && !isLoading && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView();
    }
  }, [data?.status, isLoading, messages.length]);

  // ─── File handling ───

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setPendingFiles((prev) => [...prev, ...arr]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const uploadFiles = async (text: string) => {
    const filesToUpload = [...pendingFiles];
    if (filesToUpload.length === 0) return;

    setUploading(true);
    setSendError(null);
    try {
      const formData = new FormData();
      formData.append("spaceName", spaceName);
      if (text) {
        formData.append("text", text);
      }
      for (const file of filesToUpload) {
        formData.append("files", file);
      }

      const res = await fetch("/api/chat/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }

      setInput("");
      setPendingFiles([]);
      await utils.chat.getMessages.invalidate({ spaceName });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // ─── Send (text or files) ───

  const handleSend = () => {
    if (uploading || sendMessage.isPending || !canSend) return;
    const text = input.trim();

    if (pendingFiles.length > 0) {
      void uploadFiles(text);
      return;
    }

    if (!text) return;
    sendMessage.mutate({ spaceName, text });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Paste handler (Ctrl+V) ───

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    },
    [addFiles]
  );

  // ─── Drag & drop handler ───

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const isOwnMessage = (senderDisplayName: string) => {
    if (!user) return false;
    return senderDisplayName === user.name || senderDisplayName === user.email;
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const isSending = sendMessage.isPending || uploading;
  const hasContent = input.trim().length > 0 || pendingFiles.length > 0;

  return (
    <>
      <DrawerHeader
        title={displayName}
        subtitle={presence === "in_meeting" ? "In a meeting" : subtitle ?? "Conversation"}
        leading={
          <ChatAvatar
            name={displayName}
            avatarUrl={avatarUrl}
            spaceType={spaceType}
            className="h-9 w-9 text-xs"
            presence={presence}
            presenceSize="sm"
          />
        }
        onClose={onClose}
        onBack={onBack}
      />

      {/* Message area with drag-drop zone */}
      <div
        ref={scrollContainerRef}
        onScroll={checkIfAtBottom}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex-1 overflow-y-auto bg-[#f8fafd] px-4 py-4 space-y-3 relative",
          dragOver && "ring-2 ring-inset ring-[#1a73e8]/40"
        )}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#1a73e8]/5 backdrop-blur-[1px] pointer-events-none rounded-lg">
            <div className="flex flex-col items-center gap-2 text-[#1a73e8]">
              <Plus size={32} strokeWidth={2.5} />
              <p className="text-sm font-semibold">Drop files here</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : data?.status === "not_linked" ? (
          <ChatStateCard
            title="Link Google"
            description={data.message ?? "Link your Google Chat account to open this conversation."}
            actionLabel="Link Google Chat"
            actionOnClick={() => startGoogleChatSignIn(true)}
          />
        ) : data?.status === "reconnect_required" ? (
          <ReconnectGooglePrompt message={data.message} />
        ) : conversationError ? (
          <ChatStateCard
            title="Messages unavailable"
            description={conversationError}
            actionLabel="Reconnect Google"
            actionOnClick={() => startGoogleChatSignIn(true)}
          />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const own = isOwnMessage(msg.sender.displayName);

            return (
              <div key={msg.name}>
                <div className={cn("flex gap-2", own && "flex-row-reverse")}>
                  {!own && (
                    <ChatAvatar
                      name={msg.sender.displayName}
                      avatarUrl={msg.sender.avatarUrl}
                      spaceType="DIRECT_MESSAGE"
                      className="mt-0.5 h-8 w-8 text-[10px]"
                    />
                  )}
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3 py-2.5 shadow-sm",
                      own
                        ? "bg-[#1a73e8] text-white rounded-br-md"
                        : "border border-[#e3e7ee] bg-white text-foreground rounded-bl-md"
                    )}
                  >
                    {!own && (
                      <p className="text-[11px] font-semibold text-foreground/70 mb-0.5">
                        {msg.sender.displayName}
                      </p>
                    )}
                    {msg.text && (
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                    )}
                    <MessageAttachments attachments={msg.attachments} own={own} onPreview={setPreviewAtt} />
                    <div className={cn(
                      "flex items-center gap-1 mt-1",
                      own ? "justify-end" : "justify-start"
                    )}>
                      <span
                        className={cn(
                          "text-[10px]",
                          own ? "text-white/60" : "text-muted-foreground/60"
                        )}
                      >
                        {formatTime(msg.createTime)}
                      </span>
                      {own && (
                        <>
                          <Check
                            size={12}
                            className="text-white/60 shrink-0"
                            aria-label="Sent"
                          />
                          {user?.image && (
                            <img
                              src={user.image}
                              alt=""
                              className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-white p-3 shrink-0 space-y-2">
        {sendError && (
          <p className="text-xs text-destructive">{sendError}</p>
        )}

        <FilePreviewBar files={pendingFiles} onRemove={removeFile} />

        <div className="flex items-end gap-2">
          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!canSend || isSending}
            title="Attach file"
            className={cn(
              "shrink-0 rounded-full p-2.5 transition-colors",
              canSend && !isSending
                ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                : "text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            <Plus size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (sendError) setSendError(null);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              canSend
                ? pendingFiles.length > 0
                  ? "Add a caption..."
                  : "Type a message or paste files..."
                : "Reconnect Google to send messages."
            }
            rows={1}
            disabled={!canSend || isSending}
            className={cn(
              "flex-1 resize-none rounded-[28px] border border-transparent bg-[#f1f3f4] px-4 py-3",
              "text-sm placeholder:text-muted-foreground/50",
              "focus:border-[#c2e7ff] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#d2e3fc]",
              "max-h-24 overflow-y-auto disabled:cursor-not-allowed disabled:opacity-60"
            )}
          />
          <button
            onClick={handleSend}
            disabled={!hasContent || isSending || !canSend}
            className={cn(
              "shrink-0 rounded-full p-3 transition-colors",
              hasContent && !isSending && canSend
                ? "bg-[#1a73e8] text-white hover:bg-[#1557b0]"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {isSending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </div>

      {/* Media preview modal */}
      {previewAtt && (() => {
        const allPreviewable = messages.flatMap((m) =>
          m.attachments.filter((a) => isImage(a.contentType) || isVideo(a.contentType) || isPdf(a.contentType))
        );
        return (
          <MediaPreviewModal
            attachment={previewAtt}
            allPreviewable={allPreviewable}
            onClose={() => setPreviewAtt(null)}
            onNavigate={setPreviewAtt}
          />
        );
      })()}
    </>
  );
}
