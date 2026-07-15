"use client";

/**
 * DimensionFilterPopover.tsx — Phase 4-02 Task 2, reworked in Phase 25 (DIM-04).
 *
 * One popover per ADDED aperture dimension chip: multi-select which banded
 * values to KEEP. The value list is supplied by the Toolbar as the distinct
 * valueKeyLabel labels across the loaded snapshot — the same tiers Group-by
 * clusters into and Color-by swatches, so a filter tier matches its blob.
 */

import { Popover } from "radix-ui";

export interface DimensionFilterPopoverProps {
  /** Aperture catalog dimension identity (id + display label). */
  dim: { id: string; label: string };
  availableValues: readonly string[];
  activeValues: ReadonlySet<string>;
  onToggle: (value: string) => void;
  /** Removes this dimension chip entirely (clearing its filter). */
  onRemove?: () => void;
}

export function DimensionFilterPopover({
  dim,
  availableValues,
  activeValues,
  onToggle,
  onRemove,
}: DimensionFilterPopoverProps): React.JSX.Element {
  const count = activeValues.size;
  return (
    <Popover.Root>
      <span
        className={`inline-flex items-center rounded-md border text-sm ${
          count > 0 ? "border-blue-500 text-foreground" : "text-muted-foreground"
        }`}
      >
        <Popover.Trigger
          className="inline-flex items-center gap-1 px-3 py-1.5 hover:bg-accent"
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
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            data-testid={`dim-popover-remove-${dim.id}`}
            aria-label={`Remove ${dim.label} filter`}
            className="px-1.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            ×
          </button>
        ) : null}
      </span>
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
