import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        // leading-normal + block：避免 overflow 容器里中文顶部被裁切
        "block overflow-visible text-sm font-medium leading-normal text-[var(--color-ink)] peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}
