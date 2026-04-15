"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { BimViewer } from "./BimViewer";
import { useRole } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Folder,
  FolderOpen,
  FileCode2,
  ChevronRight,
  ChevronDown,
  Loader2,
  Box,
  X,
} from "lucide-react";

interface FolderRowProps {
  id: string;
  name: string;
  search: string;
}

function FolderRow({ id, name, search }: FolderRowProps) {
  const { isEditor } = useRole();
  const [open, setOpen] = useState(false);
  const [viewUrn, setViewUrn] = useState<string | null>(null);

  const { data, isLoading } = trpc.families.listApsFolder.useQuery(
    { folderId: id },
    { enabled: open }
  );

  const translate = trpc.families.translateApsItem.useMutation({
    onSuccess: ({ urn }, vars) => {
      // Start polling for this urn on the item level
      setPendingUrns((prev) => ({ ...prev, [vars.itemId]: urn }));
    },
  });

  const [pendingUrns, setPendingUrns] = useState<Record<string, string>>({});

  const folders = data?.folders ?? [];
  const items = (data?.items ?? []).filter((item) =>
    search ? item.name.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-sm text-foreground hover:bg-muted/30 transition-smooth"
      >
        {open ? (
          <FolderOpen size={15} className="text-chart-3 shrink-0" />
        ) : (
          <Folder size={15} className="text-chart-3 shrink-0" />
        )}
        <span className="flex-1 text-left truncate font-medium">{name}</span>
        {open ? (
          <ChevronDown size={13} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="pl-5 border-l border-border/30 ml-4 mt-0.5 space-y-0.5">
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Loading…
            </div>
          )}

          {/* Sub-folders */}
          {folders.map((f) => (
            <FolderRow key={f.id} id={f.id} name={f.name} search={search} />
          ))}

          {/* RFA items */}
          {items.map((item) => {
            const pendingUrn = pendingUrns[item.id];
            return (
              <div key={item.id}>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted/20 group">
                  <FileCode2 size={14} className="text-primary/70 shrink-0" />
                  <span className="flex-1 text-xs truncate text-foreground/80" title={item.name}>
                    {item.name}
                  </span>
                  {pendingUrn ? (
                    viewUrn === pendingUrn ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] px-2 text-primary shrink-0"
                        onClick={() => setViewUrn(null)}
                      >
                        <X size={10} className="mr-1" /> Close
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-6 text-[10px] px-2 gradient-accent text-white shrink-0"
                        onClick={() => setViewUrn(pendingUrn)}
                      >
                        <Box size={10} className="mr-1" /> View 3D
                      </Button>
                    )
                  ) : (
                    isEditor && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2 shrink-0 opacity-0 group-hover:opacity-100 transition-smooth"
                        disabled={translate.isPending}
                        onClick={() => translate.mutate({ itemId: item.id, itemName: item.name })}
                      >
                        {translate.isPending ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          "Translate"
                        )}
                      </Button>
                    )
                  )}
                  {pendingUrn && <ApsStatusPoller urn={pendingUrn} />}
                </div>

                {viewUrn === pendingUrn && (
                  <div className="mx-3 my-2 h-[420px] rounded-lg overflow-hidden border border-border/30">
                    <BimViewer urn={pendingUrn} />
                  </div>
                )}
              </div>
            );
          })}

          {!isLoading && folders.length === 0 && items.length === 0 && (
            <p className="text-[11px] text-muted-foreground/50 px-3 py-1">
              {search ? "No .rfa files matching filter" : "No .rfa files in this folder"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Polls APS manifest status for a URN and shows a progress badge */
function ApsStatusPoller({ urn }: { urn: string }) {
  const { data } = trpc.families.getApsManifestStatus.useQuery(
    { urn },
    { refetchInterval: (d) => (d?.state?.data?.status === "success" || d?.state?.data?.status === "failed" ? false : 5000) }
  );

  if (!data || data.status === "success") return null;
  if (data.status === "failed") return (
    <span className="text-[10px] text-destructive shrink-0">Failed</span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
      <Loader2 size={10} className="animate-spin" />
      {data.progress ?? "…"}
    </span>
  );
}

interface ApsProjectBrowserProps {
  onClose: () => void;
}

export function ApsProjectBrowser({ onClose }: ApsProjectBrowserProps) {
  const [search, setSearch] = useState("");
  const { data: topFolders = [], isLoading } = trpc.families.listApsProjectFolders.useQuery();

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col bg-card border-border text-foreground overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Box size={16} className="text-primary" />
            APS Project Files
          </DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Filter .rfa files…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs bg-secondary/50 border-border/50 shrink-0"
        />

        <div className="flex-1 overflow-y-auto space-y-0.5 custom-scrollbar pr-1 min-h-0">
          {isLoading && (
            <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              Loading project folders…
            </div>
          )}

          {!isLoading && topFolders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No folders found. Check APS_PROJECT-ID in .env.
            </p>
          )}

          {topFolders.map((folder) => (
            <FolderRow key={folder.id} id={folder.id} name={folder.name} search={search} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
