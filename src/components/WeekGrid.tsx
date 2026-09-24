import { useMemo, useState, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  WEEKDAY_LABELS,
  compareTime,
  formatDateKey,
  formatWeekRangeLabel,
  getCurrentWeekColumns,
  getWeekAnchor,
  itemOccursOnDate,
  itemRecurrence,
  itemSegmentOnDate,
  itemTag,
  type DayOverride,
  type ScheduleItem,
} from "@/lib/config";
import { resolveDayState, type DayLabel } from "@/lib/holidays";
import { cn } from "@/lib/utils";

const DAY_PX = 52;

function timeToMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type WeekGridProps = {
  items: ScheduleItem[];
  showHolidays: boolean;
  dayOverrides: Record<string, DayOverride>;
  gridStartHour: number;
  gridEndHour: number;
  onCreateAt: (
    weekday: number,
    dateKey: string,
    start: string,
    end: string,
  ) => void;
  onEditItem: (item: ScheduleItem) => void;
  onSetDayOverride: (dateKey: string, value: DayOverride | null) => void;
};

export function WeekGrid({
  items,
  showHolidays,
  dayOverrides,
  gridStartHour,
  gridEndHour,
  onCreateAt,
  onEditItem,
  onSetDayOverride,
}: WeekGridProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [menu, setMenu] = useState<{
    dateKey: string;
    x: number;
    y: number;
  } | null>(null);

  const hours = useMemo(
    () =>
      Array.from(
        { length: Math.max(1, gridEndHour - gridStartHour) },
        (_, i) => gridStartHour + i,
      ),
    [gridStartHour, gridEndHour],
  );
  const todayKey = formatDateKey(new Date());
  const columns = useMemo(
    () => getCurrentWeekColumns(getWeekAnchor(weekOffset)),
    [weekOffset, todayKey],
  );
  const rangeLabel = formatWeekRangeLabel(columns);
  const isCurrentWeek = weekOffset === 0;
  // 底边留白，避免贴底色块被圆角/滚动裁切
  const bottomPad = 12;
  const totalHeight = (gridEndHour - gridStartHour) * DAY_PX + bottomPad;

  const enabledItems = useMemo(
    () => items.filter((it) => it.enabled).sort((a, b) => compareTime(a.start, b.start)),
    [items],
  );

  const dayLabels = useMemo(() => {
    const map = new Map<string, DayLabel>();
    for (const col of columns) {
      map.set(col.dateKey, resolveDayState(col.dateKey, dayOverrides));
    }
    return map;
  }, [columns, dayOverrides]);

  const clampMinutes = (mins: number) => {
    const min = gridStartHour * 60;
    const max = gridEndHour * 60;
    return Math.min(max, Math.max(min, mins));
  };

  const timeToClampedMinutes = (hhmm: string) => {
    if (hhmm === "24:00") return gridEndHour * 60;
    return clampMinutes(timeToMinutes(hhmm));
  };

  const handleLaneClick = (
    weekday: number,
    dateKey: string,
    e: MouseEvent<HTMLDivElement>,
  ) => {
    setMenu(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMins = gridStartHour * 60 + (y / DAY_PX) * 60;
    const snapped = Math.floor(rawMins / 30) * 30;
    const startMins = clampMinutes(snapped);
    const endMins = clampMinutes(startMins + 60);
    if (endMins <= startMins) return;
    onCreateAt(weekday, dateKey, minutesToTime(startMins), minutesToTime(endMins));
  };

  return (
    <div
      className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]"
      onClick={() => setMenu(null)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="上一周"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-line)] text-[var(--color-ink)] transition hover:bg-[var(--color-accent-soft)]"
            onClick={() => setWeekOffset((o) => o - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="下一周"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-line)] text-[var(--color-ink)] transition hover:bg-[var(--color-accent-soft)]"
            onClick={() => setWeekOffset((o) => o + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isCurrentWeek ? (
            <button
              type="button"
              className="ml-1 inline-flex h-8 items-center rounded-md border border-[var(--color-line)] px-2.5 text-xs text-[var(--color-ink-muted)] transition hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
              onClick={() => setWeekOffset(0)}
            >
              回到本周
            </button>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-[var(--color-ink)]">
            {isCurrentWeek
              ? "本周"
              : weekOffset > 0
                ? `往后第 ${weekOffset} 周`
                : `往前第 ${-weekOffset} 周`}
          </p>
          <p className="font-mono text-[11px] text-[var(--color-ink-muted)]">
            {rangeLabel}
          </p>
        </div>
      </div>

      <div className="overflow-auto">
        <div
          className="grid min-w-[720px]"
          style={{
            gridTemplateColumns: `48px repeat(7, minmax(0, 1fr))`,
          }}
        >
          <div className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[var(--color-surface)]" />
          {columns.map((col) => {
            const label = dayLabels.get(col.dateKey);
            const off = label?.isOff;
            return (
              <button
                key={`h-${col.dateKey}`}
                type="button"
                className={cn(
                  "sticky top-0 z-20 border-b border-l border-[var(--color-line)] bg-[var(--color-surface)] px-1 py-2 text-center text-xs font-medium",
                  col.dateKey === todayKey &&
                    "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
                  off &&
                    showHolidays &&
                    "bg-[color-mix(in_oklab,#b45309_8%,var(--color-surface))]",
                )}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenu({ dateKey: col.dateKey, x: e.clientX, y: e.clientY });
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu({ dateKey: col.dateKey, x: e.clientX, y: e.clientY });
                }}
              >
                <div>周{WEEKDAY_LABELS[col.weekday]}</div>
                <div className="mt-0.5 font-mono text-[10px] font-normal opacity-70">
                  {col.monthDay}
                </div>
                {showHolidays && label && label.kind !== "none" ? (
                  <div
                    className={cn(
                      "mt-1 truncate text-[10px] font-normal",
                      label.isOff
                        ? "text-[var(--color-warn)]"
                        : "text-[var(--color-accent)]",
                    )}
                    title={label.name}
                  >
                    {label.name}
                  </div>
                ) : null}
              </button>
            );
          })}

          <div className="relative" style={{ height: totalHeight }}>
            {hours.map((h) => (
              <div
                key={`t-${h}`}
                className="absolute right-1 -translate-y-1/2 font-mono text-[10px] text-[var(--color-ink-muted)]"
                style={{ top: (h - gridStartHour) * DAY_PX }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {columns.map((col) => {
            const label = dayLabels.get(col.dateKey);
            const dayItems = enabledItems.filter((it) =>
              itemOccursOnDate(it, col.dateKey, col.weekday, dayOverrides),
            );
            return (
              <div
                key={`c-${col.dateKey}`}
                className={cn(
                  "relative border-l border-[var(--color-line)]",
                  col.dateKey === todayKey &&
                    "bg-[color-mix(in_oklab,var(--color-accent)_5%,transparent)]",
                  label?.isOff &&
                    showHolidays &&
                    "bg-[color-mix(in_oklab,#b45309_4%,transparent)]",
                )}
                style={{ height: totalHeight }}
                onClick={(e) => handleLaneClick(col.weekday, col.dateKey, e)}
              >
                {hours.map((h) => (
                  <div
                    key={`line-${col.dateKey}-${h}`}
                    className="pointer-events-none absolute inset-x-0 border-t border-[var(--color-line)]/70"
                    style={{ top: (h - gridStartHour) * DAY_PX }}
                  />
                ))}
                {hours.map((h) => (
                  <div
                    key={`half-${col.dateKey}-${h}`}
                    className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--color-line)]/40"
                    style={{ top: (h - gridStartHour) * DAY_PX + DAY_PX / 2 }}
                  />
                ))}

                {dayItems.map((item, index) => {
                  const segment = itemSegmentOnDate(
                    item,
                    col.dateKey,
                    col.weekday,
                  );
                  if (!segment) return null;
                  let start = timeToClampedMinutes(segment.start);
                  let end =
                    segment.end === "24:00"
                      ? gridEndHour * 60
                      : timeToClampedMinutes(segment.end);
                  // 贴网格下沿的跨日晚段（如 22:00–24:00 且网格止于 22）仍显示一小截
                  if (end <= start && segment.end === "24:00") {
                    end = gridEndHour * 60;
                    start = Math.max(gridStartHour * 60, end - 40);
                  }
                  if (end <= start) return null;
                  const top = ((start - gridStartHour * 60) / 60) * DAY_PX;
                  const height = Math.max(22, ((end - start) / 60) * DAY_PX - 2);
                  const overlapOffset = (index % 3) * 4;
                  const once = itemRecurrence(item) === "once";
                  const rest = itemTag(item) === "rest";
                  const overnight =
                    segment.end === "24:00" || segment.start === "00:00";
                  return (
                    <button
                      key={`${item.id}-${col.dateKey}`}
                      type="button"
                      title={`${item.start}–${item.end} ${item.title}${once ? "（仅一次）" : ""}${rest ? "（休息）" : ""}${overnight ? "（跨日）" : ""}`}
                      className={cn(
                        "absolute z-10 overflow-hidden rounded-md px-1.5 py-1 text-left shadow-sm transition hover:brightness-95",
                        once
                          ? "border border-amber-500/40 bg-amber-50"
                          : rest
                            ? "border border-sky-500/35 bg-sky-50"
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
      </div>

      {menu ? (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-accent-soft)]"
            onClick={() => {
              onSetDayOverride(menu.dateKey, "off");
              setMenu(null);
            }}
          >
            设为放假
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-accent-soft)]"
            onClick={() => {
              onSetDayOverride(menu.dateKey, "work");
              setMenu(null);
            }}
          >
            设为上班
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-accent-soft)]"
            onClick={() => {
              onSetDayOverride(menu.dateKey, null);
              setMenu(null);
            }}
          >
            恢复默认
          </button>
        </div>
      ) : null}
    </div>
  );
}
