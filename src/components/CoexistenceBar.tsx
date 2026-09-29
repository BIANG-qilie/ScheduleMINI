import { useEffect, useState } from "react";
import {
  coexistenceElapsedMs,
  coexistenceIsPaused,
  formatDurationCompact,
} from "@/lib/config";
import { useConfigStore } from "@/store/config-store";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  compact?: boolean;
};

function TogetherMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex h-3.5 w-4 shrink-0", className)}
    >
      <span className="absolute left-0 top-0.5 h-2.5 w-2.5 rounded-full bg-current opacity-80" />
      <span className="absolute right-0 top-0.5 h-2.5 w-2.5 rounded-full bg-current opacity-55" />
    </span>
  );
}

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
      <div
        className={cn(
          "flex items-center gap-2",
          compact && "h-full w-full justify-center",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => void startCoexistence()}
          className={cn(
            "group inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold tracking-wide",
            "transition-[transform,filter,box-shadow] duration-200 ease-out",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-coex)]/50",
            "hover:-translate-y-px active:translate-y-0",
            compact
              ? "coex-start-compact bg-[linear-gradient(135deg,#f7a8bc_0%,#e8799a_55%,#d65a82_100%)] text-white hover:brightness-110"
              : "coex-start-main bg-[linear-gradient(140deg,#f9cdd8_0%,#f2a8bb_52%,#e891a6_100%)] text-[#5a2438] hover:brightness-[1.03]",
          )}
        >
          <TogetherMark
            className={cn(
              "transition-transform duration-300 group-hover:scale-110",
              compact ? "text-white" : "text-[#c45a78]",
            )}
          />
          开启共处
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "coex-running flex flex-wrap items-center gap-2 rounded-full border px-2.5 py-1.5",
        compact
          ? "border-[rgba(255,180,200,0.28)] bg-[linear-gradient(135deg,rgba(244,164,184,0.16),rgba(214,98,132,0.12))]"
          : "border-[#f0c0cc] bg-[linear-gradient(135deg,#fff7f9_0%,#fde8ee_100%)] shadow-[0_2px_10px_-4px_rgba(196,84,120,0.28)]",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium",
          compact ? "text-[#ffe4ec]" : "text-[#5a2438]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            paused
              ? compact
                ? "bg-[#ffd0a8]"
                : "bg-[#d97706]"
              : cn(
                  "bg-[#e891a6]",
                  !paused && "coex-pulse",
                  compact && "bg-[#ffb0c4]",
                ),
          )}
        />
        共处中{paused ? " · 暂停" : ""} · {elapsed}
      </span>
      {paused ? (
        <button
          type="button"
          className={cn(
            "coex-chip",
            compact ? "coex-chip-compact" : "coex-chip-light",
          )}
          onClick={() => void resumeCoexistence()}
        >
          继续
        </button>
      ) : (
        <button
          type="button"
          className={cn(
            "coex-chip",
            compact ? "coex-chip-compact" : "coex-chip-light",
          )}
          onClick={() => void pauseCoexistence()}
        >
          暂停
        </button>
      )}
      <button
        type="button"
        className={cn(
          "coex-chip",
          compact ? "coex-chip-compact" : "coex-chip-light",
        )}
        onClick={() => {
          const save = window.confirm("结束共处并记入共同日程？");
          void stopCoexistence({ createSharedItem: save });
        }}
      >
        结束
      </button>
    </div>
  );
}
