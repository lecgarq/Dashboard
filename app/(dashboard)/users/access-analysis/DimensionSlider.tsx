"use client";

/**
 * DimensionSlider.tsx — single Radix slider per dimension.
 *   - 0–100 range, step 1; emphasized live value badge (updates while dragging)
 *   - thumb scales + glows on hover/active; range fill eases
 *   - double-click thumb to reset; zinc palette per feedback_dark_palette_neutral.md
 */
import { Slider } from "radix-ui";

export interface DimensionSliderProps {
  dimId: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
}

export function DimensionSlider({ dimId, label, value, onChange, onReset }: DimensionSliderProps): React.JSX.Element {
  const active = value > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span
          data-testid={`slider-value-${dimId}`}
          className={`rounded px-1.5 text-xs tabular-nums transition-colors duration-150 ${
            active ? "bg-blue-500/15 text-blue-300" : "text-muted-foreground"
          }`}
        >
          {value}
        </span>
      </div>
      <Slider.Root
        value={[value]}
        min={0}
        max={100}
        step={1}
        onValueChange={(vs) => onChange(vs[0] ?? 0)}
        className="relative flex h-5 w-full select-none items-center"
        aria-label={`${label} slider`}
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-zinc-800">
          <Slider.Range className="absolute h-full rounded-full bg-blue-500 transition-all duration-150" />
        </Slider.Track>
        <Slider.Thumb
          className="block size-4 rounded-full border-2 border-blue-500 bg-zinc-900 transition-transform duration-150 hover:scale-125 focus:outline-none focus:ring-2 focus:ring-blue-400 active:scale-125 active:shadow-[0_0_8px_2px_rgba(59,130,246,0.6)]"
          onDoubleClick={onReset}
          aria-label={`${label} thumb`}
        />
      </Slider.Root>
    </div>
  );
}
