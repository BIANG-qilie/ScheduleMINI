import { useEffect, useState } from "react";
import {
  coexistenceElapsedMs,
  coexistenceIsPaused,
  formatDurationCompact,
} from "@/lib/config";
import { Button } from "@/components/ui/button";
import { useConfigStore } from "@/store/config-store";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  compact?: boolean;
};

export function CoexistenceBar({ className, compact }: Props) {
  const {
    config,
    startCoexistence,
    pauseCoexistence,
    resumeCoexistence,
    stopCoexistence,
  } = useConfigStore();
  const current = config.coexistence.current;
  const paused = coexistenceIsPaused(current);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!current) return;
    const id = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(id);
  }, [current?.id]);

  const elapsed = current
    ? formatDurationCompact(coexistenceElapsedMs(current, now))
    : null;

  if (!current) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button
          type="button"
          size="sm"
          variant={compact ? "secondary" : "default"}
          onClick={() => void startCoexistence()}
        >
          开启共处
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[color-mix(in_oklab,#b45309_12%,white)] px-2.5 py-1.5",
        compact && "border-white/15 bg-white/[0.06]",
        className,
      )}
    >
      <span
        className={cn(
          "text-xs font-medium",
          compact ? "text-white/85" : "text-[var(--color-ink)]",
        )}
      >
        共处中{paused ? " · 暂停" : ""} · {elapsed}
      </span>
      {paused ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void resumeCoexistence()}
        >
          继续
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void pauseCoexistence()}
        >
          暂停
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          const save = window.confirm("结束共处并记入共同日程？");
          void stopCoexistence({ createSharedItem: save });
        }}
      >
        结束
      </Button>
    </div>
  );
}
