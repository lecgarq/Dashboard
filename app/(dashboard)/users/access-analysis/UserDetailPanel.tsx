"use client";

/**
 * UserDetailPanel.tsx — Phase 4-02 Task 3
 *
 * Right-side overlay opened when a node is clicked (click-isolate). Shows the
 * focused node's full record AND all projects/roles for that user — regardless
 * of current filters (CONTEXT.md investigative-action rule).
 */

import { useEffect, useState } from "react";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { getDuckDbClient } from "./duckdbClient";
import { GRAPH_ANALYTICS_SOURCE_TABLES } from "./graphSql";

export interface UserDetailPanelProps {
  userIndex: number;
  features: ReadonlyArray<NodeFeatureSnapshot>;
  onClose: () => void;
}

interface UserProjectRow {
  project_id: string;
  project_name: string | null;
  role_id: string | null;
}

async function loadUserProjects(userId: string): Promise<UserProjectRow[]> {
  if (!userId) return [];
  const { connection } = await getDuckDbClient();
  const view = GRAPH_ANALYTICS_SOURCE_TABLES.userProjects;
  const escaped = userId.replaceAll("'", "''");
  const sql = `
    SELECT
      project_id,
      COALESCE(project_name, project_id) AS project_name,
      COALESCE(role_id, '(no role)') AS role_id
    FROM ${view}
    WHERE user_id = '${escaped}'
    ORDER BY project_name
  `;
  try {
    const table = await connection.query(sql);
    return table.toArray() as UserProjectRow[];
  } catch {
    return [];
  }
}

export function UserDetailPanel({
  userIndex,
  features,
  onClose,
}: UserDetailPanelProps): React.JSX.Element {
  const focused = features[userIndex];
  const userId = focused ? focused.nodeId.split("::")[0] : "";
  const [rows, setRows] = useState<UserProjectRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadUserProjects(userId)
      .then((r) => {
        if (!cancelled) {
          setRows(r);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!focused) {
    return (
      <aside className="flex w-96 shrink-0 flex-col border-l bg-card p-4">
        <p className="text-sm text-muted-foreground">No user selected</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 self-start rounded-md border px-2 py-1 text-xs hover:bg-accent"
        >
          Close
        </button>
      </aside>
    );
  }

  return (
    <aside
      data-testid="user-detail-panel"
      className="flex w-96 shrink-0 flex-col border-l bg-card"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight" title={focused.nameLower}>
            {focused.nameLower || "(unknown)"}
          </h2>
          <p className="truncate text-xs text-muted-foreground" title={focused.emailLower}>
            {focused.emailLower}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
        >
          Close
        </button>
      </header>
      <div className="flex-1 overflow-auto p-4">
        <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">External</dt>
          <dd>{focused.isExternal ? "Yes" : "No"}</dd>
          <dt className="text-muted-foreground">Last sign-in</dt>
          <dd>{focused.lastSignInRel}</dd>
          <dt className="text-muted-foreground">Activity</dt>
          <dd>
            {focused.activityCountRaw} ({focused.activityBucket})
          </dd>
          <dt className="text-muted-foreground">Sign-in bucket</dt>
          <dd>{focused.signinBucket}</dd>
        </dl>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Projects &amp; roles
        </h3>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No project assignments found.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r, i) => (
              <li
                key={`${r.project_id}-${r.role_id}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
              >
                <span className="truncate" title={r.project_name ?? r.project_id}>
                  {r.project_name ?? r.project_id}
                </span>
                <span className="shrink-0 text-muted-foreground">{r.role_id ?? "(no role)"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
