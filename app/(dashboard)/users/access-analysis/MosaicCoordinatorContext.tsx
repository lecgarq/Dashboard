"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Coordinator, Selection, type Connector } from "@uwdata/mosaic-core";
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
      const { connection } = await getDuckDbClient();
      const connector: Connector = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query: async (query: any): Promise<any> => {
          if (query.type === "exec") {
            await connection.query(query.sql);
            return undefined;
          }
          const result = await connection.query(query.sql);
          if (query.type === "json") {
            return result.toArray();
          }
          // arrow (default) — DuckDB-Wasm returns an Arrow Table
          return result;
        },
      };
      c.databaseConnector(connector);
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
