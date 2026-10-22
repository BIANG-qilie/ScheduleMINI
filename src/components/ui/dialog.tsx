import * as React from "react";
import { X } from "lucide-react";
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
  /** 标题上方的短标；缺省不显示 */
  eyebrow?: string;
  /** 编辑器等长表单：收紧滚动区、粘性底栏 */
  dense?: boolean;
  /** 宽幅组合面板（编辑器） */
  panel?: boolean;
  /**
   * 仅手机：整张卡片离底边的距离（px）。
   * 桌面端仍居中，不使用这个值。
   */
  mobileLift?: number;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  eyebrow,
  dense = false,
  panel = false,
  mobileLift,
}: DialogProps) {
  const dragStart = React.useRef<number | null>(null);
  const [dragY, setDragY] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4",
        mobileLift != null && "update-dialog-lift",
      )}
      style={
        mobileLift == null
          ? undefined
          : ({ "--update-dialog-lift": `${mobileLift}px` } as React.CSSProperties)
      }
    >
      <button
        type="button"
        aria-label={`关闭${title}`}
        className="absolute inset-0 bg-[color-mix(in_oklab,var(--color-ink)_46%,transparent)] backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "sheet-in relative z-10 flex w-full flex-col overflow-hidden border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-sheet)]",
          "max-h-[min(94vh,900px)] rounded-t-3xl sm:rounded-3xl",
          panel
            ? "sm:max-w-[920px]"
            : dense
              ? "sm:max-w-md"
              : "sm:max-w-lg",
          !panel && !dense && "p-5 sm:p-6",
          className,
        )}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="sheet-grip"
          aria-hidden
          onPointerDown={(e) => {
            dragStart.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragStart.current == null) return;
            setDragY(Math.max(0, e.clientY - dragStart.current));
          }}
          onPointerUp={() => {
            const pulled = dragY;
            dragStart.current = null;
            setDragY(0);
            if (pulled > 90) onOpenChange(false);
          }}
          onPointerCancel={() => {
            dragStart.current = null;
            setDragY(0);
          }}
        >
          <span />
        </div>
        <div
          className={cn(
            "flex shrink-0 items-start justify-between gap-4 border-b border-[var(--color-line)]",
            panel || dense ? "px-5 py-4 sm:px-7" : "mb-5",
          )}
        >
          <div className="min-w-0 pt-0.5">
            {eyebrow ? <p className="kicker">{eyebrow}</p> : null}
            <h2
              className={cn(
                "font-display text-[1.65rem] font-medium leading-none tracking-tight text-[var(--color-ink)]",
                eyebrow && "mt-1",
              )}
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="关闭"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-x-hidden overflow-y-auto",
            panel
              ? "px-5 py-5 sm:px-7 sm:py-6"
              : dense
                ? "flex flex-col gap-5 px-4 py-4"
                : "flex flex-col gap-4 py-1",
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            className={cn(
              "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_35%,var(--color-surface))]",
              panel || dense ? "px-5 py-3.5 sm:px-7" : "mt-5 pt-4",
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
