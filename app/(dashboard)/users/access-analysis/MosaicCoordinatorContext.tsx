"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  Coordinator,
  Selection,
  type ArrowQueryRequest,
  type Connector,
  type ExecQueryRequest,
  type JSONQueryRequest,
} from "@uwdata/mosaic-core";
import type { Table } from "@uwdata/flechette";
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
      // Overloads expose precise per-request-type returns to consumers;
      // the implementation signature is widened to `Promise<unknown>` so
      // the structural assignment to `Connector` checks against the
      // overload list, not the implementation's union return.
      async function runQuery(req: ArrowQueryRequest): Promise<Table>;
      async function runQuery(req: ExecQueryRequest): Promise<void>;
      async function runQuery(req: JSONQueryRequest): Promise<Record<string, unknown>[]>;
      async function runQuery(
        req: ArrowQueryRequest | ExecQueryRequest | JSONQueryRequest,
      ): Promise<unknown> {
        if (req.type === "exec") {
          await connection.query(req.sql);
          return undefined;
        }
        const result = await connection.query(req.sql);
        if (req.type === "json") {
          return result.toArray() as Record<string, unknown>[];
        }
        return result as unknown as Table;
      }
      const connector: Connector = { query: runQuery };
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
