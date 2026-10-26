import { Minus } from "lucide-react";
import {
  showDesktopMiniMinimize,
  type ShellPlatform,
} from "@/lib/mini-minimize";
import { cn } from "@/lib/utils";
import type { AppView } from "@/lib/windows";

/** 与周历「上一周 / 下一周」同一套纸面圆按钮，缩到小窗顶栏也能放下。 */
const chromeClass =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] transition hover:bg-[var(--color-accent-soft)]";

export function MiniMinimizeButton({
  onMinimize,
  className,
}: {
  onMinimize: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label="最小化"
      title="最小化"
      className={cn(chromeClass, className)}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onMinimize();
      }}
    >
      <Minus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
    </button>
  );
}

export function DesktopMiniChrome({
  view,
  platform,
  onMinimize,
  className,
}: {
  view: AppView;
  platform: ShellPlatform;
  onMinimize: () => void;
  className?: string;
}) {
  if (!showDesktopMiniMinimize(view, platform)) return null;
  return <MiniMinimizeButton className={className} onMinimize={onMinimize} />;
}
