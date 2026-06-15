"use client";
import { FORMA_TIERS, TIER_COLOR, TIER_SHORT, type FormaTier } from "@/lib/forma/tiers";

export function TierPicker({
  value, inherited, onChange,
}: {
  value: FormaTier;
  inherited: boolean;
  onChange: (tier: FormaTier) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-sm"
        style={{ backgroundColor: TIER_COLOR[value] }}
      />
      <select
        aria-label="permission tier"
        value={value}
        onChange={(e) => onChange(e.target.value as FormaTier)}
        className={`rounded-md border border-border bg-background px-1.5 py-0.5 text-xs ${
          inherited ? "italic text-muted-foreground" : "text-foreground"
        }`}
      >
        {FORMA_TIERS.map((t) => (
          <option key={t} value={t}>
            {TIER_SHORT[t]}
          </option>
        ))}
      </select>
    </span>
  );
}
