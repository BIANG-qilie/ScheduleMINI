import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  WEEKDAY_LABELS,
  clockToCycleMinutes,
  columnCycleRanges,
  compareTime,
  computeOverlapLayout,
  DAY_MIN_CARD_PX,
  formatDateKey,
  formatItemSpan,
  formatLowerBandHour,
  formatWeekRangeLabel,
  getCurrentWeekColumns,
  getWeekAnchor,
  gridDayHours,
  gridViewSpanHours,
  parseDateKey,
  itemAbsoluteInterval,
  itemDisplayTitle,
  isOverlapBand,
  itemRecurrence,
  itemSpanMinutes,
  itemTag,
  shiftDateKey,
  ownerColor,
  ownerLabel,
  WEEK_MIN_CARD_PX,
  type CoupleIdentity,
  type DayOverride,
  type ScheduleItem,
} from "@/lib/config";
import { onHolidayData, resolveDayState, type DayLabel } from "@/lib/holidays";
import {
  TAG_BAR,
  formatItemSubline,
  isCallItem,
  itemHoverText,
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

function columnOn(dateKey: string): {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  dateKey: string;
  monthDay: string;
} {
  const date = parseDateKey(dateKey);
  return {
    weekday: date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    dateKey,
    monthDay: `${date.getMonth() + 1}/${date.getDate()}`,
  };
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
    }
  | {
      kind: "overflow";
      dateKey: string;
      entries: { item: ScheduleItem; time: string }[];
      x: number;
      y: number;
    };

function slotFrame(slot: { column: number; span: number; columnCount: number }) {
  const count = Math.max(1, slot.columnCount);
  const left = (slot.column / count) * 100;
  const width = (slot.span / count) * 100;
  return {
    left: `calc(${left}% + 2px)`,
    width: `calc(${width}% - 4px)`,
  };
}

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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const ignoreScrollSync = useRef(false);
  const prependAdjust = useRef(0);
  const touchY = useRef<number | null>(null);
  const [phoneSpan, setPhoneSpan] = useState({ before: 1, after: 8 });
  const [holidayTick, setHolidayTick] = useState(0);
  const [laneWidth, setLaneWidth] = useState(0);
  const laneObserver = useRef<ResizeObserver | null>(null);

  useEffect(() => onHolidayData(() => setHolidayTick((n) => n + 1)), []);

  const measureLane = (node: HTMLDivElement | null) => {
    laneObserver.current?.disconnect();
    laneObserver.current = null;
    if (!node) return;
    const update = () => {
      const next = node.clientWidth;
      setLaneWidth((prev) => (prev === next ? prev : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    laneObserver.current = observer;
  };

  useEffect(() => () => laneObserver.current?.disconnect(), []);

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
  const weekStartKey = columns[0]?.dateKey;
  const phoneDays = useMemo(() => {
    if (!weekStartKey) return [];
    const start = shiftDateKey(weekStartKey, -phoneSpan.before);
    const count = phoneSpan.before + columns.length + phoneSpan.after;
    return Array.from({ length: count }, (_, i) =>
      columnOn(shiftDateKey(start, i)),
    );
  }, [weekStartKey, columns.length, phoneSpan.before, phoneSpan.after]);
  const focusCol =
    (dayLayout ? phoneDays : columns).find((col) => col.dateKey === focusKey) ??
    columns.find((col) => col.dateKey === todayKey) ??
    columns[0];
  const shown = dayLayout ? [] : columns;

  useEffect(() => {
    if (!dayLayout) return;
    if (phoneDays.some((col) => col.dateKey === focusKey)) return;
    const today = columns.find((col) => col.dateKey === todayKey);
    setFocusKey((today ?? columns[0])?.dateKey ?? null);
  }, [columns, dayLayout, focusKey, phoneDays, todayKey]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const extra = prependAdjust.current;
    if (!dayLayout || !el || !extra) return;
    prependAdjust.current = 0;
    // 顶上再往上：停在前一天的末尾，凌晨尾巴还在，不跳过
    el.scrollTop = Math.max(0, extra - 80);
  }, [dayLayout, phoneSpan.before]);

  useLayoutEffect(() => {
    if (!dayLayout) return;
    if (ignoreScrollSync.current) {
      ignoreScrollSync.current = false;
      return;
    }
    const el = scrollerRef.current;
    const section = el?.querySelector<HTMLElement>(
      `[data-day="${focusKey}"]`,
    );
    if (!el || !section) return;
    const delta =
      section.getBoundingClientRect().top - el.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) return;
    el.scrollTop += delta;
  }, [dayLayout, focusKey]);

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

  const nowLineTopFor = (columnDateKey: string) => {
    if (!isCurrentWeek) return null;
    const hour = now.getHours();
    const hhmm = `${String(hour).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const today = formatDateKey(now);
    // 起点之前的钟点画在前一日列的下半段（那里才是今天凌晨）
    const ownerKey = hour < gridStartHour ? shiftDateKey(today, -1) : today;
    if (columnDateKey !== ownerKey) return null;
    const offset = clockToCycleMinutes(hhmm, gridStartHour);
    if (offset < 0 || offset > CYCLE_MINUTES) return null;
    return (offset / 60) * DAY_PX;
  };

  const enabledItems = useMemo(
    () => items.filter((it) => it.enabled).sort((a, b) => compareTime(a.start, b.start)),
    [items],
  );

  const dayLabels = useMemo(() => {
    const map = new Map<string, DayLabel>();
    const cols = dayLayout ? phoneDays : columns;
    for (const col of cols) {
      map.set(col.dateKey, resolveDayState(col.dateKey, dayOverrides));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, dayLayout, phoneDays, dayOverrides, holidayTick]);

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

  const syncPhoneDay = () => {
    const el = scrollerRef.current;
    if (!dayLayout || !el) return;
    const edge = el.getBoundingClientRect().top + 1;
    const sections = [...el.querySelectorAll<HTMLElement>("[data-day]")];
    let current = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= edge + 8) current = section;
      else break;
    }
    const key = current?.dataset.day;
    if (key && key !== focusKey) {
      ignoreScrollSync.current = true;
      setFocusKey(key);
    }
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setPhoneSpan((span) =>
        span.after >= 21 ? span : { ...span, after: span.after + 1 },
      );
    }
  };

  const extendPhoneUp = () => {
    const el = scrollerRef.current;
    if (!dayLayout || !el || el.scrollTop > 1) return;
    if (phoneSpan.before >= 21) return;
    const first = el.querySelector<HTMLElement>("[data-day]");
    prependAdjust.current = first?.offsetHeight ?? totalHeight;
    setPhoneSpan((span) => ({ ...span, before: span.before + 1 }));
  };

  const renderLane = (col: (typeof columns)[number], index: number) => {

            const label = dayLabels.get(col.dateKey);
            const dayItems: {
              item: ScheduleItem;
              startMin: number;
              endMin: number;
              overnight: boolean;
              spanned: boolean;
            }[] = [];
            for (const it of enabledItems) {
              const spanned = itemAbsoluteInterval(it) != null;
              for (const range of columnCycleRanges(
                it,
                col.dateKey,
                col.weekday,
                dayOverrides,
                gridStartHour,
              )) {
                dayItems.push({ item: it, ...range, spanned });
              }
            }
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
                ref={index === 0 ? measureLane : undefined}
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

                {hours.indexOf(0) > 0 ? (
                  <div
                    className="pointer-events-none absolute right-1 z-30 -translate-y-1/2 rounded bg-[var(--color-surface)]/95 px-1 font-mono text-[10px] tabular-nums text-[var(--color-ink-muted)]"
                    style={{ top: hours.indexOf(0) * DAY_PX }}
                  >
                    {formatLowerBandHour(0, col.dateKey)}
                  </div>
                ) : null}

                {(() => {
                  const placed = dayItems
                    .filter((entry) => entry.endMin > entry.startMin)
                    .map((entry) => {
                      const top = (entry.startMin / 60) * DAY_PX;
                      const height = Math.max(
                        10,
                        ((entry.endMin - entry.startMin) / 60) * DAY_PX - 1,
                      );
                      return { ...entry, top, height };
                    });
                  const byId = new Map(
                    placed.map((entry) => [
                      `${entry.item.id}@${entry.startMin}`,
                      entry,
                    ]),
                  );
                  const minCardWidth = dayLayout ? DAY_MIN_CARD_PX : WEEK_MIN_CARD_PX;
                  const layout = computeOverlapLayout(
                    placed.map((entry) => ({
                      id: `${entry.item.id}@${entry.startMin}`,
                      start: entry.startMin,
                      end: entry.endMin,
                      band: isOverlapBand({
                        startMin: entry.startMin,
                        endMin: entry.endMin,
                        durationMin: itemSpanMinutes(entry.item),
                        overnight: entry.overnight,
                        spanned: entry.spanned,
                        call: isCallItem(entry.item),
                      }),
                    })),
                    laneWidth > 0
                      ? { laneWidth, minCardWidth }
                      : undefined,
                  );
                  const bindItem = (item: ScheduleItem) => ({
                    onClick: (e: MouseEvent<HTMLButtonElement>) => {
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
                    },
                    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
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
                    },
                    onPointerUp: clearPress,
                    onPointerCancel: clearPress,
                    onPointerLeave: clearPress,
                    onContextMenu: (e: MouseEvent<HTMLButtonElement>) => {
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
                    },
                  });
                  const nodes: ReactNode[] = [];
                  for (const id of layout.bands) {
                    const entry = byId.get(id);
                    if (!entry) continue;
                    const { item, startMin, top } = entry;
                    const height = Math.max(
                      10,
                      ((entry.endMin - entry.startMin) / 60) * DAY_PX,
                    );
                    const once = itemRecurrence(item) === "once";
                    const courseSwap = !!item.isCourseSwap;
                    const color = ownerColor(item, couple);
                    nodes.push(
                      <button
                        key={`band-${item.id}-${col.dateKey}-${startMin}`}
                        type="button"
                        data-block="band"
                        data-item-id={item.id}
                        title={itemHoverText(item)}
                        className={cn(
                          "absolute z-[1] overflow-hidden rounded-md border border-[var(--color-line)]/80 text-left text-[var(--color-ink-muted)]",
                          (once || courseSwap) && "border-dashed border-[#d7b15a]",
                          selectedIds?.has(item.id) &&
                            "ring-2 ring-[var(--color-ink)] ring-offset-1",
                        )}
                        style={{
                          top,
                          height,
                          left: 2,
                          right: 2,
                          backgroundColor:
                            "color-mix(in oklab, var(--color-ink) 4%, var(--color-surface))",
                          boxShadow: `inset 3px 0 0 ${TAG_BAR[itemTag(item)]}`,
                        }}
                        {...bindItem(item)}
                      >
                        <span className="flex items-center gap-1 truncate px-1.5 py-0.5 text-[11px] font-medium leading-tight">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                            title={ownerLabel(item, couple)}
                            aria-label={ownerLabel(item, couple)}
                          />
                          <span className="truncate">{itemDisplayTitle(item)}</span>
                        </span>
                      </button>,
                    );
                  }
                  for (const [id, slot] of layout.cards) {
                    const entry = byId.get(id);
                    if (!entry) continue;
                    const { item, startMin, overnight, spanned, top, height } = entry;
                    const once = itemRecurrence(item) === "once";
                    const courseSwap = !!item.isCourseSwap;
                    const subline = formatItemSubline(item);
                    const note = item.note?.trim() ?? "";
                    const showNote =
                      !!note && (dayLayout ? height >= 44 : height >= 52);
                    const showSub =
                      height >= 28 && !(dayLayout && showNote && height < 68);
                    const showOvernight = overnight && height >= 40 && !showNote;
                    const color = ownerColor(item, couple);
                    nodes.push(
                      <button
                        key={`${item.id}-${col.dateKey}-${startMin}`}
                        type="button"
                        data-block="card"
                        data-item-id={item.id}
                        title={itemHoverText(item)}
                        className={cn(
                          "group absolute overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-0.5 text-left text-[var(--color-ink)] transition-[transform,filter] duration-150 hover:z-30 hover:brightness-[0.98]",
                          (once || courseSwap) && "border-dashed border-[#d7b15a]",
                          selectedIds?.has(item.id) &&
                            "ring-2 ring-[var(--color-ink)] ring-offset-1",
                        )}
                        style={{
                          top,
                          height,
                          ...slotFrame(slot),
                          zIndex: 10 + slot.column,
                          boxShadow: `inset 3px 0 0 ${TAG_BAR[itemTag(item)]}`,
                        }}
                        {...bindItem(item)}
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
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: color }}
                              title={ownerLabel(item, couple)}
                              aria-label={ownerLabel(item, couple)}
                            />
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
                                {spanned ? formatItemSpan(item) : `${item.start}–${item.end}`}
                              </p>
                            )
                          ) : null}
                          {spanned && subline && height >= 36 ? (
                            <p className="truncate font-mono text-[10px] leading-tight opacity-70">
                              {formatItemSpan(item)}
                            </p>
                          ) : null}
                          {showNote ? (
                            <p
                              className={cn(
                                "text-[10px] leading-tight opacity-70",
                                dayLayout
                                  ? "line-clamp-2 whitespace-normal break-words"
                                  : "truncate",
                              )}
                            >
                              {note}
                            </p>
                          ) : null}
                          {showOvernight ? (
                            <p className="truncate text-[9px] leading-tight opacity-55">
                              跨日
                            </p>
                          ) : null}
                        </div>
                      </button>,
                    );
                  }
                  for (const pill of layout.pills) {
                    const hidden = pill.hiddenIds
                      .map((id) => byId.get(id))
                      .filter((entry): entry is NonNullable<typeof entry> => !!entry);
                    const top = (pill.start / 60) * DAY_PX;
                    nodes.push(
                      <button
                        key={`pill-${col.dateKey}-${pill.id}`}
                        type="button"
                        data-block="pill"
                        aria-label={`还有 ${hidden.length} 项`}
                        className="absolute z-20 flex items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 text-[10px] font-semibold tabular-nums text-[var(--color-ink)] shadow-[0_6px_16px_-10px_rgba(28,22,18,0.7)]"
                        style={{
                          top,
                          height: 22,
                          ...slotFrame(pill),
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pos = placeMenu(rect.left, rect.bottom + 4);
                          setMenu({
                            kind: "overflow",
                            dateKey: col.dateKey,
                            entries: hidden.map((entry) => ({
                              item: entry.item,
                              time: entry.spanned
                                ? formatItemSpan(entry.item)
                                : `${entry.item.start}–${entry.item.end}`,
                            })),
                            ...pos,
                          });
                        }}
                      >
                        +{hidden.length}
                      </button>,
                    );
                  }
                  return nodes;
                })()}

                {(() => {
                  const nowLineTop = nowLineTopFor(col.dateKey);
                  if (nowLineTop == null) return null;
                  return (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-30"
                      style={{ top: nowLineTop }}
                    >
                      <div className="now-line relative" />
                    </div>
                  );
                })()}
              </div>
            );
  };


  return (
    <div
      className={cn(
        "paper-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl",
        dayLayout && "phone-week",
      )}
      onClick={() => setMenu(null)}
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
                  ignoreScrollSync.current = false;
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
        ref={scrollerRef}
        data-week-scroll=""
        className="min-h-0 flex-1 overflow-auto"
        style={{ maxHeight: viewHeight + 8 }}
        onScroll={() => {
          if (dayLayout) syncPhoneDay();
        }}
        onWheel={(e) => {
          if (!dayLayout || e.deltaY >= 0) return;
          const el = scrollerRef.current;
          if (el && el.scrollTop <= 1) extendPhoneUp();
        }}
        onTouchStart={(e) => {
          touchY.current = e.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(e) => {
          if (!dayLayout) return;
          const y = e.touches[0]?.clientY;
          if (y == null || touchY.current == null) return;
          const pullingDown = y - touchY.current > 0;
          touchY.current = y;
          if (pullingDown) extendPhoneUp();
        }}
      >
        {dayLayout
          ? phoneDays.map((col, index) => {
              const label = dayLabels.get(col.dateKey);
              const off = label?.isOff;
              return (
                <section key={col.dateKey} data-day={col.dateKey}>
                  <button
                    type="button"
                    data-day-header=""
                    data-date={col.dateKey}
                    className={cn(
                      "sticky top-0 z-20 w-full border-b border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-center",
                      col.dateKey === todayKey && "bg-[var(--color-accent-soft)]",
                      off &&
                        showHolidays &&
                        "bg-[color-mix(in_oklab,var(--color-warn)_8%,var(--color-surface))]",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      const pos = placeMenu(e.clientX, e.clientY);
                      setMenu({ kind: "day", dateKey: col.dateKey, ...pos });
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
                      >
                        {label.name}
                      </div>
                    ) : null}
                  </button>
                  <div
                    className="grid min-w-0"
                    style={{ gridTemplateColumns: "52px minmax(0, 1fr)" }}
                  >
                    <div className="relative" style={{ height: totalHeight }}>
                      {hours.map((h, i) => (
                        <div
                          key={`t-${col.dateKey}-${i}-${h}`}
                          className="absolute right-1 font-mono text-[10px] leading-none tabular-nums text-[var(--color-ink-muted)]"
                          style={{ top: i === 0 ? 4 : i * DAY_PX - 7 }}
                        >
                          {h < gridStartHour ? (
                            <span
                              className="block text-right leading-tight"
                              title={formatLowerBandHour(h, col.dateKey)}
                            >
                              {h === 0 ? (
                                <span className="block text-[9px]">
                                  {formatLowerBandHour(0, col.dateKey).split(" ")[0]}
                                </span>
                              ) : null}
                              <span className="block">
                                {String(h).padStart(2, "0")}:00
                              </span>
                            </span>
                          ) : (
                            String(h).padStart(2, "0")
                          )}
                        </div>
                      ))}
                    </div>
                    {renderLane(col, index)}
                  </div>
                </section>
              );
            })
          : null}
        <div
          className={cn(
            "grid",
            dayLayout ? "hidden" : "min-w-[720px]",
          )}
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
                  dayLayout && focusCol ? (
                    <span className="block text-right leading-tight" title={formatLowerBandHour(h, focusCol.dateKey)}>
                      {h === 0 ? (
                        <span className="block text-[9px]">
                          {formatLowerBandHour(0, focusCol.dateKey).split(" ")[0]}
                        </span>
                      ) : null}
                      <span className="block">{String(h).padStart(2, "0")}:00</span>
                    </span>
                  ) : (
                    <span className="block text-right leading-tight" title="次日">
                      {h === 0 ? <span className="block text-[9px]">次日</span> : null}
                      <span className="block">{String(h).padStart(2, "0")}</span>
                    </span>
                  )
                ) : (
                  String(h).padStart(2, "0")
                )}
              </div>
            ))}
          </div>

          {shown.map((col, index) => renderLane(col, index))}
        </div>
      </div>

      {menu ? (
        <div
          className="fixed z-50 min-w-[148px] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] py-1 shadow-[0_16px_40px_-24px_rgba(28,22,18,0.6)]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.kind === "overflow" ? (
            <div className="max-h-72 min-w-[220px] overflow-auto">
              <p className="border-b border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-ink-muted)]">
                这个时段还有 {menu.entries.length} 项
              </p>
              {menu.entries.map((entry) => {
                const color = ownerColor(entry.item, couple);
                return (
                  <button
                    key={entry.item.id}
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)]"
                    onClick={() => {
                      onEditItem(entry.item, menu.dateKey);
                      setMenu(null);
                    }}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                      aria-label={ownerLabel(entry.item, couple)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {itemDisplayTitle(entry.item)}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-[var(--color-ink-muted)]">
                        {entry.time}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : menu.kind === "item" ? (
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
