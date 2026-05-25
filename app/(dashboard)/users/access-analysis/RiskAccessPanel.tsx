"use client";

/**
 * RiskAccessPanel.tsx — P7 compact badge/filter surface (MASK bus only).
 *
 * Surfaces the P5/P6 enriched fields (riskFlags, permissionTypeSummary, modules) as
 * toggle chips with live count badges. Writes ONLY to FilterContext facet keys; the
 * predicate engine turns those into a single physics.setMask. No sliders, no physics,
 * no color. Distinct from the charts-side PermissionRiskPanel.tsx.
 */
import { useMemo } from "react";
import { useFilters } from "./FilterContext";
import {
  RISK_FLAG_IDS,
  PERM_PROFILE_IDS,
  FACET_KEY_RISK,
  FACET_KEY_PERM,
  FACET_KEY_MODULE,
  summarizeFacets,
  type RiskFlagId,
  type PermProfileId,
} from "./accessFacets";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const RISK_LABELS: Record<RiskFlagId, string> = {
  externalHighPerm: "External · high permission",
  staleButActive: "Stale but active",
  externalProjectAdmin: "External project admin",
  broadFolderAccess: "Broad folder access",
  highActivityHighPerm: "High activity · high permission",
};

const PERM_LABELS: Record<PermProfileId, string> = {
  fullController: "Full controller",
  mixedProfile: "Mixed profile",
  broadFolders: "Broad folder breadth",
  coverageKnown: "Coverage: known",
  coveragePartial: "Coverage: partial",
  coverageUnknown: "Coverage: unknown",
};

function FacetRow(props: {
  testid: string;
  countTestid?: string;
  label: string;
  count: number;
  active: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      data-testid={props.testid}
      aria-pressed={props.active}
      onClick={props.onToggle}
      className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm ${
        props.active ? "border-blue-500 bg-blue-500/10 text-foreground" : "hover:bg-accent"
      }`}
    >
      <span className="truncate">{props.label}</span>
      <span
        data-testid={props.countTestid}
        className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
      >
        {props.count}
      </span>
    </button>
  );
}

export interface RiskAccessPanelProps {
  features: ReadonlyArray<NodeFeatureSnapshot>;
}

export function RiskAccessPanel({ features }: RiskAccessPanelProps): React.JSX.Element {
  const { activeFilters, toggleChip } = useFilters();
  const summary = useMemo(() => summarizeFacets(features), [features]);

  const riskSet = activeFilters[FACET_KEY_RISK] ?? new Set<string>();
  const permSet = activeFilters[FACET_KEY_PERM] ?? new Set<string>();
  const moduleSet = activeFilters[FACET_KEY_MODULE] ?? new Set<string>();

  return (
    <div data-testid="risk-access-panel" className="w-72 space-y-4 p-3 text-sm">
      <p className="text-[11px] text-muted-foreground">
        Masks the graph by risk, permission profile, and module. Color mode is independent —
        surviving nodes keep their color.
      </p>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Risk</h3>
        {RISK_FLAG_IDS.map((id) => (
          <FacetRow
            key={id}
            testid={`risk-facet-${id}`}
            countTestid={`risk-count-${id}`}
            label={RISK_LABELS[id]}
            count={summary.risk[id]}
            active={riskSet.has(id)}
            onToggle={() => toggleChip(FACET_KEY_RISK, id)}
          />
        ))}
      </section>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Permission profile</h3>
        {PERM_PROFILE_IDS.map((id) => (
          <FacetRow
            key={id}
            testid={`perm-facet-${id}`}
            countTestid={`perm-count-${id}`}
            label={PERM_LABELS[id]}
            count={summary.perm[id]}
            active={permSet.has(id)}
            onToggle={() => toggleChip(FACET_KEY_PERM, id)}
          />
        ))}
      </section>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Module focus</h3>
        {summary.modules.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No module data.</p>
        ) : (
          summary.modules.map(({ key, count }) => (
            <FacetRow
              key={key}
              testid={`module-facet-${key}`}
              countTestid={`module-count-${key}`}
              label={key}
              count={count}
              active={moduleSet.has(key)}
              onToggle={() => toggleChip(FACET_KEY_MODULE, key)}
            />
          ))
        )}
      </section>
    </div>
  );
}
