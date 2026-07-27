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
import {
  buildActivityTaxonomy,
  objectTypeLabel,
  remapModuleIds,
} from "./activityTaxonomyLabels";

const ACTIVITY_UNIVERSE_PAYLOAD_URL = "/api/activity-universe/payload";

export interface ActivityUniverseData {
  meta: ActivityUniverseMeta;
  count: number;
  columns: Record<string, ColumnArray>;
}

export type ActivityUniversePayloadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ActivityUniverseData };

const asDict = (raw: unknown): string[] => (Array.isArray(raw) ? raw.map(String) : []);

/**
 * Single seam where the raw pipeline vocabulary becomes the /access-analysis
 * taxonomy: verb ids → catalog labels, and the coarse serviceGroup column →
 * real ACC module slots (see activityTaxonomyLabels.ts for why this is a column
 * remap and not a label rename). Everything downstream — legend, color-by,
 * group-by, filters, hover, selection breakdown — reads the dicts and the
 * moduleId column, so rewriting both here is all it takes.
 *
 * The served artifact is untouched: this is a ~4.9M-row table lookup on load,
 * not a payload rebuild, so the pipeline and the API route stay as they are.
 * A payload missing either dict passes through unchanged rather than losing its
 * module column to an empty lookup table.
 */
function applyTaxonomy(
  meta: ActivityUniverseMeta,
  count: number,
  columns: Record<string, ColumnArray>,
): ActivityUniverseData {
  // Object type is a pure per-category relabel (the column already means the
  // right thing), so it applies on its own — independent of the module remap.
  const objectTypeDict = asDict(meta.dicts.objectType);
  const dicts: Record<string, unknown> = objectTypeDict.length
    ? { ...meta.dicts, objectType: objectTypeDict.map(objectTypeLabel) }
    : meta.dicts;

  const verbDict = asDict(meta.dicts.verb);
  const moduleDict = asDict(meta.dicts.module);
  const verbIds = columns.verbId;
  const moduleIds = columns.moduleId;
  if (verbDict.length === 0 || moduleDict.length === 0 || !verbIds || !moduleIds) {
    return { meta: { ...meta, dicts }, count, columns };
  }

  const taxonomy = buildActivityTaxonomy(verbDict, moduleDict);
  return {
    meta: {
      ...meta,
      dicts: { ...dicts, verb: taxonomy.verbLabels, module: taxonomy.moduleLabels },
    },
    count,
    columns: { ...columns, moduleId: remapModuleIds(verbIds, moduleIds, taxonomy) },
  };
}

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
        setState({ status: "ready", data: applyTaxonomy(meta, decoded.count, decoded.columns) });
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
