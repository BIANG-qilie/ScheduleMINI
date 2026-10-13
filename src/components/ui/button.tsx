import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium tracking-wide transition-[background-color,transform,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-ink)] text-[var(--color-surface)] hover:bg-[color-mix(in_oklab,var(--color-ink)_86%,var(--color-accent))]",
        secondary:
          "bg-[var(--color-bg-deep)] text-[var(--color-ink)] hover:bg-[color-mix(in_oklab,var(--color-bg-deep)_82%,var(--color-ink))]",
        outline:
          "border border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[color-mix(in_oklab,var(--color-ink)_28%,var(--color-line))] hover:bg-[var(--color-bg)]",
        ghost: "hover:bg-[color-mix(in_oklab,var(--color-ink)_6%,transparent)]",
        danger:
          "bg-[var(--color-danger)] text-white hover:bg-[color-mix(in_oklab,var(--color-danger)_86%,black)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6",
        icon: "h-9 w-9",
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
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = "Button";
