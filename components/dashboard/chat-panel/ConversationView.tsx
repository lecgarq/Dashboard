"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, Send } from "lucide-react";
import type { ChatAttachment, ChatMessage } from "@/lib/google/chat";
import { useDashboardAuth } from "@/components/providers/dashboard-auth-provider";
import { trpc } from "@/lib/core/trpc";
import { cn } from "@/lib/core/utils";
import {
  ChatAvatar,
  ChatStateCard,
  DrawerHeader,
  ReconnectGooglePrompt,
} from "./ChatChrome";
import { FilePreviewBar } from "./FilePreviewBar";
import { MediaPreviewModal } from "./MediaPreviewModal";
import { MessageAttachments } from "./MessageAttachments";
import {
  ACCEPTED_TYPES,
  isImage,
  isPdf,
  isVideo,
  startGoogleChatSignIn,
  type PresenceStatus,
} from "./helpers";

export function ConversationView({
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
    // Optimistic send: drop the message into the conversation and clear the box
    // immediately, then reconcile with the server. Sending feels instant.
    onMutate: async ({ spaceName: targetSpace, text }) => {
      await utils.chat.getMessages.cancel({ spaceName: targetSpace });
      const previous = utils.chat.getMessages.getData({ spaceName: targetSpace });
      const previousInput = input;

      const optimistic: ChatMessage = {
        name: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sender: {
          name: "",
          displayName: user?.name ?? user?.email ?? "Me",
          avatarUrl: user?.image ?? null,
          type: "HUMAN",
        },
        createTime: new Date().toISOString(),
        text,
        attachments: [],
      };

      utils.chat.getMessages.setData({ spaceName: targetSpace }, (current) => {
        if (!current || current.status !== "ok") return current;
        return { ...current, messages: [...(current.messages ?? []), optimistic] };
      });

      wasAtBottomRef.current = true;
      setInput("");
      setSendError(null);
      return { previous, previousInput, targetSpace };
    },
    onError: (mutationError, _variables, context) => {
      // Roll back the optimistic message and restore what the user typed.
      if (context) {
        utils.chat.getMessages.setData({ spaceName: context.targetSpace }, context.previous);
        if (context.previousInput) setInput(context.previousInput);
      }
      setSendError(mutationError.message);
    },
    onSettled: (_data, _error, variables) => {
      void utils.chat.getMessages.invalidate({ spaceName: variables.spaceName });
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
          "flex-1 overflow-y-auto bg-muted/40 px-4 py-4 space-y-3 relative",
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
                        : "border border-border bg-card text-foreground rounded-bl-md"
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
              "flex-1 resize-none rounded-[28px] border border-transparent bg-muted px-4 py-3",
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
