"use client";

/**
 * SelectionContext.tsx — Phase 4-02 Task 1
 *
 * Session-only selection state shared between GraphInteractions and the
 * right-panel stack:
 *   - lassoSelection:    Set<number> | null   (cosmos node indices)
 *   - isolatedNodeIndex: number       | null  (single-node isolate from click)
 *
 * No persistence — selections never survive page reload.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SelectionContextValue {
  lassoSelection: ReadonlySet<number> | null;
  isolatedNodeIndex: number | null;
  setLasso: (indices: number[] | null) => void;
  setIsolated: (i: number | null) => void;
  clearAll: () => void;
}

const SelectionCtx = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [lassoSelection, setLassoState] = useState<ReadonlySet<number> | null>(null);
  const [isolatedNodeIndex, setIsolatedState] = useState<number | null>(null);

  const setLasso = useCallback((indices: number[] | null): void => {
    setLassoState(indices === null ? null : new Set(indices));
  }, []);

  const setIsolated = useCallback((i: number | null): void => {
    setIsolatedState(i);
  }, []);

  const clearAll = useCallback((): void => {
    setLassoState(null);
    setIsolatedState(null);
  }, []);

  const ctx = useMemo<SelectionContextValue>(
    () => ({ lassoSelection, isolatedNodeIndex, setLasso, setIsolated, clearAll }),
    [lassoSelection, isolatedNodeIndex, setLasso, setIsolated, clearAll],
  );

  return <SelectionCtx.Provider value={ctx}>{children}</SelectionCtx.Provider>;
}

export function useSelection(): SelectionContextValue {
  const v = useContext(SelectionCtx);
  if (!v) throw new Error("useSelection must be used inside <SelectionProvider>");
  return v;
}
