import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.88)] px-3 py-2 text-base text-[color:var(--nodu-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[color:var(--nodu-text)] placeholder:text-[color:var(--nodu-text-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nodu-accent-soft)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
