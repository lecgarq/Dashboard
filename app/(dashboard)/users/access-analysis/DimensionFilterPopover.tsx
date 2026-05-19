"use client";

/**
 * DimensionFilterPopover.tsx — Phase 4-02 Task 2
 *
 * Per-dimension popover containing chip toggles. Categorical dims derive
 * `availableValues` from the feature snapshot; bucketed dims (activity, signin)
 * use fixed labels in the canonical order defined here.
 */

import * as Popover from "@radix-ui/react-popover";
import type { DIMENSIONS } from "./SliderContext";

export interface DimensionFilterPopoverProps {
  dim: (typeof DIMENSIONS)[number];
  availableValues: readonly string[];
  activeValues: ReadonlySet<string>;
  onToggle: (value: string) => void;
}

export function DimensionFilterPopover({
  dim,
  availableValues,
  activeValues,
  onToggle,
}: DimensionFilterPopoverProps): React.JSX.Element {
  const count = activeValues.size;
  return (
    <Popover.Root>
      <Popover.Trigger
        className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent ${
          count > 0 ? "border-blue-500 text-foreground" : "text-muted-foreground"
        }`}
        data-testid={`dim-popover-${dim.id}`}
        aria-label={`${dim.label} filter`}
      >
        <span>{dim.label}</span>
        {count > 0 ? (
          <span className="rounded-full bg-blue-500 px-1.5 text-xs font-medium text-white">
            {count}
          </span>
        ) : null}
        <span aria-hidden className="text-xs opacity-60">▾</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-72 w-56 overflow-auto rounded-md border bg-popover p-2 shadow-md"
        >
          <ul className="flex flex-wrap gap-1.5">
            {availableValues.length === 0 ? (
              <li className="px-2 py-1 text-xs text-muted-foreground">
                No values available
              </li>
            ) : (
              availableValues.map((v) => {
                const active = activeValues.has(v);
                return (
                  <li key={v}>
                    <button
                      type="button"
                      onClick={() => onToggle(v)}
                      data-testid={`chip-${dim.id}-${v}`}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        active
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-border text-foreground hover:bg-accent"
                      }`}
                    >
                      {v}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
