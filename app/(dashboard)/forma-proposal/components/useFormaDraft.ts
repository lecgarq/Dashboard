"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_FORMA_ROLES, type FormaRole } from "@/lib/forma/defaultRoles";
import {
  emptyDraft, parseDraft, serializeDraft, storageKey, type FormaDraft,
} from "@/lib/forma/draftStorage";
import {
  applyToSubtree, buildFolderIndex, type ExplicitMap, type FormaFolder,
} from "@/lib/forma/inheritance";
import { reparent, type HierarchyMap } from "@/lib/forma/hierarchy";
import type { FormaTier } from "@/lib/forma/tiers";

export function useFormaDraft(templateId: string, folders: FormaFolder[]) {
  const index = useMemo(() => buildFolderIndex(folders), [folders]);
  const [draft, setDraft] = useState<FormaDraft>(() =>
    emptyDraft(templateId, DEFAULT_FORMA_ROLES, "1970-01-01T00:00:00.000Z"),
  );
  const [hydrated, setHydrated] = useState(false);

  // Load once on mount (client only).
  useEffect(() => {
    const saved = parseDraft(localStorage.getItem(storageKey(templateId)));
    setDraft(saved ?? emptyDraft(templateId, DEFAULT_FORMA_ROLES, new Date().toISOString()));
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
    localStorage.setItem(storageKey(templateId), serializeDraft(draft));
  }, [draft, hydrated, templateId]);

  const touch = (d: FormaDraft): FormaDraft => ({ ...d, updatedAt: new Date().toISOString() });

  const setTier = useCallback((roleId: string, folderId: string, tier: FormaTier) => {
    setDraft((d) => {
      const role: ExplicitMap = { ...(d.assignments[roleId] ?? {}) };
      role[folderId] = tier;
      return touch({ ...d, assignments: { ...d.assignments, [roleId]: role } });
    });
  }, []);

  const clearTier = useCallback((roleId: string, folderId: string) => {
    setDraft((d) => {
      const role: ExplicitMap = { ...(d.assignments[roleId] ?? {}) };
      delete role[folderId];
      return touch({ ...d, assignments: { ...d.assignments, [roleId]: role } });
    });
  }, []);

  const applySubtree = useCallback((roleId: string, folderId: string, tier: FormaTier) => {
    setDraft((d) => {
      const role = applyToSubtree(folderId, tier, d.assignments[roleId] ?? {}, index);
      return touch({ ...d, assignments: { ...d.assignments, [roleId]: role } });
    });
  }, [index]);

  const addRole = useCallback((role: FormaRole) => {
    setDraft((d) => touch({
      ...d,
      roles: [...d.roles, role],
      hierarchy: { ...(d.hierarchy ?? {}), [role.id]: null }, // new role starts top-level
    }));
  }, []);

  // Re-parent a role in the org chart (cycle-checked); no-op on an invalid move.
  const setParent = useCallback((roleId: string, parentId: string | null) => {
    setDraft((d) => {
      const cur: HierarchyMap = d.hierarchy ?? {};
      const next = reparent(cur, roleId, parentId);
      if (next === cur) return d;
      return touch({ ...d, hierarchy: next });
    });
  }, []);

  const renameRole = useCallback((roleId: string, label: string) => {
    setDraft((d) => touch({ ...d, roles: d.roles.map((r) => (r.id === roleId ? { ...r, label } : r)) }));
  }, []);

  const deleteRole = useCallback((roleId: string) => {
    setDraft((d) => {
      const assignments = { ...d.assignments };
      delete assignments[roleId];
      // Drop the role from the org chart and lift its direct reports to top-level.
      const hierarchy: HierarchyMap = {};
      for (const [id, parent] of Object.entries(d.hierarchy ?? {})) {
        if (id === roleId) continue;
        hierarchy[id] = parent === roleId ? null : parent;
      }
      return touch({
        ...d,
        roles: d.roles.filter((r) => r.id !== roleId),
        assignments,
        hierarchy,
      });
    });
  }, []);

  const reset = useCallback(() => {
    setDraft(emptyDraft(templateId, DEFAULT_FORMA_ROLES, new Date().toISOString()));
  }, [templateId]);

  return {
    draft, hydrated, index,
    setTier, clearTier, applySubtree, addRole, renameRole, deleteRole, setParent, reset,
  };
}
