import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-accent)] text-white hover:bg-[color-mix(in_oklab,var(--color-accent)_88%,black)]",
        secondary:
          "bg-[var(--color-bg-deep)] text-[var(--color-ink)] hover:bg-[color-mix(in_oklab,var(--color-bg-deep)_85%,black)]",
        outline:
          "border border-[var(--color-line)] bg-[var(--color-surface)] hover:bg-[var(--color-bg-deep)]",
        ghost: "hover:bg-[var(--color-bg-deep)]",
        danger:
          "bg-[var(--color-danger)] text-white hover:bg-[color-mix(in_oklab,var(--color-danger)_88%,black)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6",
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
