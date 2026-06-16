"use client";
import { useState } from "react";
import type { DormantSummary } from "../dormantCompanies";

type Tab = "no-activity" | "no-users";

/**
 * Account-wide "dormant companies" card: companies that never surface in the
 * donuts because they have no users, or have users but no recorded activity.
 * Independent of the project picker (it reflects the full roster). Two tabs;
 * defaults to whichever has content (No activity first when both do).
 */
export function DormantCompaniesPanel({ summary }: { summary: DormantSummary }) {
  const { noUsers, noActivity } = summary;
  const [tab, setTab] = useState<Tab>(noActivity.length > 0 ? "no-activity" : "no-users");

  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "bg-primary/15 text-primary"
        : "text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  return (
    <div data-testid="dormant-panel" className="panel-elevated p-5">
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          data-testid="dormant-tab-no-activity"
          onClick={() => setTab("no-activity")}
          aria-pressed={tab === "no-activity"}
          className={tabClass(tab === "no-activity")}
        >
          No activity ({noActivity.length})
        </button>
        <button
          type="button"
          data-testid="dormant-tab-no-users"
          onClick={() => setTab("no-users")}
          aria-pressed={tab === "no-users"}
          className={tabClass(tab === "no-users")}
        >
          No users ({noUsers.length})
        </button>
      </div>

      {tab === "no-activity" ? (
        noActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every company with users is active.</p>
        ) : (
          <ul className="list-none space-y-1" style={{ columnWidth: "240px", columnGap: "1.5rem" }}>
            {noActivity.map((d) => (
              <li
                key={d.company}
                className="flex items-center justify-between gap-3 break-inside-avoid rounded-md bg-muted/40 px-2.5 py-1.5 text-sm"
              >
                <span className="truncate text-foreground/90" title={d.company}>{d.company}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {d.userCount} {d.userCount === 1 ? "user" : "users"}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : noUsers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Every company has users.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {noUsers.map((name) => (
            <span
              key={name}
              className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
              title={name}
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
