import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** 编辑器等长表单：收紧内边距、粘性底栏 */
  dense?: boolean;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  dense = false,
}: DialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <button
        type="button"
        aria-label={`关闭${title}`}
        className="absolute inset-0 bg-[color-mix(in_oklab,var(--color-ink)_42%,transparent)]"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_24px_64px_-28px_rgba(28,36,48,0.45)]",
          dense
            ? "max-h-[min(92vh,820px)] max-w-md"
            : "max-h-[min(90vh,780px)] max-w-lg p-5",
          className,
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-line)]/70",
            dense ? "px-4 py-3.5" : "mb-4",
          )}
        >
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-ink)]">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
        </div>
        {/*
          gap（非 space-y）+ 上下内边距：滚动容器不裁切中文 label 字顶
        */}
        <div
          className={cn(
            "min-h-0 flex-1 overflow-x-hidden overflow-y-auto",
            dense
              ? "flex flex-col gap-5 px-4 py-4"
              : "flex flex-col gap-4 py-1",
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            className={cn(
              "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--color-line)]/70 bg-[color-mix(in_oklab,var(--color-surface)_92%,var(--color-bg-deep))]",
              dense ? "px-4 py-3" : "mt-5 pt-4",
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
