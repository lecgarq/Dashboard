"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  Coordinator,
  Selection,
  coordinator as setActiveCoordinator,
  wasmConnector,
} from "@uwdata/mosaic-core";
import { getDuckDbClient } from "./duckdbClient";

interface MosaicContextValue {
  coordinator: Coordinator | null;
  selection: Selection;
}

const Ctx = createContext<MosaicContextValue | null>(null);

export function MosaicCoordinatorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [coordinator, setCoordinator] = useState<Coordinator | null>(null);
  const selection = useMemo(() => Selection.crossfilter(), []);

  useEffect(() => {
    let cancelled = false;
    const c = new Coordinator();
    (async () => {
      const { db, connection } = await getDuckDbClient();
      const connector = wasmConnector({ duckdb: db, connection });
      c.databaseConnector(connector);

      // CRITICAL: install `c` as the module-level singleton. vgplot's
      // `vg.plot()` and `vg.from()` self-register their MosaicClients with
      // whatever coordinator the singleton returns at construction time.
      // Without this, histograms register against an unconfigured default
      // coordinator and queries silently never reach DuckDB.
      setActiveCoordinator(c);
      if (!cancelled) setCoordinator(c);
    })().catch((err) => {
      console.error("[Mosaic] coordinator init failed:", err);
    });
    return () => {
      cancelled = true;
      c.clear();
    };
  }, []);

  const value = useMemo<MosaicContextValue>(
    () => ({ coordinator, selection }),
    [coordinator, selection],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMosaicCoordinator(): Coordinator | null {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      "useMosaicCoordinator must be used inside MosaicCoordinatorProvider",
    );
  }
  return v.coordinator;
}

export function useMosaicSelection(): Selection {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      "useMosaicSelection must be used inside MosaicCoordinatorProvider",
    );
  }
  return v.selection;
}

/**
 * Optional variant — returns null when called outside MosaicCoordinatorProvider.
 * Use this in components (e.g. AccUsersGraph) that may be rendered both inside
 * and outside the provider tree (e.g. legacy UsersDirectoryClient path).
 */
export function useMosaicCoordinatorOptional(): Coordinator | null {
  return useContext(Ctx)?.coordinator ?? null;
}

/**
 * Optional variant — returns null when called outside MosaicCoordinatorProvider.
 */
export function useMosaicSelectionOptional(): Selection | null {
  return useContext(Ctx)?.selection ?? null;
}
