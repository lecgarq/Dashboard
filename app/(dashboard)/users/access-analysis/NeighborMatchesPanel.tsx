"use client";

/**
 * NeighborMatchesPanel.tsx — embedding map click → closest matches (Phase 30).
 *
 * Lists the clicked node's k DISTINCT similarity matches, each with up to
 * three "why similar" chips (python-ranked dimension keys resolved to live
 * labels client-side via whySimilar.ts), plus an honest twin affordance:
 * "N identical twins" expands to the capped member list with a "+N more"
 * overflow line. Twin rows and match rows both re-isolate on click.
 *
 * Pure presentational — owns no fetch. Parent (ShellBody) supplies the
 * normalized payload, snapshot lookups, prebuilt coverage texts, and
 * callbacks. Chrome stays modest on purpose: Phase 31 owns the choreography.
 */

import { useState } from "react";
import type { NeighborMatch, NeighborTwins } from "@/lib/acc/embedding/neighborPayload";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { resolveWhyKey } from "./whySimilar";

export type { NeighborMatch };

export function NeighborMatchesPanel(props: {
  centerName: string;
  center: NodeFeatureSnapshot | undefined;
  matches: NeighborMatch[];
  twins: NeighborTwins;
  indexByNodeId: Map<string, number>;
  features: ReadonlyArray<NodeFeatureSnapshot>;
  /** dimId → coverageText ("14,201/22,279"), prebuilt by the shell. */
  coverageByDim: ReadonlyMap<string, string>;
  onOpenProfile: () => void;
  onSelectMatch: (index: number) => void;
}): React.JSX.Element | null {
  const [twinsOpen, setTwinsOpen] = useState(false);
  if (props.matches.length === 0 && props.twins.count === 0) return null;

  const nodeRow = (nodeId: string): { idx: number | undefined; f: NodeFeatureSnapshot | undefined } => {
    const idx = props.indexByNodeId.get(nodeId);
    return { idx, f: idx !== undefined ? props.features[idx] : undefined };
  };

  const twinOverflow = props.twins.count - props.twins.ids.length;

  return (
    <div
      data-testid="neighbor-matches"
      className="absolute right-3 top-16 z-10 max-h-[70vh] w-72 overflow-y-auto rounded-lg border bg-card/95 p-3 text-sm shadow-md backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="truncate font-medium">{props.centerName}</span>
        <button onClick={props.onOpenProfile} className="shrink-0 text-xs text-blue-600 hover:underline">
          Open profile
        </button>
      </div>

      {props.twins.count > 0 && (
        <div className="mb-2">
          <button
            data-testid="twin-chip"
            onClick={() => setTwinsOpen((v) => !v)}
            aria-expanded={twinsOpen}
            className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            {props.twins.count.toLocaleString("en-US")} identical twin
            {props.twins.count === 1 ? "" : "s"} {twinsOpen ? "▾" : "▸"}
          </button>
          {twinsOpen && (
            <ul data-testid="twin-list" className="mt-1 space-y-0.5">
              {props.twins.ids.map((id) => {
                const { idx, f } = nodeRow(id);
                return (
                  <li key={id}>
                    <button
                      disabled={idx === undefined}
                      onClick={() => idx !== undefined && props.onSelectMatch(idx)}
                      className="w-full truncate rounded px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-accent"
                    >
                      {f ? `${f.userName ?? f.nodeId} · ${f.project}` : id}
                    </button>
                  </li>
                );
              })}
              {twinOverflow > 0 && (
                <li className="px-1 text-xs text-muted-foreground">
                  +{twinOverflow.toLocaleString("en-US")} more
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {props.matches.length > 0 && (
        <>
          <div className="mb-1 text-xs text-muted-foreground">Closest matches</div>
          <ul className="space-y-1.5">
            {props.matches.map((m) => {
              const { idx, f } = nodeRow(m.nodeId);
              // No center snapshot -> no chips: numeric keys would render
              // made-up center values otherwise (center is always set in practice).
              const chips = props.center
                ? m.why
                    .map((key) => resolveWhyKey(key, props.center!, f))
                    .filter((c): c is NonNullable<typeof c> => c !== null)
                : [];
              return (
                <li key={m.nodeId}>
                  <button
                    disabled={idx === undefined}
                    onClick={() => idx !== undefined && props.onSelectMatch(idx)}
                    className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-accent"
                  >
                    <span className="truncate">{f ? `${f.userName ?? f.nodeId} · ${f.project}` : m.nodeId}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {(m.score * 100).toFixed(0)}%
                    </span>
                  </button>
                  {chips.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1 px-1">
                      {chips.map((c) => (
                        <span
                          key={c.label}
                          className="rounded bg-muted px-1 py-px text-[10px] leading-4 text-muted-foreground"
                        >
                          {c.label}
                          {c.coverageDimId && props.coverageByDim.has(c.coverageDimId) && (
                            <span className="opacity-70"> · {props.coverageByDim.get(c.coverageDimId)}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
