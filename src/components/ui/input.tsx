import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-10 w-full rounded-xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_28%,var(--color-surface))] px-3 py-1 text-sm shadow-none transition-[border-color,background-color] placeholder:text-[color-mix(in_oklab,var(--color-ink-muted)_75%,white)] focus-visible:border-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--color-accent)_35%,transparent)] disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";
