"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Mail,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";
import { useMailPanel } from "./mail-panel-context";
import { startOAuthConnect } from "@/lib/google/oauth-connect";

type MailAttachment = {
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
  isInline: boolean;
  contentId?: string;
};

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

export function MailPanel() {
  const { open, setOpen, view, setView } = useMailPanel();
  const utils = trpc.useUtils();

  const close = () => setOpen(false);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/30 transition-opacity"
          onClick={close}
        />
      )}

      <div
        className={cn(
          "fixed top-0 left-0 z-[70] h-full w-[400px] max-w-[90vw]",
          "bg-card border-r border-border shadow-2xl",
          "flex flex-col transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)",
          open ? "translate-x-0" : "-translate-x-full shadow-none"
        )}
      >
        {view.type === "inbox" ? (
          <InboxView
            onClose={close}
            onSelect={(id) => setView({ type: "message", id })}
            onCompose={() => setView({ type: "compose" })}
          />
        ) : view.type === "message" ? (
          <MessageDetailView
            id={view.id}
            onBack={() => setView({ type: "inbox" })}
            onClose={close}
          />
        ) : (
          <ComposeView
            onBack={() => setView({ type: "inbox" })}
            onClose={close}
            onSuccess={() => {
              setView({ type: "inbox" });
              void utils.gmail.getRecent.invalidate();
            }}
          />
        )}
      </div>
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
  const { data: messages, isLoading, refetch, isRefetching, error } =
    trpc.gmail.getRecent.useQuery({ maxResults: 15 });

  const needsAccess = error?.message === "gmail_access_required";

  return (
    <div className="flex h-full flex-col bg-slate-50/50 dark:bg-slate-950/50">
      <header className="min-h-16 flex items-center justify-between border-b border-border bg-background px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Mail className="text-primary" size={18} />
          <h2 className="text-sm font-semibold italic">Mail</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="h-8 w-8 text-muted-foreground"
          >
            <RefreshCw
              size={14}
              className={cn(isRefetching && "animate-spin")}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground"
          >
            <X size={16} />
          </Button>
        </div>
      </header>

      <div className="border-b border-border bg-background/50 p-3">
        <Button
          className="h-9 w-full gap-2 rounded-xl font-medium shadow-sm"
          onClick={onCompose}
        >
          <Plus size={16} />
          New Message
        </Button>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {needsAccess ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <Mail size={36} className="text-muted-foreground/20" />
            <div>
              <p className="text-sm font-medium text-foreground">Connect your Gmail</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Grant access to see your inbox here.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() =>
                startOAuthConnect("google", {
                  callbackUrl: window.location.pathname,
                  forceConsent: true,
                })
              }
            >
              Grant Gmail Access
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3">
            <Loader2 className="animate-spin text-primary/30" />
            <p className="text-xs font-medium italic text-muted-foreground">
              Syncing inbox...
            </p>
          </div>
        ) : messages?.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center px-6 text-center">
            <Mail size={32} className="mb-2 text-muted-foreground/20" />
            <p className="text-xs italic text-muted-foreground">
              No messages found.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {messages?.map((msg) => (
              <button
                key={msg.id}
                onClick={() => onSelect(msg.id)}
                className={cn(
                  "group flex w-full flex-col items-start p-4 text-left transition-all hover:bg-white dark:hover:bg-slate-900",
                  msg.isUnread &&
                    "border-l-2 border-l-primary bg-blue-50/50 dark:bg-blue-900/10"
                )}
              >
                <div className="mb-1 flex w-full items-start justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-[11px]",
                      msg.isUnread
                        ? "font-bold text-primary"
                        : "font-medium text-muted-foreground"
                    )}
                  >
                    {msg.from.split("<")[0].trim() || msg.from}
                  </span>
                  <span className="whitespace-nowrap pt-0.5 text-[10px] text-muted-foreground/60">
                    {msg.date
                      ? formatDistanceToNow(new Date(msg.date), {
                          addSuffix: true,
                        })
                      : ""}
                  </span>
                </div>
                <h3
                  className={cn(
                    "mb-1 line-clamp-1 text-xs",
                    msg.isUnread
                      ? "font-bold text-foreground"
                      : "font-medium text-foreground/80"
                  )}
                >
                  {msg.subject}
                </h3>
                <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/70">
                  {msg.snippet}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageDetailView({
  id,
  onBack,
  onClose,
}: {
  id: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const { data: detail, isLoading } = trpc.gmail.getDetail.useQuery({ id });

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="min-h-16 flex items-center gap-3 border-b border-border bg-background px-4 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8 hover:bg-muted"
        >
          <ArrowLeft size={16} />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xs font-semibold italic">Email Thread</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 text-muted-foreground"
        >
          <X size={16} />
        </Button>
      </header>

      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <Loader2 className="animate-spin text-primary/30" />
            <p className="text-[10px] italic text-muted-foreground">
              Fetching content...
            </p>
          </div>
        ) : detail ? (
          <div className="flex flex-col p-6">
            <h1 className="mb-6 text-base font-bold leading-tight text-foreground">
              {detail.subject}
            </h1>

            <div className="mb-8 flex items-start gap-3 border-b border-border/50 pb-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <User size={18} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between">
                  <p className="truncate text-xs font-bold text-foreground">
                    {detail.from}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {detail.date}
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground/70">To: Me</p>
              </div>
            </div>

            <div
              className={cn(
                "prose prose-sm prose-slate max-w-none overflow-hidden break-words text-sm leading-relaxed dark:prose-invert"
              )}
              dangerouslySetInnerHTML={{
                __html:
                  detail.bodyHtml ||
                  ` <pre className="whitespace-pre-wrap font-sans">${detail.bodyText}</pre> `,
              }}
            />

            <MailAttachments
              messageId={detail.id}
              attachments={detail.attachments}
            />
          </div>
        ) : (
          <div className="p-10 text-center italic text-muted-foreground">
            Message not found.
          </div>
        )}
      </div>
    </div>
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
    <section className="mt-8 border-t border-border/50 pt-6">
      <div className="mb-3 flex items-center gap-2">
        <Paperclip size={14} className="text-muted-foreground" />
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Attachments
        </h3>
      </div>

      <div className="space-y-3">
        {attachments.map((attachment) => {
          const url = getAttachmentUrl(messageId, attachment);
          const isImage = isImageAttachment(attachment.mimeType);
          const isPdf = isPdfAttachment(attachment.mimeType);
          const Icon = isImage ? ImageIcon : FileText;

          return (
            <div
              key={attachment.partId}
              className="rounded-2xl border border-border/60 bg-muted/20 p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 rounded-xl bg-background p-2 text-muted-foreground shadow-sm">
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {attachment.filename}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {attachment.mimeType}
                    </p>
                    <p className="text-[10px] text-muted-foreground/80">
                      {formatAttachmentSize(attachment.size)}
                      {attachment.isInline ? " • Inline" : ""}
                    </p>
                  </div>
                </div>

                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                  title={`Open ${attachment.filename}`}
                >
                  <ExternalLink size={14} />
                </a>
              </div>

              {isImage && (
                <img
                  src={url}
                  alt={attachment.filename}
                  loading="lazy"
                  className="mt-3 max-h-72 w-full rounded-xl border border-border/50 bg-background object-contain"
                />
              )}

              {isPdf && (
                <iframe
                  src={url}
                  title={attachment.filename}
                  className="mt-3 h-72 w-full rounded-xl border border-border/50 bg-white"
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
  onBack,
  onClose,
  onSuccess,
}: {
  onBack: () => void;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const send = trpc.gmail.send.useMutation({ onSuccess });

  const handleSend = () => {
    if (!to || !subject || !html) return;
    send.mutate({ to, subject, html });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="min-h-16 flex items-center gap-3 border-b border-border background px-4 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8 hover:bg-muted"
        >
          <ArrowLeft size={16} />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xs font-semibold italic">New Message</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 text-muted-foreground"
        >
          <X size={16} />
        </Button>
      </header>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
        <div className="space-y-1.5">
          <label htmlFor="mail-recipient" className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Recipient
          </label>
          <input
            id="mail-recipient"
            type="email"
            placeholder="email@example.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-xl border border-border/50 bg-slate-50 px-4 py-2.5 text-xs shadow-sm outline-none transition-all focus:ring-1 focus:ring-primary/50 dark:bg-slate-900"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="mail-subject" className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Subject
          </label>
          <input
            id="mail-subject"
            type="text"
            placeholder="How can we help?"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-xl border border-border/50 bg-slate-50 px-4 py-2.5 text-xs shadow-sm outline-none transition-all focus:ring-1 focus:ring-primary/50 dark:bg-slate-900"
          />
        </div>
        <div className="flex flex-1 flex-col space-y-1.5">
          <label htmlFor="mail-content" className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Content
          </label>
          <textarea
            id="mail-content"
            placeholder="Write your message here..."
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            className="flex-1 w-full resize-none rounded-xl border border-border/50 bg-slate-50 px-4 py-4 text-xs leading-relaxed shadow-sm outline-none transition-all focus:ring-1 focus:ring-primary/50 dark:bg-slate-900"
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-border/30 bg-background/50 p-6 backdrop-blur-sm">
        <Button
          onClick={handleSend}
          disabled={send.isPending || !to || !subject || !html}
          className="h-10 w-full gap-2 rounded-xl font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          {send.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Send size={16} />
              Send Email
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
