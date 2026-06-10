"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { formatFileSize, getFilePreviewIcon } from "./helpers";

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

export function FilePreviewBar({
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
