"use client";

/**
 * useActivityUniversePayload.ts — v2.7 Phase 39 (ACT-01).
 *
 * Client loader for the activity-universe binary payload: fetches `?meta=1`
 * (dicts + coverage), then the 149.7 MB binary, and decodes it zero-copy with
 * the shared columnar codec. One fetch per mount lifetime; honest error states
 * for the 404 (artifact absent), HTTP failures, and decode failures — the
 * shell must never show a blank canvas.
 */

import { useEffect, useState } from "react";
import { decodeColumnarPayload, type ColumnArray } from "@/lib/acc/columnarPayload";
import type { ActivityUniverseMeta } from "@/lib/server/activityUniversePayload";

export const ACTIVITY_UNIVERSE_PAYLOAD_URL = "/api/activity-universe/payload";

export interface ActivityUniverseData {
  meta: ActivityUniverseMeta;
  count: number;
  columns: Record<string, ColumnArray>;
}

export type ActivityUniversePayloadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ActivityUniverseData };

export function useActivityUniversePayload(): ActivityUniversePayloadState {
  const [state, setState] = useState<ActivityUniversePayloadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const metaRes = await fetch(`${ACTIVITY_UNIVERSE_PAYLOAD_URL}?meta=1`);
        if (metaRes.status === 404) {
          throw new Error(
            "Activity universe artifact is not built yet — run scripts/build-activity-universe-payload.ts after the embedding pipeline.",
          );
        }
        if (!metaRes.ok) throw new Error(`meta request failed (${metaRes.status})`);
        const meta = (await metaRes.json()) as ActivityUniverseMeta;

        const binRes = await fetch(ACTIVITY_UNIVERSE_PAYLOAD_URL);
        if (!binRes.ok) throw new Error(`payload request failed (${binRes.status})`);
        const buf = await binRes.arrayBuffer();
        const decoded = decodeColumnarPayload(buf);
        if (decoded.count !== meta.count) {
          throw new Error(
            `payload/meta count mismatch (${decoded.count} vs ${meta.count}) — artifact pair inconsistent`,
          );
        }
        if (cancelled) return;
        setState({ status: "ready", data: { meta, count: decoded.count, columns: decoded.columns } });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Unknown payload load failure",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
