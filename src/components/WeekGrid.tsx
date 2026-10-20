import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  WEEKDAY_LABELS,
  clockToCycleMinutes,
  compareTime,
  computeOverlapLayout,
  formatDateKey,
  formatWeekRangeLabel,
  getCurrentWeekColumns,
  getWeekAnchor,
  gridDayHours,
  gridViewSpanHours,
  itemDisplayTitle,
  itemOccursOnDate,
  itemRecurrence,
  itemSegmentOnDate,
  ownerColor,
  type CoupleIdentity,
  type DayOverride,
  type ScheduleItem,
} from "@/lib/config";
import { onHolidayData, resolveDayState, type DayLabel } from "@/lib/holidays";
import {
  formatItemSubline,
  itemHoverText,
  ownerSurfaceStyle,
} from "@/lib/schedule-style";
import { cn } from "@/lib/utils";

const DAY_PX = 52;
const CYCLE_MINUTES = 24 * 60;

function minutesToClock(cycleStartHour: number, offsetMins: number) {
  const total = cycleStartHour * 60 + offsetMins;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type WeekGridProps = {
  items: ScheduleItem[];
  couple: CoupleIdentity;
  showHolidays: boolean;
  dayOverrides: Record<string, DayOverride>;
  gridStartHour: number;
  gridEndHour: number;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onCreateAt: (
    weekday: number,
    dateKey: string,
    start: string,
    end: string,
  ) => void;
  onEditItem: (item: ScheduleItem, dateKey?: string) => void;
  onSkipOccurrence: (item: ScheduleItem, dateKey: string) => void;
  onDeleteItem: (item: ScheduleItem) => void;
  onSetDayOverride: (dateKey: string, value: DayOverride | null) => void;
  /** board：七列周历。day：一次看一天，给手机用。 */
  layout?: "board" | "day";
};

type GridMenu =
  | { kind: "day"; dateKey: string; x: number; y: number }
  | {
      kind: "item";
      item: ScheduleItem;
      dateKey: string;
      x: number;
      y: number;
    };

export function WeekGrid({
  items,
  couple,
  showHolidays,
  dayOverrides,
  gridStartHour,
  gridEndHour,
  selectedIds,
  onToggleSelect,
  onCreateAt,
  onEditItem,
  onSkipOccurrence,
  onDeleteItem,
  onSetDayOverride,
  layout = "board",
}: WeekGridProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [menu, setMenu] = useState<GridMenu | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const pressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [holidayTick, setHolidayTick] = useState(0);

  useEffect(() => onHolidayData(() => setHolidayTick((n) => n + 1)), []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const hours = useMemo(
    () => gridDayHours(gridStartHour),
    [gridStartHour],
  );
  const viewSpan = gridViewSpanHours(gridStartHour, gridEndHour);
  const todayKey = formatDateKey(now);
  const columns = useMemo(
    () => getCurrentWeekColumns(getWeekAnchor(weekOffset, now)),
    [weekOffset, todayKey],
  );
  const rangeLabel = formatWeekRangeLabel(columns);
  const isCurrentWeek = weekOffset === 0;
  const dayLayout = layout === "day";
  const focusCol =
    columns.find((col) => col.dateKey === focusKey) ??
    columns.find((col) => col.dateKey === todayKey) ??
    columns[0];
  const shown = dayLayout && focusCol ? [focusCol] : columns;

  useEffect(() => {
    if (!dayLayout) return;
    if (columns.some((col) => col.dateKey === focusKey)) return;
    const today = columns.find((col) => col.dateKey === todayKey);
    setFocusKey((today ?? columns[0])?.dateKey ?? null);
  }, [columns, dayLayout, focusKey, todayKey]);

  const clearPress = () => {
    if (pressTimer.current != null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const placeMenu = (x: number, y: number) => {
    const width = 220;
    const height = 220;
    return {
      x: Math.max(8, Math.min(x, window.innerWidth - width)),
      y: Math.max(8, Math.min(y, window.innerHeight - height)),
    };
  };
  // 底边留白，避免贴底色块被圆角/滚动裁切
  const bottomPad = 12;
  const totalHeight = 24 * DAY_PX + bottomPad;
  const viewHeight = viewSpan * DAY_PX + bottomPad;

  const nowLineTop = useMemo(() => {
    if (!isCurrentWeek) return null;
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const offset = clockToCycleMinutes(hhmm, gridStartHour);
    if (offset < 0 || offset > CYCLE_MINUTES) return null;
    return (offset / 60) * DAY_PX;
  }, [now, isCurrentWeek, gridStartHour]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, dayOverrides, holidayTick]);

  const stepDay = (dir: 1 | -1) => {
    if (!focusCol) return;
    const idx = columns.findIndex((c) => c.dateKey === focusCol.dateKey);
    const next = columns[idx + dir];
    if (next) {
      setFocusKey(next.dateKey);
      return;
    }
    setWeekOffset((o) => o + dir);
    setFocusKey(null);
  };

  const handleLaneClick = (
    weekday: number,
    dateKey: string,
    e: MouseEvent<HTMLDivElement>,
  ) => {
    setMenu(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawOffset = Math.floor((y / DAY_PX) * 60);
    const snapped = Math.floor(rawOffset / 30) * 30;
    const startOffset = Math.max(0, Math.min(CYCLE_MINUTES - 30, snapped));
    const endOffset = Math.min(CYCLE_MINUTES, startOffset + 60);
    if (endOffset <= startOffset) return;
    onCreateAt(
      weekday,
      dateKey,
      minutesToClock(gridStartHour, startOffset),
      minutesToClock(gridStartHour, endOffset),
    );
  };

  return (
    <div
      className={cn(
        "paper-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl",
        dayLayout && "phone-week",
      )}
      onClick={() => setMenu(null)}
      onPointerDown={(e) => {
        if (dayLayout) swipe.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const from = swipe.current;
        swipe.current = null;
        if (!dayLayout || !from) return;
        const dx = e.clientX - from.x;
        const dy = e.clientY - from.y;
        if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 0);
        stepDay(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
        <div>
          <p className="font-display text-2xl leading-none tracking-tight text-[var(--color-ink)]">
            {isCurrentWeek
              ? "本周"
              : weekOffset > 0
                ? `往后第 ${weekOffset} 周`
                : `往前第 ${-weekOffset} 周`}
          </p>
          <p className="mt-1 font-mono text-[11px] tracking-wide text-[var(--color-ink-muted)]">
            {rangeLabel}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="上一周"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-line)] text-[var(--color-ink)] transition hover:bg-[var(--color-accent-soft)]"
            onClick={() => setWeekOffset((o) => o - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="下一周"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-line)] text-[var(--color-ink)] transition hover:bg-[var(--color-accent-soft)]"
            onClick={() => setWeekOffset((o) => o + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isCurrentWeek ? (
            <button
              type="button"
              className="ml-1 inline-flex h-8 items-center rounded-full border border-[var(--color-line)] px-3 text-xs tracking-wide text-[var(--color-ink-muted)] transition hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-ink)]"
              onClick={() => setWeekOffset(0)}
            >
              回到本周
            </button>
          ) : null}
        </div>
      </div>

      {dayLayout ? (
        <div className="phone-days flex shrink-0 gap-1 overflow-x-auto px-2 py-2">
          {columns.map((col) => {
            const label = dayLabels.get(col.dateKey);
            const active = col.dateKey === focusCol?.dateKey;
            return (
              <button
                key={`chip-${col.dateKey}`}
                type="button"
                className={cn(
                  "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center rounded-2xl px-1 py-1.5",
                  active
                    ? "bg-[var(--color-ink)] text-[var(--color-surface)]"
                    : "text-[var(--color-ink)]",
                  !active &&
                    col.dateKey === todayKey &&
                    "bg-[var(--color-accent-soft)]",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setFocusKey(col.dateKey);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const pos = placeMenu(e.clientX, e.clientY);
                  setMenu({ kind: "day", dateKey: col.dateKey, ...pos });
                }}
              >
                <span className="text-[10px] tracking-wide">
                  周{WEEKDAY_LABELS[col.weekday]}
                </span>
                <span className="mt-0.5 font-display text-lg leading-none tabular-nums">
                  {Number(col.dateKey.slice(8, 10))}
                </span>
                {showHolidays && label && label.kind !== "none" ? (
                  <span
                    className={cn(
                      "mt-1 h-1 w-1 rounded-full",
                      label.isOff ? "bg-[var(--color-warn)]" : "bg-current opacity-50",
                    )}
                    title={label.name}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-auto"
        style={{ maxHeight: viewHeight + 8 }}
      >
        <div
          className={cn("grid", dayLayout ? "min-w-0" : "min-w-[720px]")}
          style={{
            gridTemplateColumns: dayLayout
              ? "52px minmax(0, 1fr)"
              : "52px repeat(7, minmax(0, 1fr))",
          }}
        >
          <div className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[var(--color-surface)]" />
          {shown.map((col) => {
            const label = dayLabels.get(col.dateKey);
            const off = label?.isOff;
            return (
              <button
                key={`h-${col.dateKey}`}
                type="button"
                className={cn(
                  "sticky top-0 z-20 border-b border-l border-[var(--color-line)] bg-[var(--color-surface)] px-1 py-2.5 text-center",
                  col.dateKey === todayKey && "bg-[var(--color-accent-soft)]",
                  off &&
                    showHolidays &&
                    "bg-[color-mix(in_oklab,var(--color-warn)_8%,var(--color-surface))]",
                )}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenu({
                    kind: "day",
                    dateKey: col.dateKey,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const pos = placeMenu(e.clientX, e.clientY);
                  setMenu({
                    kind: "day",
                    dateKey: col.dateKey,
                    ...pos,
                  });
                }}
              >
                <div
                  className={cn(
                    "text-[11px] tracking-[0.14em] text-[var(--color-ink-muted)]",
                    col.dateKey === todayKey && "text-[var(--color-accent)]",
                  )}
                >
                  周{WEEKDAY_LABELS[col.weekday]}
                </div>
                <div
                  className={cn(
                    "font-display mt-0.5 text-lg font-medium leading-none tabular-nums",
                    col.dateKey === todayKey
                      ? "text-[var(--color-accent)]"
                      : "text-[var(--color-ink)]",
                  )}
                >
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
            {hours.map((h, i) => (
              <div
                key={`t-${i}-${h}`}
                className="absolute right-1.5 font-mono text-[10px] leading-none tabular-nums text-[var(--color-ink-muted)]"
                style={{ top: i === 0 ? 4 : i * DAY_PX - 7 }}
              >
                {h < gridStartHour ? (
                  <span title="次日">{String(h).padStart(2, "0")}</span>
                ) : (
                  String(h).padStart(2, "0")
                )}
              </div>
            ))}
          </div>

          {shown.map((col) => {
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
                {hours.map((h, i) => (
                  <div
                    key={`line-${col.dateKey}-${i}-${h}`}
                    className="pointer-events-none absolute inset-x-0 border-t border-[var(--color-line)]/70"
                    style={{ top: i * DAY_PX }}
                  />
                ))}
                {hours.map((h, i) => (
                  <div
                    key={`half-${col.dateKey}-${i}-${h}`}
                    className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--color-line)]/40"
                    style={{ top: i * DAY_PX + DAY_PX / 2 }}
                  />
                ))}

                {(() => {
                  const placed = dayItems
                    .map((item) => {
                      const segment = itemSegmentOnDate(
                        item,
                        col.dateKey,
                        col.weekday,
                      );
                      if (!segment) return null;
                      let start = clockToCycleMinutes(
                        segment.start,
                        gridStartHour,
                      );
                      let end = clockToCycleMinutes(
                        segment.end,
                        gridStartHour,
                      );
                      // 跨周期边界（极少）：钳到日内
                      if (end <= start) {
                        if (segment.end === "24:00" || segment.end === "00:00") {
                          end = Math.min(CYCLE_MINUTES, start + 40);
                        } else {
                          return null;
                        }
                      }
                      const top = (start / 60) * DAY_PX;
                      const height = Math.max(
                        10,
                        ((end - start) / 60) * DAY_PX - 1,
                      );
                      return { item, segment, start, end, top, height };
                    })
                    .filter(
                      (x): x is NonNullable<typeof x> => x != null,
                    );
                  const layout = computeOverlapLayout(
                    placed.map((p) => ({
                      id: p.item.id,
                      start: p.start,
                      end: p.end,
                    })),
                  );
                  return placed.map(({ item, segment, top, height }) => {
                    const once = itemRecurrence(item) === "once";
                    const courseSwap = !!item.isCourseSwap;
                    const subline = formatItemSubline(item);
                    const overnight =
                      segment.end === "24:00" || segment.start === "00:00";
                    // 短块优先标题；完整信息靠 hover
                    const showSub = height >= 28;
                    const showNote = !!item.note?.trim() && height >= 52;
                    const showOvernight = overnight && height >= 40 && !showNote;
                    const color = ownerColor(item, couple);
                    const slot = layout.get(item.id) ?? {
                      column: 0,
                      columnCount: 1,
                    };
                    const widthPct = 100 / slot.columnCount;
                    const z = 10 + slot.column;
                    return (
                      <button
                        key={`${item.id}-${col.dateKey}`}
                        type="button"
                        title={itemHoverText(item)}
                        className={cn(
                          "group absolute overflow-hidden rounded-md border text-left transition-[transform,filter] duration-150 hover:z-20 hover:brightness-[0.98]",
                          height < 22 ? "px-1 py-0" : "px-1.5 py-0.5",
                          (once || courseSwap) && "border-dashed",
                          selectedIds?.has(item.id) &&
                            "ring-2 ring-[var(--color-ink)] ring-offset-1",
                        )}
                        style={{
                          top,
                          height,
                          left: `calc(${slot.column * widthPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          right: "auto",
                          zIndex: z,
                          ...ownerSurfaceStyle(color),
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (suppressClick.current) {
                            suppressClick.current = false;
                            return;
                          }
                          if (e.shiftKey && onToggleSelect) {
                            onToggleSelect(item.id);
                            return;
                          }
                          onEditItem(item, col.dateKey);
                        }}
                        onPointerDown={(e) => {
                          if (e.pointerType === "mouse" && e.button !== 0) return;
                          const el = e.currentTarget;
                          clearPress();
                          pressTimer.current = window.setTimeout(() => {
                            suppressClick.current = true;
                            const rect = el.getBoundingClientRect();
                            const pos = placeMenu(rect.left + 8, rect.bottom);
                            setMenu({
                              kind: "item",
                              item,
                              dateKey: col.dateKey,
                              ...pos,
                            });
                          }, 480);
                        }}
                        onPointerUp={clearPress}
                        onPointerCancel={clearPress}
                        onPointerLeave={clearPress}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          clearPress();
                          const pos = placeMenu(e.clientX, e.clientY);
                          setMenu({
                            kind: "item",
                            item,
                            dateKey: col.dateKey,
                            ...pos,
                          });
                        }}
                      >
                        <div className="h-full overflow-hidden">
                          <p
                            className={cn(
                              "flex items-center gap-0.5 truncate font-semibold leading-tight",
                              height < 18 ? "text-[10px]" : "text-xs",
                            )}
                          >
                            {courseSwap || once ? (
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                                title={courseSwap ? "换课" : "仅一次"}
                                aria-label={courseSwap ? "换课" : "仅一次"}
                              />
                            ) : null}
                            <span className="truncate">
                              {itemDisplayTitle(item)}
                            </span>
                          </p>
                          {showSub ? (
                            subline ? (
                              <p className="truncate text-[10px] leading-tight opacity-80">
                                {subline}
                              </p>
                            ) : (
                              <p className="truncate font-mono text-[10px] leading-tight opacity-70">
                                {item.start}–{item.end}
                              </p>
                            )
                          ) : null}
                          {showNote ? (
                            <p className="truncate text-[10px] leading-tight opacity-70">
                              {item.note?.trim()}
                            </p>
                          ) : null}
                          {showOvernight ? (
                            <p className="truncate text-[9px] leading-tight opacity-55">
                              跨日
                            </p>
                          ) : null}
                        </div>
                      </button>
                    );
                  });
                })()}

                {col.dateKey === todayKey && nowLineTop != null ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-30"
                    style={{ top: nowLineTop }}
                  >
                    <div className="now-line relative" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {menu ? (
        <div
          className="fixed z-50 min-w-[148px] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] py-1 shadow-[0_16px_40px_-24px_rgba(28,22,18,0.6)]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.kind === "item" ? (
            <>
              {menu.item.note?.trim() ? (
                <p className="border-b border-[var(--color-line)] px-3 py-2 text-xs leading-snug text-[var(--color-ink-muted)]">
                  {menu.item.note.trim()}
                </p>
              ) : null}
              <button
                type="button"
                className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)]"
                onClick={() => {
                  onEditItem(menu.item, menu.dateKey);
                  setMenu(null);
                }}
              >
                编辑
              </button>
              {onToggleSelect ? (
                <button
                  type="button"
                  className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)]"
                  onClick={() => {
                    onToggleSelect(menu.item.id);
                    setMenu(null);
                  }}
                >
                  {selectedIds?.has(menu.item.id) ? "取消选择" : "选择"}
                </button>
              ) : null}
              {itemRecurrence(menu.item) === "weekly" &&
              !menu.item.isCourseSwap ? (
                <button
                  type="button"
                  className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)]"
                  onClick={() => {
                    onSkipOccurrence(menu.item, menu.dateKey);
                    setMenu(null);
                  }}
                >
                  取消本次
                </button>
              ) : null}
              <button
                type="button"
                className="block min-h-11 w-full px-3 py-2 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-accent-soft)]"
                onClick={() => {
                  onDeleteItem(menu.item);
                  setMenu(null);
                }}
              >
                删除
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)]"
                onClick={() => {
                  onSetDayOverride(menu.dateKey, "off");
                  setMenu(null);
                }}
              >
                设为放假
              </button>
              <button
                type="button"
                className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)]"
                onClick={() => {
                  onSetDayOverride(menu.dateKey, "work");
                  setMenu(null);
                }}
              >
                设为上班
              </button>
              <button
                type="button"
                className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)]"
                onClick={() => {
                  onSetDayOverride(menu.dateKey, null);
                  setMenu(null);
                }}
              >
                恢复默认
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
