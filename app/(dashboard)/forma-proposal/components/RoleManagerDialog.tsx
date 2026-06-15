"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FORMA_GROUPS, type FormaRole } from "@/lib/forma/defaultRoles";

export type RoleDialogState =
  | { mode: "add" }
  | { mode: "edit"; role: FormaRole }
  | null;

function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function RoleManagerDialog({
  state, existingIds, onAdd, onRename, onDelete, onClose,
}: {
  state: RoleDialogState;
  existingIds: string[];
  onAdd: (role: FormaRole) => void;
  onRename: (roleId: string, label: string) => void;
  onDelete: (roleId: string) => void;
  onClose: () => void;
}) {
  const open = state !== null;
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState<string>(FORMA_GROUPS[0]);

  useEffect(() => {
    if (state?.mode === "edit") {
      setLabel(state.role.label);
      setGroup(state.role.group);
    } else {
      setLabel("");
      setGroup(FORMA_GROUPS[0]);
    }
  }, [state]);

  const isEdit = state?.mode === "edit";
  const trimmed = label.trim();
  const dupId = !isEdit && existingIds.includes(slugify(trimmed));
  const canSave = trimmed.length > 0 && !dupId;

  function save() {
    if (!canSave) return;
    if (isEdit && state) onRename(state.role.id, trimmed);
    else onAdd({ id: slugify(trimmed), label: trimmed, group });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit role" : "Add role"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="role-label">Name</Label>
            <Input id="role-label" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
            {dupId && <p className="text-xs text-destructive">A role with that name already exists.</p>}
          </div>
          {!isEdit && (
            <div className="space-y-1">
              <Label htmlFor="role-group">Group</Label>
              <select
                id="role-group"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                {FORMA_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          )}
        </div>
        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          {isEdit ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (state) onDelete(state.role.id);
                onClose();
              }}
            >
              Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={!canSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
