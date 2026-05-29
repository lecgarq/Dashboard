"use client";
import { useState } from "react";
import { DimensionSlider } from "./DimensionSlider";
import type { CatalogActivityModule } from "./dimensionCatalog";

interface Props {
  modules: CatalogActivityModule[];
  values: Record<string, number>;
  onChange: (id: string, v: number) => void;
  onReset: (id: string) => void;
  /** when searching, force all branches open */
  forceOpen: boolean;
}

function activeCount(ids: string[], values: Record<string, number>): number {
  return ids.filter((id) => (values[id] ?? 0) > 0).length;
}

export function DisabledRow({ label }: { label: string }): React.JSX.Element {
  return (
    <div data-testid="disabled-dim-row" className="flex items-center justify-between opacity-50">
      <span className="text-sm">{label}</span>
      <span className="rounded bg-zinc-800 px-1.5 text-[10px] uppercase tracking-wide text-zinc-400">no data</span>
    </div>
  );
}

function GroupNode({
  group: g, values, onChange, onReset, forceOpen,
}: { group: CatalogActivityModule["groups"][number] } & Omit<Props, "modules">): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  const badge = activeCount(g.actions.map((a) => a.id), values);
  return (
    <section data-testid={`catalog-group-${g.groupId}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={isOpen}
        className="flex w-full items-center justify-between text-[11px] font-medium text-muted-foreground hover:text-foreground">
        <span>{g.groupLabel}{badge > 0 ? <span className="ml-2 rounded-full bg-blue-500/15 px-1.5 text-[10px] text-blue-400">{badge}</span> : null}</span>
        <span aria-hidden>{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen ? (
        <div className="mt-2 flex flex-col gap-4 pl-2">
          {g.actions.map((a) =>
            a.available ? (
              <DimensionSlider key={a.id} dimId={a.id} label={a.label} value={values[a.id] ?? 0}
                onChange={(v) => onChange(a.id, v)} onReset={() => onReset(a.id)} />
            ) : (
              <DisabledRow key={a.id} label={a.label} />
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}

function ModuleNode({
  module: m, values, onChange, onReset, forceOpen,
}: { module: CatalogActivityModule } & Omit<Props, "modules">): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  const allIds = m.groups.flatMap((g) => g.actions.map((a) => a.id));
  const badge = activeCount(allIds, values);
  return (
    <section data-testid={`catalog-module-${m.moduleId}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={isOpen}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        <span>{m.moduleLabel}{badge > 0 ? <span className="ml-2 rounded-full bg-blue-500/15 px-1.5 text-[10px] text-blue-400">{badge} active</span> : null}</span>
        <span aria-hidden>{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen ? (
        <div className="mt-2 flex flex-col gap-3 pl-2">
          {m.groups.map((g) => (
            <GroupNode key={g.groupId} group={g} values={values} onChange={onChange} onReset={onReset} forceOpen={forceOpen} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function CatalogTreeSection({ modules, values, onChange, onReset, forceOpen }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {modules.map((m) => (
        <ModuleNode key={m.moduleId} module={m} values={values} onChange={onChange} onReset={onReset} forceOpen={forceOpen} />
      ))}
    </div>
  );
}
