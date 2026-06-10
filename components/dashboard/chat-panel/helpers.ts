import {
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Paperclip,
} from "lucide-react";
import type { ChatAttachment } from "@/lib/google/chat";
import { startOAuthConnect } from "@/lib/google/oauth-connect";

// ─── Attachment helpers ──────────────────────────────────────────────────────

export function getMediaProxyUrl(att: ChatAttachment): string {
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

export function isImage(ct: string) {
  return ct.startsWith("image/");
}
export function isVideo(ct: string) {
  return ct.startsWith("video/");
}
export function isPdf(ct: string) {
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
export function isGoogleWorkspace(ct: string) {
  return ct.startsWith("application/vnd.google-apps.");
}

export function getGoogleWorkspaceLabel(ct: string) {
  if (isGoogleDoc(ct)) return "Google Docs";
  if (isGoogleSheet(ct)) return "Google Sheets";
  if (isGoogleSlides(ct)) return "Google Slides";
  if (ct.includes("form")) return "Google Forms";
  if (ct.includes("drawing")) return "Google Drawing";
  return "Google File";
}

export function getGoogleWorkspaceIcon(ct: string) {
  if (isGoogleSheet(ct)) return FileSpreadsheet;
  if (isGoogleSlides(ct)) return Film;
  return FileText;
}

export function getGoogleWorkspaceColor(ct: string) {
  if (isGoogleDoc(ct)) return "text-blue-600 bg-blue-50 border-blue-200";
  if (isGoogleSheet(ct)) return "text-green-600 bg-green-50 border-green-200";
  if (isGoogleSlides(ct)) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  return "text-purple-600 bg-purple-50 border-purple-200";
}

// ─── Auth / presence / time helpers ─────────────────────────────────────────

export function startGoogleChatSignIn(forceConsent = false) {
  startOAuthConnect("google-chat", {
    callbackUrl: window.location.href,
    forceConsent,
  });
}

export type PresenceStatus = "active" | "in_meeting" | "offline";

export function formatListTime(iso?: string | null) {
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

// ─── File Upload helpers ─────────────────────────────────────────────────────

export const ACCEPTED_TYPES = [
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

export function getFilePreviewIcon(file: File) {
  if (file.type.startsWith("image/")) return ImageIcon;
  if (file.type.startsWith("video/")) return Film;
  if (file.type === "application/pdf") return FileText;
  if (file.type.includes("spreadsheet") || file.type.includes("excel") || file.type.includes("csv"))
    return FileSpreadsheet;
  return Paperclip;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
