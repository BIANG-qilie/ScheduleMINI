import { useMemo, type MouseEvent } from "react";
import {
  WEEKDAY_LABELS,
  compareTime,
  formatDateKey,
  getCurrentWeekColumns,
  itemOccursOnDate,
  itemRecurrence,
  type ScheduleItem,
} from "@/lib/config";
import { cn } from "@/lib/utils";

const DAY_PX = 52;
const GRID_START = 7;
const GRID_END = 22;

function timeToMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function clampMinutes(mins: number) {
  const min = GRID_START * 60;
  const max = GRID_END * 60;
  return Math.min(max, Math.max(min, mins));
}

type WeekGridProps = {
  items: ScheduleItem[];
  onCreateAt: (
    weekday: number,
    dateKey: string,
    start: string,
    end: string,
  ) => void;
  onEditItem: (item: ScheduleItem) => void;
};

export function WeekGrid({ items, onCreateAt, onEditItem }: WeekGridProps) {
  const hours = useMemo(
    () => Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i),
    [],
  );
  const todayKey = formatDateKey(new Date());
  const columns = useMemo(
    () => getCurrentWeekColumns(new Date()),
    [todayKey],
  );
  const totalHeight = (GRID_END - GRID_START) * DAY_PX;

  const enabledItems = useMemo(
    () => items.filter((it) => it.enabled).sort((a, b) => compareTime(a.start, b.start)),
    [items],
  );

  const handleLaneClick = (
    weekday: number,
    dateKey: string,
    e: MouseEvent<HTMLDivElement>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMins = GRID_START * 60 + (y / DAY_PX) * 60;
    const snapped = Math.floor(rawMins / 30) * 30;
    const startMins = clampMinutes(snapped);
    const endMins = clampMinutes(startMins + 60);
    if (endMins <= startMins) return;
    onCreateAt(weekday, dateKey, minutesToTime(startMins), minutesToTime(endMins));
  };

  return (
    <div className="overflow-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
      <div
        className="grid min-w-[720px]"
        style={{
          gridTemplateColumns: `48px repeat(7, minmax(0, 1fr))`,
        }}
      >
        <div className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[var(--color-surface)]" />
        {columns.map((col) => (
          <div
            key={`h-${col.dateKey}`}
            className={cn(
              "sticky top-0 z-20 border-b border-l border-[var(--color-line)] bg-[var(--color-surface)] px-1 py-2 text-center text-xs font-medium",
              col.dateKey === todayKey &&
                "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
            )}
          >
            <div>周{WEEKDAY_LABELS[col.weekday]}</div>
            <div className="mt-0.5 font-mono text-[10px] font-normal opacity-70">
              {col.monthDay}
            </div>
          </div>
        ))}

        <div className="relative" style={{ height: totalHeight }}>
          {hours.map((h) => (
            <div
              key={`t-${h}`}
              className="absolute right-1 -translate-y-1/2 font-mono text-[10px] text-[var(--color-ink-muted)]"
              style={{ top: (h - GRID_START) * DAY_PX }}
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {columns.map((col) => {
          const dayItems = enabledItems.filter((it) =>
            itemOccursOnDate(it, col.dateKey, col.weekday),
          );
          return (
            <div
              key={`c-${col.dateKey}`}
              className={cn(
                "relative border-l border-[var(--color-line)]",
                col.dateKey === todayKey &&
                  "bg-[color-mix(in_oklab,var(--color-accent)_5%,transparent)]",
              )}
              style={{ height: totalHeight }}
              onClick={(e) => handleLaneClick(col.weekday, col.dateKey, e)}
            >
              {hours.map((h) => (
                <div
                  key={`line-${col.dateKey}-${h}`}
                  className="pointer-events-none absolute inset-x-0 border-t border-[var(--color-line)]/70"
                  style={{ top: (h - GRID_START) * DAY_PX }}
                />
              ))}
              {hours.map((h) => (
                <div
                  key={`half-${col.dateKey}-${h}`}
                  className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--color-line)]/40"
                  style={{ top: (h - GRID_START) * DAY_PX + DAY_PX / 2 }}
                />
              ))}

              {dayItems.map((item, index) => {
                const start = clampMinutes(timeToMinutes(item.start));
                const end = clampMinutes(timeToMinutes(item.end));
                if (end <= start) return null;
                const top = ((start - GRID_START * 60) / 60) * DAY_PX;
                const height = Math.max(22, ((end - start) / 60) * DAY_PX - 2);
                const overlapOffset = (index % 3) * 4;
                const once = itemRecurrence(item) === "once";
                return (
                  <button
                    key={`${item.id}-${col.dateKey}`}
                    type="button"
                    title={`${item.start}–${item.end} ${item.title}${once ? "（仅一次）" : ""}`}
                    className={cn(
                      "absolute z-10 overflow-hidden rounded-md px-1.5 py-1 text-left shadow-sm transition hover:brightness-95",
                      once
                        ? "border border-amber-500/40 bg-amber-50"
                        : "border border-[color-mix(in_oklab,var(--color-accent)_35%,white)] bg-[var(--color-accent-soft)]",
                    )}
                    style={{
                      top,
                      height,
                      left: 4 + overlapOffset,
                      right: 4,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditItem(item);
                    }}
                  >
                    <p className="truncate text-[11px] font-semibold leading-tight text-[var(--color-ink)]">
                      {once ? `单·${item.title}` : item.title}
                    </p>
                    <p className="truncate font-mono text-[10px] text-[var(--color-ink-muted)]">
                      {item.start}–{item.end}
                    </p>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="border-t border-[var(--color-line)] px-3 py-2 text-[11px] text-[var(--color-ink-muted)]">
        本周视图 · 点空白新建 · 点色块编辑 · 琥珀色块为仅一次 · {GRID_START}:00–{GRID_END}:00
      </p>
    </div>
  );
}
