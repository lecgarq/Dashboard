"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/core/trpc";
import { useRole } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import Image from "next/image";
import { getFamilyDisplayName } from "./lodDisplay";

interface LodDetailPanelProps {
  familyId: string | null;
  onClose: () => void;
  onDeleted?: () => void;
  onSelectFamily?: (id: string) => void;
}

export function LodDetailPanel({ familyId, onClose, onDeleted, onSelectFamily }: LodDetailPanelProps) {
  const { isEditor, isAdmin } = useRole();
  const { data: family } = trpc.lod.getFamily.useQuery(
    { id: familyId! },
    { enabled: !!familyId }
  );
  const { data: similarFamilies } = trpc.lod.getSimilarFamilies.useQuery(
    { familyId: familyId!, limit: 8 },
    { enabled: !!familyId }
  );
  const displayName = family
    ? getFamilyDisplayName(family.familyName, family.nameOfFile)
    : "Loading...";
  const utils = trpc.useUtils();
  const deleteMutation = trpc.lod.deleteFamily.useMutation({
    onSuccess: () => {
      utils.lod.getStats.invalidate();
      onDeleted?.();
      onClose();
    },
  });

  return (
    <Sheet open={!!familyId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base leading-snug">
            {displayName}
          </SheetTitle>
        </SheetHeader>

        {family && (
          <div className="space-y-4 text-sm">
            {family.imagePath && (
              <div className="relative w-full h-48 rounded-md overflow-hidden bg-muted">
                <Image
                  src={`/api/lod-img/${encodeURIComponent(family.imagePath)}`}
                  alt={displayName}
                  fill
                  className="object-contain"
                />
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {family.finalCategory && (
                <Badge variant="secondary">{family.finalCategory}</Badge>
              )}
              {family.lodLabel && (
                <Badge variant="outline">{family.lodLabel}</Badge>
              )}
              {family.provider && (
                <Badge variant="outline" className="text-xs">
                  {family.provider}
                </Badge>
              )}
              {family.confidenceLevel && (
                <Badge
                  variant="outline"
                  className={
                    family.confidenceLevel === "HIGH"
                      ? "border-green-500 text-green-600"
                      : family.confidenceLevel === "LOW"
                      ? "border-red-400 text-red-500"
                      : ""
                  }
                >
                  {family.confidenceLevel}
                </Badge>
              )}
            </div>

            <Separator />

            {family.caption && (
              <p className="text-muted-foreground leading-relaxed">{family.caption}</p>
            )}

            {family.fullDescription && (
              <div>
                <p className="font-medium mb-1">Description</p>
                <p className="text-muted-foreground leading-relaxed">{family.fullDescription}</p>
              </div>
            )}

            {family.possibleCategories.length > 0 && (
              <div>
                <p className="font-medium mb-1.5">Possible Categories</p>
                <div className="flex flex-wrap gap-1">
                  {family.possibleCategories.map((c) => (
                    <Badge key={c} variant="outline" className="text-xs">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-y-1.5 text-xs text-muted-foreground">
              <span>File</span>
              <span className="truncate font-mono">{family.nameOfFile}</span>
              {family.fileSizeKb && (
                <>
                  <span>Size</span>
                  <span>{family.fileSizeKb.toFixed(0)} KB</span>
                </>
              )}
              {family.originalFile && (
                <>
                  <span>Source</span>
                  <span className="truncate">{family.originalFile}</span>
                </>
              )}
            </div>

            {similarFamilies && similarFamilies.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="font-medium mb-2 text-sm">Similar Families</p>
                  <div className="flex flex-col gap-1.5">
                    {similarFamilies.map((sim) => {
                      const simName = getFamilyDisplayName(sim.familyName, sim.nameOfFile);
                      return (
                        <button
                          key={sim.id}
                          onClick={() => onSelectFamily?.(sim.id)}
                          className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-primary/30 transition-colors px-2.5 py-2 text-left w-full group"
                        >
                          <div className="w-9 h-9 shrink-0 rounded-md overflow-hidden bg-muted border border-border/40 relative">
                            {sim.imagePath ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/lod-img/${encodeURIComponent(sim.imagePath)}`}
                                alt={simName}
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                              />
                            ) : null}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">{simName}</p>
                            {sim.finalCategory && (
                              <p className="text-[10px] text-muted-foreground truncate">{sim.finalCategory}</p>
                            )}
                          </div>
                          {sim.lodLabel && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{sim.lodLabel}</Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {(isEditor || isAdmin) && (
              <>
                <Separator />
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => deleteMutation.mutate({ id: family.id })}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete Family
                </Button>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
