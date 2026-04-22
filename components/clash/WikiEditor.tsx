"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { FontFamily } from "@tiptap/extension-font-family";
import { TextStyle } from "@tiptap/extension-text-style";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { compressImage } from "./wiki-editor/media";
import { WikiLinkDialog } from "./wiki-editor/WikiLinkDialog";
import { VideoNode } from "./wiki-editor/video-node";
import { getOrCreateYjsProvider, releaseYjsProvider } from "./wiki-editor/yjs-provider";

// Phase 2: Image (replaces tiptap-extension-resize-image)
import { ImageNode } from "./wiki-editor/image-node";

// Phase 2: PDF node (schema only — NodeView wired below via dynamic import)
import { PdfNode } from "./wiki-editor/pdf-node";

// Phase 2: Table extensions
import { TableKit } from "./wiki-editor/table-node/extensions/table-node-extension";
import { CustomTableCell } from "./wiki-editor/table-node/extensions/custom-table-cell";
import { TableCellHandleMenu, TableHandle } from "./wiki-editor/table-node/ui/table-handle";

// Phase 2: Drag handle
import { WikiDragHandle } from "./wiki-editor/drag-handle";

// Phase 2: Slash menu
import { SlashDropdownMenu } from "./wiki-editor/slash-menu";
import { WIKI_SLASH_ITEMS } from "./wiki-editor/slash-menu/wiki-slash-items";

// Dynamic import for PdfNodeView — keeps this file SSR-safe (pdf.js uses browser APIs)
const DynamicPdfNodeView = dynamic(
  () => import("./wiki-editor/pdf-node-view"),
  { ssr: false }
);

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Type,
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  Link as LinkIcon,
  FileText,
  Table2,
} from "lucide-react";
import { trpc } from "@/lib/core/trpc";
import { cn } from "@/lib/core/utils";
import {
  Save,
  Printer,
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Check,
  Underline as UnderlineIcon,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

type WikiStatus = "DRAFT" | "REVIEW" | "APPROVED";
type AutoSaveState = "idle" | "pending" | "saving" | "saved";

type WikiEditorSection = {
  id: string;
  section: string;
  title: string;
  content: string;
  status: string;
};

interface WikiEditorProps {
  section: WikiEditorSection;
  isAdmin: boolean;
  module?: "clash" | "sim";
  onSave?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

type CachedWikiSection = {
  id: string;
  projectId: string;
  section: string;
  title: string;
  content: string;
  status: string;
  order: number;
  updatedAt: Date;
  yjsState?: Uint8Array | Buffer | null;
};

const COLLAB_SYNC_TIMEOUT_MS = 15000;

type HocuspocusSyncedPayload = {
  state: boolean;
};

type HocuspocusAuthenticationFailedPayload = {
  reason?: string;
};

type HocuspocusDisconnectPayload = {
  event?: {
    code?: number;
    reason?: string;
  };
};

function toSectionKey(section: string) {
  const candidate = section.split("-").slice(1).join("-");
  return candidate || section;
}

function upsertSectionInCache<T extends CachedWikiSection>(
  current: T[] | undefined,
  incoming: T
): T[] | undefined {
  if (!current) return current;

  const incomingKey = toSectionKey(incoming.section);
  const next = [...current];
  const index = next.findIndex((item) => {
    if (item.section === incoming.section) return true;
    return toSectionKey(item.section) === incomingKey;
  });

  if (index >= 0) {
    next[index] = incoming;
  } else {
    next.push(incoming);
  }

  next.sort((a, b) => a.order - b.order);
  return next;
}

export function WikiEditor({
  section,
  isAdmin,
  module = "clash",
  onSave,
  onDirtyChange,
}: WikiEditorProps) {
  const { data: session } = useSession();
  const utils = trpc.useUtils();
  const canEdit = isAdmin;

  const [status, setStatus] = useState<WikiStatus>(section.status as WikiStatus);
  const [localTitle, setLocalTitle] = useState(section.title);
  const [isDirty, setIsDirty] = useState(false);
  const [contentVersion, setContentVersion] = useState(0);
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>("idle");
  const [collabToken, setCollabToken] = useState<string | null>(null);
  const [collabError, setCollabError] = useState<string | null>(null);
  const debouncedVersion = useDebounce(contentVersion, 1500);
  const currentHtmlRef = useRef(section.content);
  const roomName = useMemo(() => `wiki-room-${module}-${section.id}`, [module, section.id]);
  
  // Link dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    if (!canEdit) {
      setCollabToken(null);
      setCollabError(null);
      return;
    }

    const controller = new AbortController();
    setCollabError(null);
    setCollabToken(null);

    void (async () => {
      try {
        const response = await fetch("/api/wiki-collab-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            module,
            sectionId: section.id,
          }),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.token) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : "Collaboration authorization failed"
          );
        }

        setCollabToken(payload.token);
      } catch (error) {
        if (controller.signal.aborted) return;
        setCollabError(error instanceof Error ? error.message : "Collaboration authorization failed");
      }
    })();

    return () => {
      controller.abort();
    };
  }, [canEdit, module, section.id]);

  // Set up Yjs for real-time collaboration using a robust singleton pattern for StrictMode
  const collabSession = useMemo(() => {
    if (!canEdit || !collabToken) return null;
    return getOrCreateYjsProvider(roomName, collabToken);
  }, [canEdit, collabToken, roomName]);
  const editorCanWrite = canEdit && !!collabSession;

  const ydoc = collabSession?.ydoc ?? null;
  const provider = collabSession?.provider ?? null;

  useEffect(() => {
    if (!collabSession) return;

    const cached = collabSession;
    cached.refCount++;

    return () => releaseYjsProvider(roomName, cached);
  }, [collabSession, roomName]);

  // Refs for stable closures in useEditor paste/drop handlers
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  // Memoize extensions to prevent editor re-initialization on every render
  const extensions = useMemo(() => {
    const defaultColors = ['#f79a36', '#4ad991', '#8b5cf6', '#ef4444', '#3b82f6'];
    const sessionEmail = session?.user?.email || "";
    const color = defaultColors[(sessionEmail.charCodeAt(0) || 0) % defaultColors.length] || '#f79a36';

    return [
      StarterKit.configure({
        history: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        // Disable built-ins that we register explicitly below to avoid
        // "[tiptap warn]: Duplicate extension names found: ['link', 'underline']"
        link: false,
        underline: false,
      } as any),
      BulletList,
      OrderedList,
      ListItem,
      Placeholder.configure({ placeholder: "Write section content here..." }),
      Underline,
      TextStyle,
      FontFamily,
      // Phase 2: ImageNode replaces ImageResize — same node name "image" preserves backward compat
      ImageNode,
      VideoNode,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),

      // Phase 2: Table (registered BEFORE Collaboration)
      // tableCell: false prevents TableKit from registering the built-in TableCell —
      // CustomTableCell below is the sole 'tableCell' extension, avoiding the
      // "[tiptap warn]: Duplicate extension names found: ['tableCell']" warning.
      TableKit.configure({ table: { resizable: true }, tableCell: false } as any),
      CustomTableCell,

      // Phase 2: PDF node with dynamic NodeView (avoids SSR crash)
      PdfNode.extend({
        addNodeView() {
          return ReactNodeViewRenderer(DynamicPdfNodeView as any);
        },
      }),

      ...(ydoc && provider
        ? [
            Collaboration.configure({
              document: ydoc,
            }),
            CollaborationCaret.configure({
              provider: provider,
              user: {
                name: session?.user?.name || session?.user?.email?.split('@')[0] || "Anonymous",
                color: color,
              },
            }),
          ]
        : []),
    ];
  }, [provider, session, ydoc]);

  const [editorViewReady, setEditorViewReady] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Phase 2: named upload progress for progress bar UI (shows filename + %)
  const [namedUploadProgress, setNamedUploadProgress] = useState<{ fileName: string; progress: number } | null>(null);

  useEffect(() => {
    setIsSynced(!canEdit);
  }, [canEdit, roomName]);

  const handleMediaUpload = useCallback(async (files: File[]) => {
    const ed = editorRef.current;
    if (!ed || !editorCanWrite) return;
    
    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Parallelize compression and upload
      const results = await Promise.allSettled(files.map(async (file, index) => {
        // 1. Create Optimistic Placeholder
        const localUrl = URL.createObjectURL(file);
        const tempId = `temp-${Date.now()}-${index}`;

        try {
          if (file.type.startsWith("video/")) {
            ed.chain().focus().insertContent({
              type: "video",
              attrs: { src: localUrl, id: tempId, isOptimistic: true }
            }).run();
          } else {
            ed.chain().focus().insertContent({
              type: "image",
              attrs: {
                src: localUrl,
                id: tempId,
                isOptimistic: true
              }
            }).run();
          }

          // 2. Process File
          let processedFile = file;
          if (file.type.startsWith('image/')) {
            processedFile = await compressImage(file);
          }

          const formData = new FormData();
          formData.append("file", processedFile);

          // Phase 2: Use XHR for upload progress tracking
          const { url } = await new Promise<{ url: string }>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/wiki-media");
            xhr.setRequestHeader("x-wiki-module", module);

            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                setNamedUploadProgress({ fileName: file.name, progress: pct });
              }
            });

            xhr.addEventListener("load", () => {
              setNamedUploadProgress(null);
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  resolve(JSON.parse(xhr.responseText));
                } catch {
                  reject(new Error("Invalid server response"));
                }
              } else {
                let errMsg = "Upload failed";
                try {
                  const payload = JSON.parse(xhr.responseText);
                  if (typeof payload?.error === "string") errMsg = payload.error;
                } catch { /* ignore */ }
                reject(new Error(errMsg));
              }
            });

            xhr.addEventListener("error", () => {
              setNamedUploadProgress(null);
              reject(new Error("Upload network error"));
            });

            xhr.send(formData);
          });
          
          // 3. Finalize: Replace placeholder with real URL
          // We find the node with the temp ID and update its src
          ed.state.doc.descendants((node, pos) => {
            if (node.attrs.id === tempId) {
              ed.chain().setNodeSelection(pos).updateAttributes(node.type.name, {
                src: url,
                isOptimistic: false,
                id: null // clear temp id
              }).run();
              return false;
            }
          });
        } catch (error) {
          let failedNodePosition: number | null = null;
          ed.state.doc.descendants((node, pos) => {
            if (node.attrs.id === tempId) {
              failedNodePosition = pos;
              return false;
            }
            return true;
          });

          if (failedNodePosition !== null) {
            ed.chain().setNodeSelection(failedNodePosition).deleteSelection().run();
          }

          throw error;
        } finally {
          URL.revokeObjectURL(localUrl);
          setUploadProgress(prev => Math.min(100, prev + Math.round(100 / files.length)));
        }
      }));

      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length > 0) {
        const firstReason = (failed[0] as PromiseRejectedResult).reason;
        const serverMsg = firstReason instanceof Error ? firstReason.message : "Media upload failed";
        setUploadError(
          failed.length === files.length
            ? serverMsg
            : `${failed.length} file${failed.length === 1 ? "" : "s"} failed to upload`
        );
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Media upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress(100);
    }
  }, [editorCanWrite, module]);

  const uploadRef = useRef(handleMediaUpload);
  uploadRef.current = handleMediaUpload;

  const editorProps = useMemo(() => ({
    handlePaste: (view: any, event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return false;

      // 1. Try direct files
      const files = Array.from(clipboardData.files || [])
        .filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
      
      if (files.length > 0) {
        event.preventDefault();
        uploadRef.current(files);
        return true;
      }

      // 2. Try items fallback (image/video binary data)
      const items = Array.from(clipboardData.items || []);
      const itemFiles = items
        .filter(item => item.kind === 'file' && (item.type.startsWith('image/') || item.type.startsWith('video/')))
        .map(item => item.getAsFile())
        .filter((file): file is File => !!file);

      if (itemFiles.length > 0) {
        event.preventDefault();
        uploadRef.current(itemFiles);
        return true;
      }

      // 3. Detect pasted text that is a direct image URL — insert as image node
      const pastedText = clipboardData.getData('text/plain')?.trim();
      if (pastedText) {
        const imageUrlPattern = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|bmp|avif|tiff)(\?.*)?$/i;
        if (imageUrlPattern.test(pastedText)) {
          event.preventDefault();
          const ed = editorRef.current;
          if (ed) {
            ed.chain().focus().insertContent({
              type: "image",
              attrs: { src: pastedText }
            }).run();
          }
          return true;
        }
      }

      return false;
    },
    handleDrop: (view: any, event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer) return false;

      const files = Array.from(dataTransfer.files || [])
        .filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
      
      if (files.length > 0) {
        event.preventDefault();
        uploadRef.current(files);
        return true;
      }
      return false;
    },
    attributes: {
      class: "prose prose-invert prose-sm max-w-none flex-1 min-h-[720px] px-8 pt-6 pb-72 text-sm text-foreground outline-none focus:outline-none [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-foreground [&_h3]:text-base [&_h3]:font-medium [&_p]:text-foreground/80 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-foreground/80 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:text-foreground/80 [&_li]:text-foreground/80 [&_strong]:text-foreground [&_blockquote]:border-primary/30 [&_blockquote]:text-muted-foreground [&_code]:text-primary [&_code]:bg-primary/10 [&_code]:px-1 [&_code]:rounded [&_.is-editor-empty:first-child::before]:text-muted-foreground/30",
    },
  }), []);

  const editor = useEditor({
    extensions,
    editable: editorCanWrite,
    content: !canEdit ? section.content : "",
    immediatelyRender: false,
    onCreate: () => setEditorViewReady(true),
    onDestroy: () => setEditorViewReady(false),
    onUpdate: ({ editor }) => {
      currentHtmlRef.current = editor.getHTML();
      setIsDirty(true);
      setAutoSaveState("pending");
      setContentVersion((value) => value + 1);
    },
    editorProps,
  }, [ydoc]);

  // Reset view-ready flag whenever the editor instance is replaced (ydoc change).
  useEffect(() => {
    setEditorViewReady(false);
  }, [editor]);

  // Only inject HTML payload from the database ONCE on initial Yjs sync if it's completely empty.
  useEffect(() => {
    if (!editor || !provider) return;
    
    let initialized = false;
    let hasCompletedInitialSync = provider.synced;
    let disposed = false;
    const syncTimeout = window.setTimeout(() => {
      if (disposed || hasCompletedInitialSync) return;
      setIsSynced(false);
      setCollabError(
        "The collaboration server did not finish syncing. Check the Yjs WebSocket URL and try again."
      );
    }, COLLAB_SYNC_TIMEOUT_MS);

    const clearSyncTimeout = () => window.clearTimeout(syncTimeout);
    
    const handleSynced = ({ state }: HocuspocusSyncedPayload) => {
      if (disposed) return;
      hasCompletedInitialSync = state;
      setIsSynced(state);
      
      if (!state) return;

      clearSyncTimeout();
      setCollabError(null);

      if (initialized || !ydoc) return;
      initialized = true;
      // If the Yjs document is still totally empty after syncing, drop the DB payload into it.
      const fragment = ydoc.getXmlFragment("default");
      if (section.content && fragment.length === 0 && editor.isEmpty) {
        editor.commands.setContent(section.content, { emitUpdate: true });
        currentHtmlRef.current = section.content;
      } else {
        currentHtmlRef.current = editor.getHTML();
      }
    };

    const handleAuthenticationFailed = ({ reason }: HocuspocusAuthenticationFailedPayload) => {
      if (disposed) return;
      clearSyncTimeout();
      setIsSynced(false);
      setCollabError(
        reason
          ? `Collaboration authentication failed: ${reason}`
          : "Collaboration authentication failed."
      );
    };

    const handleDisconnect = ({ event }: HocuspocusDisconnectPayload) => {
      if (disposed || hasCompletedInitialSync) return;
      clearSyncTimeout();
      setIsSynced(false);
      const details = event?.reason || (event?.code ? `code ${event.code}` : null);
      setCollabError(
        details
          ? `Collaboration server disconnected before sync completed (${details}).`
          : "Collaboration server disconnected before sync completed."
      );
    };
    
    provider.on("synced", handleSynced);
    provider.on("authenticationFailed", handleAuthenticationFailed);
    provider.on("disconnect", handleDisconnect);
    
    // Check initial state if already synced
    if (provider.synced) {
      handleSynced({ state: true });
    }
    
    return () => {
      disposed = true;
      clearSyncTimeout();
      provider.off("synced", handleSynced);
      provider.off("authenticationFailed", handleAuthenticationFailed);
      provider.off("disconnect", handleDisconnect);
    };
  }, [editor, provider, section.content, ydoc]);

  // Sync editorRef as an effect to avoid render-phase re-assignment issues
  useEffect(() => {
    if (editor) {
      editorRef.current = editor;
    }
  }, [editor]);

  useEffect(() => {
    setLocalTitle(section.title);
  }, [section.section, section.title]);

  useEffect(() => {
    currentHtmlRef.current = section.content;
  }, [section.content, section.id]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange, section.section]);

  const moduleApi = module === "clash" ? trpc.clash : trpc.sim;
  const moduleUtils = module === "clash" ? utils.clash : utils.sim;

  const upsert = moduleApi.upsertWikiSection.useMutation({
    onSuccess: (saved) => {
      moduleUtils.getWikiSections.setData(undefined, (current) =>
        upsertSectionInCache(current, saved)
      );
      onSave?.();
    },
  });

  const contentVersionRef = useRef(contentVersion);
  useEffect(() => {
    contentVersionRef.current = contentVersion;
  }, [contentVersion]);

  const lastSavedVersionRef = useRef(0);

  const getPersistedContent = useCallback(() => {
    if (editor) {
      const html = editor.getHTML();
      currentHtmlRef.current = html;
      return html;
    }

    return currentHtmlRef.current || section.content;
  }, [editor, section.content]);

  useEffect(() => {
    if (debouncedVersion === 0 || debouncedVersion === lastSavedVersionRef.current || !editor || upsert.isPending) return;
    
    // We only save the structural metadata (title, status).
    // CRDT handles the actual text/HTML payload internally via WebSockets and Prisma.
    // If only text is changing across multiple clients, we avoid hitting this.
    // However, if localTitle changes, it will trigger an upsert.
    const versionToSave = debouncedVersion;
    setAutoSaveState("saving");
    
    upsert.mutate(
      {
        section: section.section,
        title: localTitle,
        content: getPersistedContent(),
        status,
      },
      {
        onSuccess: () => {
          lastSavedVersionRef.current = versionToSave;
          if (contentVersionRef.current === versionToSave) {
             // For purely text edits, it syncs instantly. The "saving" indicator might flash
             // but Yjs handles the true persistence.
            setIsDirty(false);
            setAutoSaveState("saved");
          } else {
            setAutoSaveState("pending");
          }
        },
      }
    );
  }, [
    debouncedVersion,
    editor,
    localTitle,
    section.content,
    section.section,
    status,
    getPersistedContent,
    upsert.isPending
  ]);

  const handleSave = () => {
    if (!editor || upsert.isPending) return;
    const currentVersion = contentVersion;
    setAutoSaveState("saving");
    upsert.mutate(
      {
        section: section.section,
        title: localTitle,
        content: getPersistedContent(),
        status,
      },
      {
        onSuccess: () => {
          lastSavedVersionRef.current = currentVersion;
          if (contentVersionRef.current === currentVersion) {
            setIsDirty(false);
            setAutoSaveState("saved");
          } else {
            setAutoSaveState("pending");
          }
        },
      }
    );
  };

  const focusEditorSurface = () => {
    if (!editor) return;

    if (editor.state.doc.childCount === 0) {
      editor.commands.setContent("<p></p>", { emitUpdate: false });
    }

    editor.chain().focus("end").run();
  };

  const showEditorInitializing = canEdit && (!editor || !editorCanWrite || !isSynced) && !collabError;
  const showEmptyCanvasHint = !!editor && editorCanWrite && isSynced && editor.isEmpty;

  const toolbarButtons = editor
    ? [
        {
          icon: Bold,
          action: () => editor.chain().focus().toggleBold().run(),
          active: editor.isActive("bold"),
          label: "Bold",
        },
        {
          icon: Italic,
          action: () => editor.chain().focus().toggleItalic().run(),
          active: editor.isActive("italic"),
          label: "Italic",
        },
        {
          icon: UnderlineIcon,
          action: () => editor.chain().focus().toggleUnderline().run(),
          active: editor.isActive("underline"),
          label: "Underline",
        },
        {
          icon: Heading2,
          action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          active: editor.isActive("heading", { level: 2 }),
          label: "H2",
        },
        {
          icon: Heading3,
          action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
          active: editor.isActive("heading", { level: 3 }),
          label: "H3",
        },
        {
          icon: List,
          action: () => editor.chain().focus().toggleBulletList().run(),
          active: editor.isActive("bulletList"),
          label: "Bullet",
        },
        {
          icon: ListOrdered,
          action: () => editor.chain().focus().toggleOrderedList().run(),
          active: editor.isActive("orderedList"),
          label: "Number",
        },
        {
          icon: LinkIcon,
          action: () => {
            const currentUrl = editor.getAttributes("link").href || "";
            setLinkUrl(currentUrl);
            setLinkDialogOpen(true);
          },
          active: editor.isActive("link"),
          label: "Link",
        },
        {
          icon: ImageIcon,
          action: () => {
             const input = document.getElementById('wiki-image-upload') as HTMLInputElement;
             if (input) input.click();
          },
          active: false,
          label: "Image",
        },
        {
          icon: VideoIcon,
          action: () => {
             const input = document.getElementById('wiki-video-upload') as HTMLInputElement;
             if (input) input.click();
          },
          active: false,
          label: "Video",
        },
        {
          icon: Table2,
          action: () => {
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
          },
          active: false,
          label: "Table",
        },
      ]
    : [];

  return (
    <div className="flex flex-col h-full">
      {canEdit && editor && (
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-0.5">
            <Select 
              disabled={!editorCanWrite}
              onValueChange={(value) => editor.chain().focus().setFontFamily(value).run()}
            >
              <SelectTrigger className="h-7 w-[100px] text-[10px] bg-secondary/30 border-none hover:bg-secondary/50 transition-colors">
                 <div className="flex items-center gap-1.5 overflow-hidden">
                    <Type size={12} className="shrink-0 opacity-50" />
                    <SelectValue placeholder="Font" />
                 </div>
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="Inter" className="text-[10px] font-sans">Inter</SelectItem>
                <SelectItem value="'Playfair Display', serif" className="text-[10px] font-serif">Serif</SelectItem>
                <SelectItem value="'JetBrains Mono', monospace" className="text-[10px] font-mono">Monospace</SelectItem>
                <SelectItem value="Outfit" className="text-[10px]">Outfit</SelectItem>
                <SelectItem value="Roboto" className="text-[10px]">Roboto</SelectItem>
              </SelectContent>
            </Select>

            <div className="w-[1px] h-4 bg-border/30 mx-1" />

            <input
               id="wiki-image-upload"
               type="file"
               accept="image/*"
               multiple
               className="hidden"
               title="Upload Image"
               aria-label="Upload image"
               onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) handleMediaUpload(files);
               }}
            />
            <input
               id="wiki-video-upload"
               type="file"
               accept="video/*"
               multiple
               className="hidden"
               title="Upload Video"
               aria-label="Upload video"
               onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) handleMediaUpload(files);
               }}
            />
            {/* Phase 2: PDF upload — triggered by slash menu PDF item */}
            <input
               id="wiki-pdf-upload"
               type="file"
               accept="application/pdf"
               className="hidden"
               title="Upload PDF"
               aria-label="Upload PDF"
               onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file || !editor) return;
                  const fileName = file.name;
                  const formData = new FormData();
                  formData.append("file", file);
                  const xhr = new XMLHttpRequest();
                  xhr.open("POST", "/api/wiki-media");
                  xhr.setRequestHeader("x-wiki-module", module);
                  xhr.upload.addEventListener("progress", (ev) => {
                    if (ev.lengthComputable) {
                      setNamedUploadProgress({ fileName, progress: Math.round((ev.loaded / ev.total) * 100) });
                    }
                  });
                  xhr.addEventListener("load", () => {
                    setNamedUploadProgress(null);
                    if (xhr.status >= 200 && xhr.status < 300) {
                      const { url } = JSON.parse(xhr.responseText) as { url: string };
                      // Extract fileId from returned URL or use the URL directly
                      const fileIdMatch = url.match(/[?&]id=([^&]+)/) ?? url.match(/\/d\/([^/]+)/);
                      const fileId = fileIdMatch ? fileIdMatch[1] : url;
                      editor.chain().focus().insertContent({
                        type: "pdf",
                        attrs: { fileId, fileName, caption: null, height: 500 },
                      }).run();
                    }
                    // Reset input so the same file can be re-selected
                    e.target.value = "";
                  });
                  xhr.addEventListener("error", () => {
                    setNamedUploadProgress(null);
                    e.target.value = "";
                  });
                  xhr.send(formData);
               }}
            />

            {toolbarButtons.map((btn) => {
              const Icon = btn.icon;
              return (
                <button
                  key={btn.label}
                  onClick={btn.action}
                  disabled={isUploading || !editorCanWrite}
                  title={btn.label}
                  aria-label={btn.label}
                  className={cn(
                    "p-1.5 rounded-md transition-smooth",
                    btn.active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                    isUploading && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <Icon size={15} />
                </button>
              );
            })}
            {isUploading && (
              <div className="flex items-center gap-2 ml-2 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                <Loader2 size={12} className="animate-spin text-primary" />
                <span className="text-[10px] font-medium text-primary">{uploadProgress}%</span>
              </div>
            )}
            {uploadError && (
              <span className="ml-2 text-[11px] text-destructive">
                {uploadError}
              </span>
            )}
            {collabError && (
              <span className="ml-2 text-[11px] text-destructive">
                {collabError}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {autoSaveState === "pending" && (
              <span className="text-[11px] text-muted-foreground/60 min-w-[60px] text-right">
                Editing...
              </span>
            )}
            {autoSaveState === "saving" && (
              <span className="text-[11px] text-muted-foreground/60 min-w-[60px] text-right">
                Saving...
              </span>
            )}
            {autoSaveState === "saved" && (
              <span className="text-[11px] text-chart-2 flex items-center gap-1 min-w-[60px] justify-end">
                <Check size={11} /> Saved
              </span>
            )}
            {autoSaveState === "idle" && isDirty && editorCanWrite && (
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5 gradient-accent text-white hover:opacity-90"
                onClick={handleSave}
                disabled={upsert.isPending}
              >
                <Save size={12} />
                Save
              </Button>
            )}

            <button
              onClick={() => window.print()}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-smooth"
              title="Print"
              aria-label="Print"
            >
              <Printer size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        <div className="px-8 pt-8 pb-4">
           <input
              className="w-full bg-transparent text-3xl font-bold text-foreground outline-none border-none placeholder:opacity-20"
              value={localTitle}
              disabled={!editorCanWrite}
              aria-label="Module title"
              onChange={(e) => {
                setLocalTitle(e.target.value);
                setIsDirty(true);
                setAutoSaveState("pending");
                setContentVersion((v) => v + 1);
              }}
              placeholder="Module Title..."
           />
        </div>
        {/* Phase 2: upload progress bar (named, shows filename + %) */}
        {namedUploadProgress && (
          <div className="mx-8 mb-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate max-w-[200px]">{namedUploadProgress.fileName}</span>
              <span>{namedUploadProgress.progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{ width: `${namedUploadProgress.progress}%` }}
              />
            </div>
          </div>
        )}
        {/* Phase 2: drag handle + editor content + slash menu */}
        <div className="flex flex-col flex-1 mx-auto w-full max-w-4xl mb-24 min-h-[760px] rounded-[28px] border border-border/50 bg-white shadow-[0_24px_60px_-38px_rgba(15,23,42,0.3)] backdrop-blur-sm overflow-visible">
          {showEditorInitializing ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/15 bg-primary/8 text-primary">
                <Loader2 size={28} className="animate-spin" />
              </div>
              <div className="space-y-2">
                <p className="text-base font-semibold text-foreground">
                  Connecting to collaboration session
                </p>
                <p className="text-sm text-muted-foreground max-w-[280px]">
                  Please wait while we sync your document with the latest version from the cloud.
                </p>
              </div>
            </div>
          ) : null}

          {collabError ? (
            <div className="mx-6 my-6 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {collabError}
            </div>
          ) : null}

          {editor && isSynced ? (
            <div className="group relative flex flex-col flex-1">
              {showEmptyCanvasHint ? (
                <button
                  type="button"
                  className="mx-8 mt-8 flex w-[calc(100%-4rem)] items-start gap-3 rounded-2xl border border-dashed border-primary/25 bg-primary/[0.04] px-4 py-4 text-left transition-colors hover:bg-primary/[0.08]"
                  onClick={focusEditorSurface}
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-white text-primary">
                    <FileText size={16} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      Start writing here
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Click anywhere in the canvas below, or type <span className="font-semibold text-foreground">/</span> to insert a table, image, video, or PDF.
                    </span>
                  </span>
                </button>
              ) : null}

              {editorCanWrite && editorViewReady && <WikiDragHandle editor={editor} />}
              <div className="px-12 py-10">
                <EditorContent editor={editor} />
              </div>
              {editorCanWrite && editorViewReady && (
                <SlashDropdownMenu editor={editor} items={WIKI_SLASH_ITEMS} />
              )}
            </div>
          ) : null}
        </div>
      </div>
      {/* Table overlays rendered outside backdrop-blur-sm to avoid Chrome's
          backdrop-filter containing-block bug that shifts position:fixed coordinates */}
      {editor && editorCanWrite && editorViewReady && (
        <>
          <TableHandle editor={editor} />
          <TableCellHandleMenu editor={editor} />
        </>
      )}
      <WikiLinkDialog
        isOpen={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        url={linkUrl}
        setUrl={setLinkUrl}
        onApply={(url) => {
          if (!editor) return;
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          } else {
            editor.chain().focus().unsetLink().run();
          }
          setLinkDialogOpen(false);
          setLinkUrl("");
        }}
      />
    </div>
  );
}
