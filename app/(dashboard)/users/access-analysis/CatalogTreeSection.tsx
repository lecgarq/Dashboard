"use client";

import { useState } from "react";
import { CatalogCollapse } from "./CatalogCollapse";
import type { CatalogActivityModule } from "./dimensionCatalog";
import type { CatalogDimension } from "./dimensionCatalog.types";

interface Props {
  modules: CatalogActivityModule[];
  /** When searching, force all matching branches open without animation. */
  forceOpen: boolean;
}

function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <span aria-hidden className={`inline-block text-[10px] transition-transform duration-150 ${open ? "rotate-90" : ""}`}>
      ▸
    </span>
  );
}

export function DisabledRow({ label, reason }: { label: string; reason?: string }): React.JSX.Element {
  return (
    <div
      data-testid="disabled-dim-row"
      title={reason}
      className="rounded-md border border-dashed bg-muted/30 px-2.5 py-2 text-muted-foreground opacity-70"
    >
      <span className="block text-sm font-medium">{label}</span>
      <span className="mt-0.5 block text-[11px] leading-snug">
        {reason ?? "Unavailable in the loaded graph."}
      </span>
    </div>
  );
}

export function CatalogPreviewRow({ dim }: { dim: CatalogDimension }): React.JSX.Element {
  if (!dim.available) {
    return <DisabledRow label={dim.label} reason={dim.note ?? dim.source} />;
  }
  return (
    <div data-testid="catalog-preview-row" className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm font-medium text-foreground">{dim.label}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">Activates in Phase 27</span>
    </div>
  );
}

function Branch({ open, forceOpen, children }: { open: boolean; forceOpen: boolean; children: React.ReactNode }): React.JSX.Element {
  if (forceOpen) return <>{open ? children : null}</>;
  return <CatalogCollapse open={open}>{children}</CatalogCollapse>;
}

function GroupNode({
  group: group,
  forceOpen,
}: {
  group: CatalogActivityModule["groups"][number];
  forceOpen: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  return (
    <section data-testid={`catalog-group-${group.groupId}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        <Chevron open={isOpen} />
        <span>{group.groupLabel}</span>
      </button>
      <Branch open={isOpen} forceOpen={forceOpen}>
        <div className="ml-1 mt-2 flex flex-col gap-2 border-l border-border pl-3">
          {group.actions.map((action) => <CatalogPreviewRow key={action.id} dim={action} />)}
        </div>
      </Branch>
    </section>
  );
}

function ModuleNode({ module, forceOpen }: { module: CatalogActivityModule; forceOpen: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  return (
    <section data-testid={`catalog-module-${module.moduleId}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground hover:text-primary"
      >
        <Chevron open={isOpen} />
        <span>{module.moduleLabel}</span>
      </button>
      <Branch open={isOpen} forceOpen={forceOpen}>
        <div className="ml-1 mt-2 flex flex-col gap-3 border-l border-border pl-3">
          {module.groups.map((group) => (
            <GroupNode key={group.groupId} group={group} forceOpen={forceOpen} />
          ))}
        </div>
      </Branch>
    </section>
  );
}

export function CatalogTreeSection({ modules, forceOpen }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {modules.map((module) => <ModuleNode key={module.moduleId} module={module} forceOpen={forceOpen} />)}
    </div>
  );
}
