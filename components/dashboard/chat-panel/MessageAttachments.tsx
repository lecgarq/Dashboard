"use client";

import { ExternalLink, FileText, Film, Paperclip } from "lucide-react";
import type { ChatAttachment } from "@/lib/google/chat";
import { cn } from "@/lib/core/utils";
import {
  getGoogleWorkspaceColor,
  getGoogleWorkspaceIcon,
  getGoogleWorkspaceLabel,
  getMediaProxyUrl,
  isGoogleWorkspace,
  isImage,
  isPdf,
  isVideo,
} from "./helpers";

export function MessageAttachments({
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
                src={url}
                alt={att.contentName}
                className="w-full h-auto object-cover"
                loading="lazy"
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
              : "text-muted-foreground bg-muted/40 border-border";
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
