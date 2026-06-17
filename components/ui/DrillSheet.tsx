"use client"

import * as React from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { PremiumSurface } from "@/components/ui/PremiumSurface"
import { cn } from "@/lib/core/utils"

/**
 * DrillSheet — shared right-slide ~480px drill panel shell (INT-01).
 *
 * THE single drill-target for all four pages (/users, /access-analysis,
 * /template-mty, /forma-proposal). Built as an EMPTY shell: renders
 * arbitrary `children` and wires NO content sources — per-page phases
 * pass <UserProfilePanel> or list content as children.
 *
 * Depends on:
 *   - Plan 01-01: depth/glow/glass CSS tokens
 *   - Plan 01-03: PremiumSurface (glass variant for frosted panel body)
 */
export interface DrillSheetProps {
  /** Controls whether the sheet is visible (externally controlled). */
  open: boolean
  /** Called when the overlay, Escape key, or the built-in close button dismisses the sheet. */
  onClose: () => void
  /** Optional panel heading rendered in a SheetHeader. */
  title?: string
  /** Optional subtitle rendered below the title. */
  description?: string
  /** Arbitrary content — the only content seam (empty shell). */
  children: React.ReactNode
}

/**
 * DrillSheet slides from the RIGHT at ~480px width with an externally-controlled
 * open/close lifecycle. The content area carries premium glass styling via
 * PremiumSurface variant="glass" (frosted, theme-aware).
 *
 * Width override: `w-[480px] sm:w-[480px]` on SheetContent beats the shadcn
 * default `sm:max-w-sm` (RESEARCH Pitfall 7).
 *
 * Animation: inherits shadcn Sheet slide-in-from-right / slide-out-to-right.
 * The optional `data-[state=open]:duration-[350ms]` keeps the open within the
 * smooth-flowing motion budget (~350ms vs the default 500ms).
 */
export function DrillSheet({
  open,
  onClose,
  title,
  description,
  children,
}: DrillSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <SheetContent
        side="right"
        className={cn(
          // Width override — beats `sm:max-w-sm` default (RESEARCH Pitfall 7)
          "w-[480px] sm:w-[480px]",
          // Trim the open animation from the default 500ms to ~350ms for smooth-flow budget
          "data-[state=open]:duration-[350ms]",
          // Remove the default bg-background so PremiumSurface glass controls the surface
          "bg-transparent p-0 gap-0"
        )}
      >
        {/* Premium glass surface wraps the full content area */}
        <PremiumSurface
          variant="glass"
          className="flex h-full w-full flex-col gap-4 overflow-y-auto p-6"
        >
          {/* Conditional header — only mounted when title is supplied */}
          {title && (
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              {description && (
                <SheetDescription>{description}</SheetDescription>
              )}
            </SheetHeader>
          )}

          {/* The only content seam — empty shell accepts any children */}
          {children}
        </PremiumSurface>
      </SheetContent>
    </Sheet>
  )
}
