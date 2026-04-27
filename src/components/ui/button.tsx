/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nodu-accent-soft)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-[color:var(--nodu-accent)] text-white shadow-[0_14px_32px_rgba(255,128,13,0.24)] hover:translate-y-[-1px] hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.92)]",
        destructive:
          "border border-transparent bg-[color:#d45d37] text-white shadow-[0_14px_32px_rgba(212,93,55,0.22)] hover:translate-y-[-1px] hover:bg-[#be4f2f]",
        outline:
          "border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.9)] text-[color:var(--nodu-text)] shadow-[0_10px_24px_rgba(47,38,31,0.08)] hover:border-[color:rgb(var(--nodu-accent-rgb)/0.34)] hover:bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] hover:text-[color:var(--nodu-accent)]",
        secondary:
          "border border-transparent bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.18)]",
        ghost:
          "text-[color:var(--nodu-text-soft)] hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.1)] hover:text-[color:var(--nodu-accent)]",
        link: "text-[color:var(--nodu-accent)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
