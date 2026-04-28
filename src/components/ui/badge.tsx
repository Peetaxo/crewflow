/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--nodu-accent-soft)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[color:rgb(var(--nodu-accent-rgb)/0.14)] text-[color:var(--nodu-accent)] hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.2)]",
        secondary: "border-transparent bg-[color:rgb(var(--nodu-text-rgb)/0.08)] text-[color:var(--nodu-text)] hover:bg-[color:rgb(var(--nodu-text-rgb)/0.12)]",
        destructive: "border-transparent bg-[color:rgba(212,93,55,0.14)] text-[#c45c39] hover:bg-[color:rgba(212,93,55,0.2)]",
        outline: "border-[color:var(--nodu-border)] text-[color:var(--nodu-text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
