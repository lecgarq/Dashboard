import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[transform,box-shadow,background-color,color,border-color] duration-300 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_18px_30px_-18px_rgba(20,33,61,0.9)] hover:-translate-y-0.5 hover:bg-primary/92 hover:shadow-[0_24px_38px_-20px_rgba(20,33,61,0.8)]",
        destructive:
          "bg-destructive text-white shadow-[0_18px_30px_-18px_rgba(239,68,68,0.7)] hover:-translate-y-0.5 hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-white/70 bg-white/72 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.55)] hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_12px_24px_-20px_rgba(15,23,42,0.35)] hover:-translate-y-0.5 hover:bg-secondary/88",
        ghost:
          "hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
      pro: {
        true: "btn-pro",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      pro: false,
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  pro = false,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, pro, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
