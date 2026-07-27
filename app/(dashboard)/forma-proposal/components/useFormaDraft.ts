"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_FORMA_ROLES, type FormaRole } from "@/lib/forma/defaultRoles";
import {
  emptyDraft, parseDraft, serializeDraft, storageKey, type FormaDraft,
} from "@/lib/forma/draftStorage";
import {
  applyToSubtree, buildFolderIndex, type ExplicitMap, type FormaFolder,
} from "@/lib/forma/inheritance";
import { migrateTier, type FormaTier } from "@/lib/forma/tiers";

export function useFormaDraft(templateId: string, folders: FormaFolder[]) {
  const index = useMemo(() => buildFolderIndex(folders), [folders]);
  const [draft, setDraft] = useState<FormaDraft>(() =>
    emptyDraft(templateId, DEFAULT_FORMA_ROLES, "1970-01-01T00:00:00.000Z"),
  );
  const [hydrated, setHydrated] = useState(false);
  // True after a persist attempt threw (quota, private mode, storage disabled):
  // the draft lives only in memory — the UI must tell the owner to export now.
  const [saveFailed, setSaveFailed] = useState(false);

  // Load once on mount (client only), migrating any legacy tier strings.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey(templateId));
    } catch {
      // Storage unreadable (disabled/blocked) — start blank; the persist
      // effect below will fail too and raise the saveFailed banner.
      raw = null;
    }
    const saved = parseDraft(raw);
    if (saved) {
      const assignments: Record<string, Record<string, FormaTier>> = {};
      for (const [roleId, folders] of Object.entries(saved.assignments)) {
        const migrated: Record<string, FormaTier> = {};
        for (const [folderId, tier] of Object.entries(folders)) migrated[folderId] = migrateTier(tier);
        assignments[roleId] = migrated;
      }
      setDraft({ ...saved, assignments });
    } else {
      // A raw value that exists but doesn't parse (corrupt JSON or a future
      // DRAFT_VERSION) would be silently OVERWRITTEN by the first edit below.
      // Preserve it under a backup key first so no draft is ever destroyed.
      if (raw !== null) {
        try {
          localStorage.setItem(`${storageKey(templateId)}:backup-unreadable`, raw);
        } catch {
          // Best effort — if backup fails there's nothing safer we can do.
        }
      }
      setDraft(emptyDraft(templateId, DEFAULT_FORMA_ROLES, new Date().toISOString()));
    }
    setHydrated(true);
  }, [templateId]);

  // Persist on change (after hydration so we never clobber the saved draft).
  const skip = useRef(true);
  useEffect(() => {
    if (!hydrated) return;
    if (skip.current) {
      skip.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey(templateId), serializeDraft(draft));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }, [draft, hydrated, templateId]);

  const touch = (d: FormaDraft): FormaDraft => ({ ...d, updatedAt: new Date().toISOString() });

  // ---- Cross-tab safety -------------------------------------------------
  // The persist effect above writes the WHOLE draft on every change with no
  // read-back. Two tabs on this route each hold an independent draft hydrated
  // at their own mount time, so the last writer silently destroys the other's
  // work. `storage` only fires in OTHER tabs, so this never self-triggers.
  const [otherTabChanged, setOtherTabChanged] = useState(false);
  useEffect(() => {
    const key = storageKey(templateId);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setOtherTabChanged(true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [templateId]);

  /** Adopt the other tab's version, discarding this tab's in-memory draft. */
  const acceptOtherTab = useCallback(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey(templateId));
    } catch {
      raw = null;
    }
    const saved = parseDraft(raw);
    if (saved) setDraft(saved);
    setOtherTabChanged(false);
  }, [templateId]);

  /** Keep this tab's version and overwrite the other tab's write. */
  const keepThisVersion = useCallback(() => {
    setDraft((d) => touch(d)); // re-stamp so the persist effect fires
    setOtherTabChanged(false);
  }, []);

  // ---- One-deep undo for the destructive paths --------------------------
  // Reset, subtree-apply and role-delete each discard work that cannot be
  // reconstructed, and the persist effect commits to localStorage in the same
  // tick — so without this the old value is gone from memory AND disk before
  // the user's hand leaves the mouse. A confirm dialog does not help: it turns
  // an accident into a decision the user already made.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const undoRef = useRef<FormaDraft | null>(null);
  /** Label of the action `undo()` would reverse, or null when there is nothing to undo. */
  const [undoLabel, setUndoLabel] = useState<string | null>(null);

  const pushUndo = useCallback((label: string) => {
    undoRef.current = draftRef.current;
    setUndoLabel(label);
  }, []);

  /** Any non-destructive edit invalidates the offer — undo is one deep, and
   *  reverting across later edits would silently discard them too. */
  const dropUndo = useCallback(() => {
    if (undoRef.current === null) return;
    undoRef.current = null;
    setUndoLabel(null);
  }, []);

  const undo = useCallback(() => {
    const prev = undoRef.current;
    if (!prev) return;
    undoRef.current = null;
    setUndoLabel(null);
    setDraft(touch(prev));
  }, []);

  const setTier = useCallback((roleId: string, folderId: string, tier: FormaTier) => {
    dropUndo();
    setDraft((d) => {
      const role: ExplicitMap = { ...(d.assignments[roleId] ?? {}) };
      role[folderId] = tier;
      return touch({ ...d, assignments: { ...d.assignments, [roleId]: role } });
    });
  }, [dropUndo]);

  const clearTier = useCallback((roleId: string, folderId: string) => {
    dropUndo();
    setDraft((d) => {
      const role: ExplicitMap = { ...(d.assignments[roleId] ?? {}) };
      delete role[folderId];
      return touch({ ...d, assignments: { ...d.assignments, [roleId]: role } });
    });
  }, [dropUndo]);

  const applySubtree = useCallback((roleId: string, folderId: string, tier: FormaTier) => {
    pushUndo("Applied a tier to the subtree");
    setDraft((d) => {
      const role = applyToSubtree(folderId, tier, d.assignments[roleId] ?? {}, index);
      return touch({ ...d, assignments: { ...d.assignments, [roleId]: role } });
    });
  }, [index, pushUndo]);

  const addRole = useCallback((role: FormaRole) => {
    dropUndo();
    setDraft((d) => touch({ ...d, roles: [...d.roles, role] }));
  }, [dropUndo]);

  const renameRole = useCallback((roleId: string, label: string) => {
    dropUndo();
    setDraft((d) => touch({ ...d, roles: d.roles.map((r) => (r.id === roleId ? { ...r, label } : r)) }));
  }, [dropUndo]);

  const deleteRole = useCallback((roleId: string) => {
    pushUndo("Deleted a role");
    setDraft((d) => {
      const assignments = { ...d.assignments };
      delete assignments[roleId];
      return touch({ ...d, roles: d.roles.filter((r) => r.id !== roleId), assignments });
    });
  }, [pushUndo]);

  const reset = useCallback(() => {
    pushUndo("Reset every role");
    setDraft(emptyDraft(templateId, DEFAULT_FORMA_ROLES, new Date().toISOString()));
  }, [templateId, pushUndo]);

  return {
    draft, hydrated, saveFailed, index,
    setTier, clearTier, applySubtree, addRole, renameRole, deleteRole, reset,
    undo, undoLabel,
    otherTabChanged, acceptOtherTab, keepThisVersion,
  };
}
