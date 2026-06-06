import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "gradient-primary text-primary-foreground hover:opacity-90 shadow-colorful hover:shadow-lg transition-all",
        destructive:
          "bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 focus-visible:ring-red-500/20 dark:focus-visible:ring-red-500/40 shadow-md hover:shadow-lg transition-all",
        outline:
          "border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black dark:bg-input/30 dark:border-input dark:hover:bg-input/50 transition-all",
        secondary:
          "bg-gradient-to-r from-cyan-100 to-teal-100 text-cyan-900 hover:from-cyan-200 hover:to-teal-200 hover:text-black shadow-sm hover:shadow-md transition-all",
        ghost:
          "hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:text-black transition-all",
        link: "text-primary underline-offset-4 hover:underline hover:text-black transition-colors",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props} />
  );
}

export { Button, buttonVariants }
