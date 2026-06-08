"use client";

/**
 * NeighborMatchesPanel.tsx — Task 11 (embedding map click → closest matches).
 *
 * Small overlay panel shown when a node is isolated on the 2D embedding map.
 * Lists the clicked node's similarity NEIGHBORS (most-similar instances) with
 * scores, an "Open profile" affordance for the centre node, and per-row buttons
 * that re-isolate to a chosen match (jump-to-match).
 *
 * Pure presentational — owns no fetch. Parent (ShellBody) supplies matches +
 * index lookup + callbacks. Renders null when there are no matches.
 */

import type { NodeFeatureSnapshot } from "./interactionTypes";

export interface NeighborMatch { nodeId: string; score: number }

export function NeighborMatchesPanel(props: {
  centerName: string;
  matches: NeighborMatch[];
  indexByNodeId: Map<string, number>;
  features: ReadonlyArray<NodeFeatureSnapshot>;
  onOpenProfile: () => void;
  onSelectMatch: (index: number) => void;
}): React.JSX.Element | null {
  if (props.matches.length === 0) return null;
  return (
    <div data-testid="neighbor-matches" className="absolute right-3 top-16 z-10 w-64 rounded-lg border bg-card/95 p-3 text-sm shadow-md backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">{props.centerName}</span>
        <button onClick={props.onOpenProfile} className="text-xs text-blue-600 hover:underline">Open profile</button>
      </div>
      <div className="mb-1 text-xs text-muted-foreground">Closest matches</div>
      <ul className="space-y-1">
        {props.matches.map((m) => {
          const idx = props.indexByNodeId.get(m.nodeId);
          const f = idx !== undefined ? props.features[idx] : undefined;
          return (
            <li key={m.nodeId}>
              <button
                disabled={idx === undefined}
                onClick={() => idx !== undefined && props.onSelectMatch(idx)}
                className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-accent"
              >
                <span className="truncate">{f ? `${f.userName ?? f.nodeId} · ${f.project}` : m.nodeId}</span>
                <span className="text-xs text-muted-foreground">{(m.score * 100).toFixed(0)}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
