import { cn } from "@/lib/core/utils";

/**
 * PremiumSurface — RSC-safe card primitive with 4 depth variants (base | float | glass | inset)
 * and an optional brand-primary glow accent. Wraps any panel content and provides the
 * `relative` positioning context required for the `.panel-elevated::after` catch-light pseudo.
 */

export interface PremiumSurfaceProps extends React.ComponentProps<"div"> {
  /** Visual depth variant. Defaults to "base" (panel-elevated with catch-light). */
  variant?: "base" | "float" | "glass" | "inset";
  /** Adds a brand-primary accent ring via --glow-primary. Use only on selected/accent elements. */
  glow?: boolean;
  className?: string;
  children: React.ReactNode;
}

const variantClasses: Record<NonNullable<PremiumSurfaceProps["variant"]>, string> = {
  /** Reuses the dual-theme .panel-elevated catch-light + layered shadow from globals.css. */
  base: "panel-elevated",
  /** Floating card: --depth-float shadow + frosted blur on top of bg-card. */
  float: "rounded-xl bg-card backdrop-blur-sm shadow-[var(--depth-float)]",
  /** Frosted glass surface: theme-aware --surface-2 fill + subtle border + medium blur. */
  glass: "rounded-xl bg-surface-2 border border-surface-border backdrop-blur-md",
  /** Recessed / inset surface: subtle inset shadow + translucent muted fill. */
  inset: "rounded-xl bg-muted/30 shadow-[var(--depth-inset,inset_0_2px_8px_rgba(0,0,0,0.08))]",
};

export function PremiumSurface({
  variant = "base",
  glow = false,
  className,
  children,
  ...props
}: PremiumSurfaceProps) {
  return (
    <div
      className={cn(
        "relative",
        variantClasses[variant],
        glow && "shadow-[var(--glow-primary)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
