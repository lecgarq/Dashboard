"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { FontFamily } from "@tiptap/extension-font-family";
import { TextStyle } from "@tiptap/extension-text-style";
import { ImageResize } from "tiptap-extension-resize-image";
import { Node, mergeAttributes } from "@tiptap/core";
import type { ClashWiki } from "@prisma/client";

import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import { useSession } from "next-auth/react";

const VideoNodeView = (props: any) => {
  const { node, updateAttributes, selected } = props;
  
  // Custom resize handler using basic localized state mapped back to tiptap attributes
  const handleDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = node.attrs.width || 400;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentX = moveEvent.pageX;
      const newWidth = Math.max(150, startWidth + (currentX - startX));
      updateAttributes({ width: newWidth });
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [node.attrs.width, updateAttributes]);

  return (
    <NodeViewWrapper 
       className={cn("relative inline-block overflow-hidden transition-all duration-200 group my-4", selected ? "ring-2 ring-primary" : "")} 
       style={{ width: node.attrs.width ? `${node.attrs.width}px` : '100%', maxWidth: '100%' }}
    >
      <video
        src={node.attrs.src}
        controls={node.attrs.controls}
        preload="metadata"
        className="w-full h-auto rounded-xl shadow-lg border border-border/50 block"
      />
      {/* Handle for resizing */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 group-hover:opacity-100 bg-primary/80 backdrop-blur-sm rounded-tl-md flex items-center justify-center pointer-events-auto"
        onMouseDown={handleDrag}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
      </div>
    </NodeViewWrapper>
  );
};

const Video = Node.create({
  name: 'video',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true },
      width: { default: null },
    }
  },

  parseHTML() {
    return [ { tag: 'video' } ]
  },

  renderHTML({ HTMLAttributes }) {
    // When rendered outside the editor (e.g. read-only display), just render a raw video tag with the saved width
    return ['video', mergeAttributes(HTMLAttributes, { 
      class: 'max-w-full rounded-xl shadow-lg border border-border/50 my-4 block',
      controls: true,
      preload: 'metadata',
      style: HTMLAttributes.width ? `width: ${HTMLAttributes.width}px` : undefined
    })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeView);
  },
});

/**
 * Compress an image file using Canvas API before upload.
 * Skips non-images, SVGs, and small files (<200KB).
 * Converts to JPEG at 0.82 quality, max 1920px on either dimension.
 */
async function compressImage(file: File): Promise<File> {
  try {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') return file;
    if (file.size < 200 * 1024) return file;

    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;

    const MAX = 1920;
    let targetW = width;
    let targetH = height;
    if (width > MAX || height > MAX) {
      const ratio = Math.min(MAX / width, MAX / height);
      targetW = Math.round(width * ratio);
      targetH = Math.round(height * ratio);
    }

    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });

    // If compression made it larger, return original
    if (blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '.jpg');
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

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
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
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

function toSectionKey(section: string) {
  const candidate = section.split("-").slice(1).join("-");
  return candidate || section;
}

function upsertSectionInCache(
  current: ClashWiki[] | undefined,
  incoming: ClashWiki
): ClashWiki[] | undefined {
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

function getYjsWsUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_YJS_WS_URL || "ws://localhost:4444";
  // If page is served over HTTPS, upgrade ws:// to wss:// to avoid SecurityError
  if (typeof window !== "undefined" && window.location.protocol === "https:" && envUrl.startsWith("ws://")) {
    return "wss://" + envUrl.slice(5);
  }
  return envUrl;
}

const yjsCache = new Map<string, { ydoc: Y.Doc; provider: WebsocketProvider; refCount: number }>();

function getOrCreateYjsProvider(roomName: string, email?: string) {
  let cached = yjsCache.get(roomName);
  if (!cached) {
    const baseUrl = getYjsWsUrl();
    const secureUrl = email ? `${baseUrl}?email=${encodeURIComponent(email)}` : baseUrl;
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(secureUrl, roomName, ydoc, {
      connect: false,
      // Reduce reconnect spam when WS server is unavailable
      maxBackoffTime: 10000,
    });
    // Connect asynchronously to avoid throwing SecurityError during render
    try {
      provider.connect();
    } catch {
      console.warn(`[WikiEditor] Failed to connect WebSocket for room "${roomName}"`);
    }
    cached = { ydoc, provider, refCount: 0 };
    yjsCache.set(roomName, cached);
  }
  return cached;
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

  const [status, setStatus] = useState<WikiStatus>(section.status as WikiStatus);
  const [localTitle, setLocalTitle] = useState(section.title);
  const [isDirty, setIsDirty] = useState(false);
  const [contentVersion, setContentVersion] = useState(0);
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>("idle");
  const debouncedVersion = useDebounce(contentVersion, 1500);
  const currentHtmlRef = useRef(section.content);

  // Set up Yjs for real-time collaboration using a robust singleton pattern for StrictMode
  const { ydoc, provider } = useMemo(() => {
    const roomName = `wiki-room-${module}-${section.id}`;
    return getOrCreateYjsProvider(roomName, session?.user?.email ?? undefined);
  }, [module, section.id, session?.user?.email]);

  useEffect(() => {
    const roomName = `wiki-room-${module}-${section.id}`;
    const cached = getOrCreateYjsProvider(roomName, session?.user?.email ?? undefined);
    cached.refCount++;

    return () => {
      cached.refCount--;
      if (cached.refCount <= 0) {
        // Small timeout allows React StrictMode to remount synchronously without killing the websocket connection
        setTimeout(() => {
          if (cached.refCount <= 0) {
            cached.provider.destroy();
            cached.ydoc.destroy();
            yjsCache.delete(roomName);
          }
        }, 100);
      }
    };
  }, [module, section.id]);

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
      } as any),
      BulletList,
      OrderedList,
      ListItem,
      Placeholder.configure({ placeholder: "Write section content here..." }),
      Underline,
      TextStyle,
      FontFamily,
      ImageResize.configure({
        inline: false,
        minWidth: 100,
      }),
      Video,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),
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
    ];
  }, [session, ydoc, provider]);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleMediaUpload = useCallback(async (files: File[]) => {
    const ed = editorRef.current;
    if (!ed) {
      console.warn("[WikiEditor] No editor instance found in ref");
      return;
    }
    
    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(0);
    console.log(`[WikiEditor] Starting upload of ${files.length} files...`);

    try {
      for (let i = 0; i < files.length; i++) {
        let file = files[i];
        console.log(`[WikiEditor] Processing file ${i + 1}: ${file.name} (${file.type})`);
        setUploadProgress(Math.round(((i) / files.length) * 100));

        if (file.type.startsWith('image/')) {
          file = await compressImage(file);
        }

        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/wiki-media", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }));
          console.error("[WikiMedia] API Error:", err.error);
          throw new Error(typeof err.error === "string" ? err.error : "Upload failed");
        }

        const { url } = await res.json();
        console.log(`[WikiEditor] Upload success: ${url}`);

        if (file.type.startsWith("video/")) {
          ed.chain().focus().insertContent({
            type: 'video',
            attrs: { src: url }
          }).run();
        } else {
          (ed.chain().focus() as any).setImage({ src: url }).run();
        }

        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }
    } catch (err) {
      console.error("[WikiEditor] Upload sequence failed:", err);
      setUploadError(err instanceof Error ? err.message : "Media upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress(100);
      console.log("[WikiEditor] Upload sequence finished.");
    }
  }, []);

  const uploadRef = useRef(handleMediaUpload);
  uploadRef.current = handleMediaUpload;

  const editorProps = useMemo(() => ({
    handlePaste: (view: any, event: ClipboardEvent) => {
      console.log("[WikiEditor] handlePaste invoked. clipboardData:", event.clipboardData);
      const clipboardData = event.clipboardData;
      if (!clipboardData) return false;

      // 1. Try direct files
      const files = Array.from(clipboardData.files || [])
        .filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
      
      if (files.length > 0) {
        console.log(`[WikiEditor] Paste detected ${files.length} direct files.`);
        event.preventDefault();
        uploadRef.current(files);
        return true;
      }

      // 2. Try items fallback
      const items = Array.from(clipboardData.items || []);
      const itemFiles = items
        .map(item => item.getAsFile())
        .filter((file): file is File => !!file && (file.type.startsWith('image/') || file.type.startsWith('video/')));
      
      if (itemFiles.length > 0) {
        console.log(`[WikiEditor] Paste detected ${itemFiles.length} item files.`);
        event.preventDefault();
        uploadRef.current(itemFiles);
        return true;
      }
      
      console.log("[WikiEditor] No media found in paste.");
      return false;
    },
    handleDrop: (view: any, event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer) return false;

      const files = Array.from(dataTransfer.files || [])
        .filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
      
      if (files.length > 0) {
        event.preventDefault();
        console.log(`[WikiEditor] Drop detected with ${files.length} media files`);
        uploadRef.current(files);
        return true;
      }
      return false;
    },
    attributes: {
      class: "prose prose-invert prose-sm max-w-none min-h-[400px] px-8 py-6 text-sm text-foreground outline-none focus:outline-none [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-foreground [&_h3]:text-base [&_h3]:font-medium [&_p]:text-foreground/80 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-foreground/80 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:text-foreground/80 [&_li]:text-foreground/80 [&_strong]:text-foreground [&_blockquote]:border-primary/30 [&_blockquote]:text-muted-foreground [&_code]:text-primary [&_code]:bg-primary/10 [&_code]:px-1 [&_code]:rounded [&_.is-editor-empty:first-child::before]:text-muted-foreground/30",
    },
  }), []);

  const editor = useEditor({
    extensions,
    editable: isAdmin,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      currentHtmlRef.current = editor.getHTML();
      setIsDirty(true);
      setAutoSaveState("pending");
      setContentVersion((value) => value + 1);
    },
    editorProps,
  });

  // Only inject HTML payload from the database ONCE on initial Yjs sync if it's completely empty!
  useEffect(() => {
    if (!editor || !section.content) return;
    
    let initialized = false;
    
    const handleSync = (isSynced: boolean) => {
      if (isSynced && !initialized) {
        initialized = true;
        // If the Yjs document is still totally empty after syncing, we drop the DB payload into it
        if (editor.isEmpty) {
          editor.commands.setContent(section.content, { emitUpdate: true });
          currentHtmlRef.current = section.content;
        } else {
          currentHtmlRef.current = editor.getHTML();
        }
      }
    };
    
    // @ts-ignore
    provider.on('sync', handleSync);
    
    return () => {
      // @ts-ignore
      provider.off('sync', handleSync);
    };
  }, [editor, provider, section.content]);

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

  const upsert = (trpc as any)[module].upsertWikiSection.useMutation({
    onSuccess: (saved: any) => {
      (utils as any)[module].getWikiSections.setData(undefined, (current: any) =>
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
            const url = window.prompt('URL');
            if (url) editor.chain().focus().setLink({ href: url }).run();
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
      ]
    : [];

  return (
    <div className="flex flex-col h-full">
      {isAdmin && editor && (
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-0.5">
            <Select 
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
               onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) handleMediaUpload(files);
               }}
            />

            {toolbarButtons.map((btn) => {
              const Icon = btn.icon;
              return (
                <button
                  key={btn.label}
                  onClick={btn.action}
                  disabled={isUploading}
                  title={btn.label}
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
            {autoSaveState === "idle" && isDirty && (
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
            >
              <Printer size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="px-8 pt-8 pb-4">
           <input 
              className="w-full bg-transparent text-3xl font-bold text-foreground outline-none border-none placeholder:opacity-20"
              value={localTitle}
              onChange={(e) => {
                setLocalTitle(e.target.value);
                setIsDirty(true);
                setAutoSaveState("pending");
                setContentVersion((v) => v + 1);
              }}
              placeholder="Module Title..."
           />
        </div>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
