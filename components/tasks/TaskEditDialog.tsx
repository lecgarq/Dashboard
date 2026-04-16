"use client";

import type { TaskAttachment, UserTask } from "@prisma/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UploadDropzone } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";
import { trpc } from "@/lib/core/trpc";

type TaskWithAttachments = UserTask & { attachments: TaskAttachment[] };

interface TaskEditDialogProps {
  task: TaskWithAttachments | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskEditDialog({ task, open, onOpenChange }: TaskEditDialogProps) {
  const utils = trpc.useUtils();
  const addAttachment = trpc.tasks.addAttachment.useMutation({
    onSuccess: (attachment) => {
      utils.tasks.getMyTasks.setData(undefined, (current = []) =>
        current.map((item) =>
          item.id === attachment.taskId
            ? { ...item, attachments: [...item.attachments, attachment] }
            : item
        )
      );
    },
  });

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">{task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2 text-foreground">
          <div className="text-sm text-foreground/80 whitespace-pre-wrap">
            {task.description || "No description provided."}
          </div>

          <div className="pt-4 border-t border-border/50">
            <h4 className="text-sm font-semibold mb-3">Attachments</h4>
            <div className="space-y-2 mb-4 max-h-[150px] overflow-auto">
              {task.attachments?.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/40 text-xs"
                >
                  <span className="truncate">{attachment.name || "Attachment"}</span>
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline shrink-0 ml-4"
                  >
                    View
                  </a>
                </div>
              ))}
              {(!task.attachments || task.attachments.length === 0) && (
                <div className="text-xs text-muted-foreground/50">
                  No attachments yet.
                </div>
              )}
            </div>

            <UploadDropzone<OurFileRouter, "taskAttachment">
              endpoint="taskAttachment"
              onClientUploadComplete={(uploads) => {
                uploads.forEach((file) => {
                  addAttachment.mutate({
                    taskId: task.id,
                    url: file.url,
                    name: file.name,
                    type: file.type,
                  });
                });
              }}
              onUploadError={(error) => alert(`Upload Error: ${error.message}`)}
              appearance={{
                container:
                  "border-muted-foreground/20 hover:border-primary/50 transition-colors py-4",
                label: "text-muted-foreground hover:text-foreground",
                button: "bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-md",
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
