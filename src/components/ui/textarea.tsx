import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.88)] px-3 py-2 text-sm text-[color:var(--nodu-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-offset-background placeholder:text-[color:var(--nodu-text-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nodu-accent-soft)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
