"use client";

// Toolbar UI for the WikiEditor (extracted verbatim from WikiEditor.tsx).
// Receives the live editor instance and the callbacks/state it needs as props;
// no logic or styling changes — pure code move.

import type { Editor } from "@tiptap/react";

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
  Table2,
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
import { cn } from "@/lib/core/utils";

export type AutoSaveState = "idle" | "pending" | "saving" | "saved";

interface EditorToolbarProps {
  editor: Editor;
  editorCanWrite: boolean;
  module: "clash" | "sim";
  isUploading: boolean;
  uploadProgress: number;
  uploadError: string | null;
  collabError: string | null;
  autoSaveState: AutoSaveState;
  isDirty: boolean;
  isSavePending: boolean;
  onSave: () => void;
  onMediaUpload: (files: File[]) => void;
  onReconnectGoogleDrive: () => void;
  setUploadError: (error: string | null) => void;
  setNamedUploadProgress: (progress: { fileName: string; progress: number } | null) => void;
  setLinkUrl: (url: string) => void;
  setLinkDialogOpen: (open: boolean) => void;
}

export function EditorToolbar({
  editor,
  editorCanWrite,
  module,
  isUploading,
  uploadProgress,
  uploadError,
  collabError,
  autoSaveState,
  isDirty,
  isSavePending,
  onSave,
  onMediaUpload,
  onReconnectGoogleDrive,
  setUploadError,
  setNamedUploadProgress,
  setLinkUrl,
  setLinkDialogOpen,
}: EditorToolbarProps) {
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
                if (files.length > 0) onMediaUpload(files);
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
                if (files.length > 0) onMediaUpload(files);
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
                  } else {
                    try {
                      const payload = JSON.parse(xhr.responseText);
                      if (payload?.code === "reconnect_required") {
                        onReconnectGoogleDrive();
                      } else if (typeof payload?.error === "string") {
                        setUploadError(payload.error);
                      } else {
                        setUploadError("PDF upload failed");
                      }
                    } catch {
                      setUploadError("PDF upload failed");
                    }
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
              onClick={onSave}
              disabled={isSavePending}
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
  );
}
