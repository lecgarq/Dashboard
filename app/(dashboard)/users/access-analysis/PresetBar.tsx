"use client";

import { SLIDER_PRESETS } from "./sliderPresets";

export interface PresetBarProps {
  activePreset: string | null;
  onApply: (presetId: string) => void;
}

export function PresetBar({ activePreset, onApply }: PresetBarProps): React.JSX.Element {
  return (
    <div data-testid="preset-bar" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Presets</span>
        {activePreset === null ? (
          <span className="text-xs text-amber-400">Custom</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SLIDER_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onApply(p.id)}
            aria-pressed={activePreset === p.id}
            className={`rounded-md border px-2 py-1 text-xs ${
              activePreset === p.id
                ? "border-blue-500 bg-blue-500 text-white"
                : "hover:bg-accent"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
