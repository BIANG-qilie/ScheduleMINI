import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex min-h-[76px] w-full resize-y rounded-xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_28%,var(--color-surface))] px-3 py-2.5 text-sm leading-relaxed placeholder:text-[color-mix(in_oklab,var(--color-ink-muted)_75%,white)] focus-visible:border-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--color-accent)_35%,transparent)] disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";
