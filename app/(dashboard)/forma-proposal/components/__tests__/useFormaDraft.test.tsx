// @vitest-environment jsdom
/**
 * Editor-safety guards for the Forma draft hook.
 *
 * Two regressions this file exists to prevent:
 *
 *  1. NO UNDO. Reset, subtree-apply and role-delete each discarded work that
 *     cannot be reconstructed, and the persist effect committed to localStorage
 *     in the same tick — so the old value was gone from memory AND disk before
 *     the user's hand left the mouse. A confirm dialog does not fix this; it
 *     turns an accident into a decision the user already made.
 *
 *  2. CROSS-TAB CLOBBER. Persist writes the whole draft with no read-back and
 *     there was no `storage` listener, so two tabs on this route silently
 *     destroyed each other's work with neither ever being told.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useFormaDraft } from "../useFormaDraft";
import { emptyDraft, parseDraft, serializeDraft, storageKey } from "@/lib/forma/draftStorage";
import { DEFAULT_FORMA_ROLES } from "@/lib/forma/defaultRoles";
import type { FormaFolder } from "@/lib/forma/inheritance";
import type { FormaTier } from "@/lib/forma/tiers";

const TEMPLATE = "tpl-test";

// Real ACC picker levels — the tier union is the literal ACC label, not a short name.
const VIEW_ONLY: FormaTier = "View Only";
const VIEW_EDIT: FormaTier = "View+Download+Publish markups+Upload+Edit";
const FULL: FormaTier = "Full administrative controls";

/** Minimal three-node tree: root → child → grandchild. */
const FOLDERS: FormaFolder[] = [
  { id: "root", name: "Project Files", parentId: null, fullPath: "Project Files" },
  { id: "child", name: "01 Models", parentId: "root", fullPath: "Project Files/01 Models" },
  { id: "grandchild", name: "01.1 Arch", parentId: "child", fullPath: "Project Files/01 Models/01.1 Arch" },
];

const ROLE = DEFAULT_FORMA_ROLES[0].id;

function readStored() {
  return parseDraft(localStorage.getItem(storageKey(TEMPLATE)));
}

describe("useFormaDraft", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("undoes a role delete and restores its assignments", async () => {
    const { result } = renderHook(() => useFormaDraft(TEMPLATE, FOLDERS));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setTier(ROLE, "child", VIEW_EDIT));
    await waitFor(() => expect(result.current.draft.assignments[ROLE]?.child).toBe(VIEW_EDIT));

    act(() => result.current.deleteRole(ROLE));
    expect(result.current.draft.roles.some((r) => r.id === ROLE)).toBe(false);
    expect(result.current.draft.assignments[ROLE]).toBeUndefined();
    // The offer must be visible, and must name what it reverses.
    expect(result.current.undoLabel).toBe("Deleted a role");

    act(() => result.current.undo());
    expect(result.current.draft.roles.some((r) => r.id === ROLE)).toBe(true);
    expect(result.current.draft.assignments[ROLE]?.child).toBe(VIEW_EDIT);
    expect(result.current.undoLabel).toBeNull();

    // The restored draft must reach disk, not just memory.
    await waitFor(() => expect(readStored()?.assignments[ROLE]?.child).toBe(VIEW_EDIT));
  });

  it("undoes a reset back to the full pre-reset draft", async () => {
    const { result } = renderHook(() => useFormaDraft(TEMPLATE, FOLDERS));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setTier(ROLE, "root", VIEW_ONLY));
    await waitFor(() => expect(result.current.draft.assignments[ROLE]?.root).toBe(VIEW_ONLY));

    act(() => result.current.reset());
    expect(result.current.draft.assignments[ROLE]?.root).toBeUndefined();

    act(() => result.current.undo());
    expect(result.current.draft.assignments[ROLE]?.root).toBe(VIEW_ONLY);
  });

  it("undoes a subtree apply, including the descendants it overwrote", async () => {
    const { result } = renderHook(() => useFormaDraft(TEMPLATE, FOLDERS));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setTier(ROLE, "grandchild", VIEW_ONLY));
    await waitFor(() => expect(result.current.draft.assignments[ROLE]?.grandchild).toBe(VIEW_ONLY));

    act(() => result.current.applySubtree(ROLE, "root", FULL));
    expect(result.current.draft.assignments[ROLE]?.grandchild).toBe(FULL);

    act(() => result.current.undo());
    expect(result.current.draft.assignments[ROLE]?.grandchild).toBe(VIEW_ONLY);
  });

  it("drops the undo offer on the next ordinary edit, so undo never reaches across it", async () => {
    const { result } = renderHook(() => useFormaDraft(TEMPLATE, FOLDERS));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.deleteRole(ROLE));
    expect(result.current.undoLabel).toBe("Deleted a role");

    act(() => result.current.setTier(DEFAULT_FORMA_ROLES[1].id, "child", VIEW_ONLY));
    expect(result.current.undoLabel).toBeNull();

    // undo() after the offer lapsed must be inert, not a silent revert of the edit.
    act(() => result.current.undo());
    expect(result.current.draft.assignments[DEFAULT_FORMA_ROLES[1].id]?.child).toBe(VIEW_ONLY);
  });

  it("flags a write from another tab instead of silently clobbering it", async () => {
    const { result } = renderHook(() => useFormaDraft(TEMPLATE, FOLDERS));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.otherTabChanged).toBe(false);

    // Simulate the other tab's write: storage events only fire cross-tab.
    const theirs = emptyDraft(TEMPLATE, DEFAULT_FORMA_ROLES, new Date().toISOString());
    theirs.assignments[ROLE] = { root: FULL };
    localStorage.setItem(storageKey(TEMPLATE), serializeDraft(theirs));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: storageKey(TEMPLATE) }));
    });

    expect(result.current.otherTabChanged).toBe(true);

    act(() => result.current.acceptOtherTab());
    expect(result.current.draft.assignments[ROLE]?.root).toBe(FULL);
    expect(result.current.otherTabChanged).toBe(false);
  });

  it("ignores storage events for a different key", async () => {
    const { result } = renderHook(() => useFormaDraft(TEMPLATE, FOLDERS));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "some-other-app-key" }));
    });

    expect(result.current.otherTabChanged).toBe(false);
  });
});
