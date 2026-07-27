"use client";
import { Fragment } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/core/utils";
import {
  FORMA_TIERS, NO_ACCESS, TIER_COLOR, TIER_SHORT, TIER_GROUP, TIER_GROUP_ORDER, type FormaTier,
} from "@/lib/forma/tiers";

export function TierPicker({
  value, inherited, onChange,
}: {
  value: FormaTier;
  inherited: boolean;
  onChange: (tier: FormaTier) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "group/tp inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
            "transition-all duration-150 hover:-translate-y-px hover:shadow-sm active:translate-y-0",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            inherited ? "border-dashed border-border/50 bg-transparent" : "bg-card",
          )}
          style={{ borderColor: inherited ? undefined : `${TIER_COLOR[value]}66` }}
        >
          <span className="h-2 w-2 rounded-full transition-transform duration-150 group-hover/tp:scale-125" style={{ backgroundColor: TIER_COLOR[value] }} />
          <span className={cn("tabular-nums", inherited ? "italic text-muted-foreground" : "text-foreground")}>{TIER_SHORT[value]}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]/tp:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] min-w-[15rem] overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange(NO_ACCESS)} className="cursor-pointer gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: TIER_COLOR[NO_ACCESS] }} />
          <span className="flex-1 text-[13px]">No access</span>
          {value === NO_ACCESS && <Check className="h-3.5 w-3.5 text-foreground" />}
        </DropdownMenuItem>
        {TIER_GROUP_ORDER.map((g) => (
          <Fragment key={g}>
            <DropdownMenuLabel className="px-2 pb-0.5 pt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/70">{g}</DropdownMenuLabel>
            {FORMA_TIERS.filter((t) => TIER_GROUP[t] === g).map((t) => (
              <DropdownMenuItem key={t} onSelect={() => onChange(t)} className="cursor-pointer gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: TIER_COLOR[t] }} />
                <span className="flex-1 text-[13px]">{t}</span>
                {value === t && <Check className="h-3.5 w-3.5 text-foreground" />}
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
