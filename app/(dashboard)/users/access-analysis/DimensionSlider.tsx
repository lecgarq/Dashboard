"use client";

/**
 * DimensionSlider.tsx — Phase 4-02 Task 2
 *
 * Single Radix slider per dimension with:
 *   - 0–100 range, step 1
 *   - numeric badge (tabular-nums)
 *   - double-click thumb to reset just that dim
 *   - zinc palette per memory note `feedback_dark_palette_neutral.md`
 */

import * as Slider from "@radix-ui/react-slider";

export interface DimensionSliderProps {
  dimId: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
}

export function DimensionSlider({
  label,
  value,
  onChange,
  onReset,
}: DimensionSliderProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
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
          <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
        </Slider.Track>
        <Slider.Thumb
          className="block size-4 rounded-full border-2 border-blue-500 bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
          onDoubleClick={onReset}
          aria-label={`${label} thumb`}
        />
      </Slider.Root>
    </div>
  );
}
