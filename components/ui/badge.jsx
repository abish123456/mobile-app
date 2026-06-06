import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent text-white focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        success:
          "border-transparent text-white",
        orange:
          "border-transparent text-white",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-black",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "span"
  
  // Inline styles for color variants to ensure they work in production
  let inlineStyle = {}
  if (variant === 'success') {
    inlineStyle = { backgroundColor: '#10b981', color: 'white' }
  } else if (variant === 'orange') {
    inlineStyle = { backgroundColor: '#f97316', color: 'white' }
  } else if (variant === 'destructive') {
    inlineStyle = { backgroundColor: '#ef4444', color: 'white' }
  }

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      style={inlineStyle}
      {...props} />
  );
}

export { Badge, badgeVariants }
