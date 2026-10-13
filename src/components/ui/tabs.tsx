import * as React from "react";
import { cn } from "@/lib/utils";

type TabItem = {
  value: string;
  label: string;
};

type TabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  items: TabItem[];
  children: React.ReactNode;
  className?: string;
};

export function Tabs({
  value,
  onValueChange,
  items,
  children,
  className,
}: TabsProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div
        role="tablist"
        className="flex gap-1 border-b border-[var(--color-line)]"
      >
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              className={cn(
                "-mb-px flex-1 border-b-2 px-3 py-2.5 text-sm tracking-wide transition-colors",
                active
                  ? "border-[var(--color-ink)] font-medium text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
              )}
              onClick={() => onValueChange(item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}

type TabsContentProps = {
  value: string;
  when: string;
  children: React.ReactNode;
  className?: string;
};

export function TabsContent({
  value,
  when,
  children,
  className,
}: TabsContentProps) {
  if (value !== when) return null;
  return (
    <div role="tabpanel" className={cn("space-y-4", className)}>
      {children}
    </div>
  );
}
