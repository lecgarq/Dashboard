"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";
import { formatDistanceToNow } from "date-fns";
import { useTheme } from "next-themes";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Check,
  ExternalLink,
  FileText,
  Forward,
  ImageIcon,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";
import { startOAuthConnect } from "@/lib/google/oauth-connect";
import { useMailPanel, type ComposeSeed } from "./mail-panel-context";

type MailAttachment = {
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
  isInline: boolean;
  contentId?: string;
};

type MailSummary = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  isUnread: boolean;
  hasAttachments?: boolean;
};

type MailDetail = MailSummary & {
  to: string;
  cc?: string;
  messageIdHeader?: string;
  references?: string;
  bodyHtml?: string;
  bodyText?: string;
  attachments: MailAttachment[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAttachmentUrl(messageId: string, attachment: MailAttachment): string {
  const params = new URLSearchParams({
    messageId,
    partId: attachment.partId,
  });
  return `/api/gmail/attachment?${params.toString()}`;
}

function isImageAttachment(mimeType: string) {
  return mimeType.startsWith("image/");
}

function isPdfAttachment(mimeType: string) {
  return mimeType === "application/pdf";
}

function formatAttachmentSize(size: number) {
  if (size <= 0) return "Unknown size";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function parseMailDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMailDate(value: string, compact = false) {
  const date = parseMailDate(value);
  if (!date) return value;

  if (compact) {
    return formatDistanceToNow(date, { addSuffix: true });
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function extractEmail(value: string) {
  const bracketMatch = value.match(/<([^>]+)>/);
  const candidate = (bracketMatch?.[1] ?? value).trim();
  const emailMatch = candidate.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch?.[0] ?? candidate;
}

function displaySender(value: string) {
  const beforeAddress = value.split("<")[0]?.replace(/^"|"$/g, "").trim();
  return beforeAddress || extractEmail(value) || value;
}

function ensureSubjectPrefix(subject: string, prefix: "Re" | "Fwd") {
  const clean = subject.trim() || "(No Subject)";
  if (clean.toLowerCase().startsWith(`${prefix.toLowerCase()}:`)) {
    return clean;
  }
  return `${prefix}: ${clean}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(value: string) {
  const text = value.trim();
  if (!text) return "<p></p>";
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function stripHtml(value: string) {
  if (!value) return "";
  if (typeof window !== "undefined") {
    const doc = new DOMParser().parseFromString(value, "text/html");
    return doc.body.textContent?.trim() ?? "";
  }
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeEmailHtml(value: string) {
  if (typeof window === "undefined") {
    return textToHtml(stripHtml(value));
  }

  const doc = new DOMParser().parseFromString(value, "text/html");
  doc
    .querySelectorAll("script, iframe, object, embed, form, input, button, meta")
    .forEach((node) => node.remove());

  doc.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      const rawValue = attribute.value.trim();

      if (name.startsWith("on") || name === "srcdoc") {
        node.removeAttribute(attribute.name);
        continue;
      }

      if (
        ["href", "src", "xlink:href"].includes(name) &&
        /^(javascript:|vbscript:|data:text\/html)/i.test(rawValue)
      ) {
        node.removeAttribute(attribute.name);
      }
    }
  });

  doc.querySelectorAll("a[href]").forEach((node) => {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  });

  return doc.body.innerHTML || "<p></p>";
}

function buildEmailSrcDoc(html?: string, text?: string, isDark = false) {
  const body = sanitizeEmailHtml(html?.trim() ? html : textToHtml(text ?? ""));
  const palette = isDark
    ? { bg: "#18181b", fg: "#fafafa", link: "#60a5fa", quote: "#a1a1aa", quoteBorder: "#3f3f46" }
    : { bg: "#ffffff", fg: "#1f2937", link: "#1d4ed8", quote: "#4b5563", quoteBorder: "#d1d5db" };
  return `<!doctype html>
<html>
  <head>
    <base target="_blank" />
    <style>
      :root { color-scheme: ${isDark ? "dark" : "light"}; }
      body {
        margin: 0;
        padding: 20px;
        background: ${palette.bg};
        color: ${palette.fg};
        font: 14px/1.55 Arial, Helvetica, sans-serif;
        overflow-wrap: anywhere;
      }
      img, table { max-width: 100% !important; }
      img { height: auto !important; }
      a { color: ${palette.link}; }
      pre { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      blockquote { margin-left: 0; padding-left: 12px; border-left: 3px solid ${palette.quoteBorder}; color: ${palette.quote}; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function buildComposeHtml(body: string) {
  return textToHtml(body);
}

function parseAddressInput(value: string) {
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  if (matches?.length) {
    return matches.map((match) => match.trim().toLowerCase());
  }

  return value
    .split(/[;,]+/)
    .map((part) => extractEmail(part).trim().toLowerCase())
    .filter(Boolean);
}

function uniqueAddresses(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function createReplySeed(detail: MailDetail): ComposeSeed {
  const references = [detail.references, detail.messageIdHeader]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    mode: "reply",
    to: [extractEmail(detail.from)],
    subject: ensureSubjectPrefix(detail.subject, "Re"),
    threadId: detail.threadId,
    inReplyTo: detail.messageIdHeader,
    references: references || undefined,
  };
}

function createForwardSeed(detail: MailDetail): ComposeSeed {
  const forwardedBody = [
    "",
    "",
    "---------- Forwarded message ---------",
    `From: ${detail.from}`,
    detail.date ? `Date: ${formatMailDate(detail.date)}` : null,
    `Subject: ${detail.subject}`,
    detail.to ? `To: ${detail.to}` : null,
    "",
    detail.bodyText || stripHtml(detail.bodyHtml ?? "") || detail.snippet,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    mode: "forward",
    subject: ensureSubjectPrefix(detail.subject, "Fwd"),
    body: forwardedBody,
  };
}

export function MailPanel() {
  const { open, setOpen, view, setView } = useMailPanel();
  const utils = trpc.useUtils();

  const close = () => setOpen(false);
  const showInbox = () => setView({ type: "inbox" });

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/35 transition-opacity"
          onClick={close}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-[70] h-full w-[min(640px,calc(100vw-16px))] sm:w-[560px] xl:w-[640px]",
          "flex flex-col border-r border-border bg-background shadow-2xl",
          "transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Mail panel"
      >
        {view.type === "inbox" ? (
          <InboxView
            onClose={close}
            onSelect={(id) => setView({ type: "message", id })}
            onCompose={() => setView({ type: "compose", seed: { mode: "new" } })}
          />
        ) : view.type === "message" ? (
          <MessageDetailView
            id={view.id}
            onBack={showInbox}
            onClose={close}
            onCompose={(seed) => setView({ type: "compose", seed })}
          />
        ) : (
          <ComposeView
            seed={view.seed}
            onBack={showInbox}
            onClose={close}
            onSuccess={() => {
              showInbox();
              void utils.gmail.getRecent.invalidate();
            }}
          />
        )}
      </aside>
    </>
  );
}

function InboxView({
  onClose,
  onSelect,
  onCompose,
}: {
  onClose: () => void;
  onSelect: (id: string) => void;
  onCompose: () => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const { data: messages, isLoading, refetch, isFetching, error } =
    trpc.gmail.getRecent.useQuery({
      maxResults: 30,
      query: query || undefined,
    });

  const needsAccess = error?.message === "gmail_access_required";
  const isUpdating = isFetching && !isLoading;

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuery(searchInput.trim());
  };

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex min-h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted/50 text-primary">
            <Inbox size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">Gmail</h2>
            <p className="text-xs text-muted-foreground">
              {query ? `Search: ${query}` : isUpdating ? "Refreshing inbox" : "Inbox"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refetch()}
            disabled={isLoading || isFetching}
            className="h-8 w-8 text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw size={15} className={cn(isFetching && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground"
            title="Close"
          >
            <X size={16} />
          </Button>
        </div>
      </header>

      <div className="shrink-0 border-b border-border bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="relative min-w-0 flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search mail"
              className="h-9 w-full rounded-md border border-border bg-muted/30 pl-9 pr-9 text-sm outline-none transition focus:border-primary/60 focus:bg-background"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setQuery("");
                }}
                className="absolute right-2 top-1/2 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                title="Clear search"
              >
                <X size={14} />
              </button>
            ) : null}
          </form>
          <Button onClick={onCompose} className="h-9 gap-2 rounded-md px-3">
            <Plus size={16} />
            Compose
          </Button>
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {needsAccess ? (
          <AccessRequiredState />
        ) : isLoading ? (
          <LoadingState label="Loading inbox" />
        ) : error ? (
          <PanelState
            icon={<AlertCircle size={34} />}
            title="Inbox unavailable"
            description={error.message}
          />
        ) : messages?.length === 0 ? (
          <PanelState
            icon={<MailOpen size={34} />}
            title={query ? "No matching mail" : "Inbox is empty"}
            description={query ? "Try a different search." : "New messages will appear here."}
          />
        ) : (
          <div className="divide-y divide-border/60">
            {messages?.map((message) => (
              <InboxMessageRow
                key={message.id}
                message={message}
                onSelect={() => onSelect(message.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InboxMessageRow({
  message,
  onSelect,
}: {
  message: MailSummary;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full gap-3 px-4 py-3 text-left transition hover:bg-background",
        message.isUnread
          ? "bg-blue-50/70 dark:bg-blue-950/20"
          : "bg-transparent"
      )}
    >
      <span
        className={cn(
          "mt-1 h-2 w-2 shrink-0 rounded-full",
          message.isUnread ? "bg-primary" : "bg-transparent"
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "min-w-0 truncate text-sm",
              message.isUnread ? "font-semibold text-foreground" : "font-medium"
            )}
          >
            {displaySender(message.from)}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {message.date ? formatMailDate(message.date, true) : ""}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 truncate text-sm",
              message.isUnread ? "font-semibold text-foreground" : "text-foreground/80"
            )}
          >
            {message.subject}
          </span>
          {message.hasAttachments ? (
            <Paperclip size={13} className="shrink-0 text-muted-foreground" />
          ) : null}
        </span>
        <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {message.snippet}
        </span>
      </span>
    </button>
  );
}

function MessageDetailView({
  id,
  onBack,
  onClose,
  onCompose,
}: {
  id: string;
  onBack: () => void;
  onClose: () => void;
  onCompose: (seed: ComposeSeed) => void;
}) {
  const utils = trpc.useUtils();
  const { data: detail, isLoading, error } = trpc.gmail.getDetail.useQuery({ id });

  const invalidate = () => {
    void utils.gmail.getRecent.invalidate();
    void utils.gmail.getDetail.invalidate({ id });
  };

  const markRead = trpc.gmail.markRead.useMutation({ onSuccess: invalidate });
  const markUnread = trpc.gmail.markUnread.useMutation({ onSuccess: invalidate });
  const archive = trpc.gmail.archive.useMutation({
    onSuccess: () => {
      invalidate();
      onBack();
    },
  });
  const trash = trpc.gmail.trash.useMutation({
    onSuccess: () => {
      invalidate();
      onBack();
    },
  });

  const actionPending =
    markRead.isPending ||
    markUnread.isPending ||
    archive.isPending ||
    trash.isPending;

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8"
          title="Back"
        >
          <ArrowLeft size={16} />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {detail?.subject ?? "Email"}
          </h2>
          {detail?.date ? (
            <p className="text-xs text-muted-foreground">
              {formatMailDate(detail.date)}
            </p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 text-muted-foreground"
          title="Close"
        >
          <X size={16} />
        </Button>
      </header>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingState label="Loading message" />
        ) : error ? (
          <PanelState
            icon={<AlertCircle size={34} />}
            title="Message unavailable"
            description={error.message}
          />
        ) : detail ? (
          <article className="flex flex-col gap-5 px-5 py-5">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-primary">
                  <User size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-base font-semibold leading-snug text-foreground">
                    {detail.subject}
                  </h1>
                  <p className="mt-1 truncate text-sm font-medium text-foreground/85">
                    {displaySender(detail.from)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {detail.from}
                  </p>
                </div>
              </div>

              <div className="grid gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
                <p className="truncate">
                  <span className="font-medium text-foreground">To:</span>{" "}
                  {detail.to || "Me"}
                </p>
                {detail.cc ? (
                  <p className="truncate">
                    <span className="font-medium text-foreground">Cc:</span>{" "}
                    {detail.cc}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2 rounded-md"
                onClick={() => onCompose(createReplySeed(detail))}
              >
                <Reply size={14} />
                Reply
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2 rounded-md"
                onClick={() => onCompose(createForwardSeed(detail))}
              >
                <Forward size={14} />
                Forward
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                disabled={actionPending}
                onClick={() =>
                  detail.isUnread
                    ? markRead.mutate({ id: detail.id })
                    : markUnread.mutate({ id: detail.id })
                }
                title={detail.isUnread ? "Mark read" : "Mark unread"}
              >
                {detail.isUnread ? <MailOpen size={15} /> : <Mail size={15} />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                disabled={actionPending}
                onClick={() => archive.mutate({ id: detail.id })}
                title="Archive"
              >
                <Archive size={15} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                disabled={actionPending}
                onClick={() => trash.mutate({ id: detail.id })}
                title="Move to trash"
              >
                <Trash2 size={15} />
              </Button>
              <a
                href={`https://mail.google.com/mail/u/0/#inbox/${
                  detail.threadId || detail.id
                }`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <ExternalLink size={14} />
                Gmail
              </a>
            </div>

            {(markRead.isError ||
              markUnread.isError ||
              archive.isError ||
              trash.isError) && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Action failed. Refresh and try again.
              </div>
            )}

            <EmailBody html={detail.bodyHtml} text={detail.bodyText || detail.snippet} />

            <MailAttachments
              messageId={detail.id}
              attachments={detail.attachments}
            />
          </article>
        ) : (
          <PanelState
            icon={<MailOpen size={34} />}
            title="Message not found"
            description="This message is no longer available."
          />
        )}
      </div>
    </div>
  );
}

function EmailBody({ html, text }: { html?: string; text?: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const srcDoc = useMemo(() => buildEmailSrcDoc(html, text, isDark), [html, text, isDark]);

  return (
    <section className="rounded-lg border border-border bg-card p-2">
      <iframe
        title="Email body"
        srcDoc={srcDoc}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="h-[520px] w-full rounded-md border-0 bg-white"
      />
    </section>
  );
}

function MailAttachments({
  messageId,
  attachments,
}: {
  messageId: string;
  attachments: MailAttachment[];
}) {
  if (!attachments.length) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Paperclip size={15} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">
          Attachments
        </h3>
      </div>

      <div className="grid gap-3">
        {attachments.map((attachment) => {
          const url = getAttachmentUrl(messageId, attachment);
          const isImage = isImageAttachment(attachment.mimeType);
          const isPdf = isPdfAttachment(attachment.mimeType);
          const Icon = isImage ? ImageIcon : FileText;

          return (
            <div
              key={attachment.partId}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {attachment.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {attachment.mimeType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatAttachmentSize(attachment.size)}
                      {attachment.isInline ? " - inline" : ""}
                    </p>
                  </div>
                </div>

                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  title={`Open ${attachment.filename}`}
                >
                  <ExternalLink size={15} />
                </a>
              </div>

              {isImage && (
                <img
                  src={url}
                  alt={attachment.filename}
                  loading="lazy"
                  className="mt-3 max-h-80 w-full rounded-md border border-border bg-white object-contain"
                />
              )}

              {isPdf && (
                <iframe
                  src={url}
                  title={attachment.filename}
                  className="mt-3 h-80 w-full rounded-md border border-border bg-white"
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ComposeView({
  seed,
  onBack,
  onClose,
  onSuccess,
}: {
  seed?: ComposeSeed;
  onBack: () => void;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const mode = seed?.mode ?? "new";
  const [to, setTo] = useState(seed?.to ?? []);
  const [cc, setCc] = useState(seed?.cc ?? []);
  const [bcc, setBcc] = useState(seed?.bcc ?? []);
  const [showCc, setShowCc] = useState(Boolean(seed?.cc?.length));
  const [showBcc, setShowBcc] = useState(Boolean(seed?.bcc?.length));
  const [subject, setSubject] = useState(seed?.subject ?? "");
  const [body, setBody] = useState(seed?.body ?? "");
  const [sent, setSent] = useState(false);

  const send = trpc.gmail.send.useMutation({
    onSuccess: () => {
      setSent(true);
      window.setTimeout(onSuccess, 700);
    },
  });

  const invalidAddresses = [...to, ...cc, ...bcc].filter(
    (address) => !EMAIL_RE.test(address)
  );
  const validationMessage = !to.length
    ? "Add at least one recipient."
    : invalidAddresses.length
      ? `Check ${invalidAddresses[0]}.`
      : !subject.trim()
        ? "Add a subject."
        : !body.trim()
          ? "Write a message."
          : "";

  const title =
    mode === "reply" ? "Reply" : mode === "forward" ? "Forward" : "New message";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validationMessage || send.isPending) return;

    send.mutate({
      to,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      subject: subject.trim(),
      html: buildComposeHtml(body),
      threadId: seed?.threadId,
      inReplyTo: seed?.inReplyTo,
      references: seed?.references,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col bg-background">
      <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onBack}
          className="h-8 w-8"
          title="Back"
        >
          <ArrowLeft size={16} />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">Sending from your Gmail account</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onClose}
          className="h-8 w-8 text-muted-foreground"
          title="Close"
        >
          <X size={16} />
        </Button>
      </header>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        <AddressField label="To" values={to} onChange={setTo} autoFocus />

        <div className="flex items-center gap-2 pl-12">
          <button
            type="button"
            onClick={() => setShowCc((value) => !value)}
            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            Cc
          </button>
          <button
            type="button"
            onClick={() => setShowBcc((value) => !value)}
            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            Bcc
          </button>
        </div>

        {showCc ? <AddressField label="Cc" values={cc} onChange={setCc} /> : null}
        {showBcc ? (
          <AddressField label="Bcc" values={bcc} onChange={setBcc} />
        ) : null}

        <label className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
          <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground">
            Subject
          </span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            placeholder="Subject"
          />
        </label>

        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write your message"
          className="min-h-[340px] w-full resize-none rounded-md border border-border bg-card px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-primary/60"
        />
      </div>

      <footer className="shrink-0 border-t border-border bg-background px-5 py-4">
        {send.isError ? (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {send.error.message || "Failed to send email."}
          </div>
        ) : null}
        {sent ? (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            <Check size={14} />
            Message sent.
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-xs text-muted-foreground">
            {validationMessage || "Ready to send."}
          </p>
          <Button
            type="submit"
            disabled={send.isPending || Boolean(validationMessage)}
            className="h-9 gap-2 rounded-md px-4"
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send size={15} />
            )}
            Send
          </Button>
        </div>
      </footer>
    </form>
  );
}

function AddressField({
  label,
  values,
  onChange,
  autoFocus,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const commitDraft = (value = draft) => {
    const next = uniqueAddresses([...values, ...parseAddressInput(value)]);
    onChange(next);
    setDraft("");
  };

  const remove = (value: string) => {
    onChange(values.filter((current) => current !== value));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", ",", ";", "Tab"].includes(event.key) && draft.trim()) {
      event.preventDefault();
      commitDraft();
      return;
    }

    if (event.key === "Backspace" && !draft && values.length) {
      remove(values[values.length - 1]);
    }
  };

  return (
    <label className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2">
      <span className="mt-1.5 w-8 shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs",
              EMAIL_RE.test(value)
                ? "border-border bg-muted text-foreground"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            )}
          >
            <span className="truncate">{value}</span>
            <button
              type="button"
              onClick={() => remove(value)}
              className="rounded-sm text-muted-foreground hover:text-foreground"
              title={`Remove ${value}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          autoFocus={autoFocus}
          value={draft}
          onChange={(event) => {
            const value = event.target.value;
            if (/[;,]$/.test(value)) {
              commitDraft(value);
            } else {
              setDraft(value);
            }
          }}
          onBlur={() => {
            if (draft.trim()) commitDraft();
          }}
          onKeyDown={handleKeyDown}
          className="min-w-[140px] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/70"
          placeholder={`${label} recipients`}
        />
      </span>
    </label>
  );
}

function AccessRequiredState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
        <Mail size={24} />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Connect Gmail</p>
        <p className="mt-1 max-w-[280px] text-sm text-muted-foreground">
          Grant Gmail access to load messages and send mail from your account.
        </p>
      </div>
      <Button
        size="sm"
        className="rounded-md"
        onClick={() =>
          startOAuthConnect("google", {
            callbackUrl: window.location.pathname,
            forceConsent: true,
          })
        }
      >
        Grant Access
      </Button>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function PanelState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="text-muted-foreground/50">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 max-w-[320px] text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
