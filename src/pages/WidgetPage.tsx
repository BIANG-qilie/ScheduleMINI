import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { GripHorizontal } from "lucide-react";
import {
  WEEKDAY_LABELS,
  formatDateKey,
  formatDurationCompact,
  formatDurationZh,
  getCurrentItem,
  getUpcomingItem,
  isItemNow,
  itemRecurrence,
  msUntilDate,
  msUntilTime,
  progressThroughItem,
  todaysItems,
  type ScheduleItem,
  type UpcomingRef,
} from "@/lib/config";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getTodayLabel } from "@/lib/holidays";
import { startReminderLoop } from "@/lib/reminders";
import {
  applyWidgetOpacity,
  persistCurrentWidgetGeometry,
  restoreWidgetGeometry,
} from "@/lib/widget-chrome";
import { subscribeConfigChanges, useConfigStore } from "@/store/config-store";

function FullModeItemCard({
  item,
  current,
  badge,
}: {
  item: ScheduleItem;
  current: boolean;
  badge?: string;
}) {
  const once = itemRecurrence(item) === "once";
  return (
    <div
      className={
        current
          ? "rounded-xl border border-emerald-300/50 bg-emerald-400/20 px-3 py-2.5"
          : "rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            current
              ? "font-mono text-xs text-emerald-100"
              : "font-mono text-xs text-white/65"
          }
        >
          {item.start}–{item.end}
        </span>
        <div className="flex items-center gap-1.5">
          {once ? (
            <span className="text-[10px] text-amber-200/80">仅一次</span>
          ) : null}
          {badge ? (
            <span className="text-[10px] tracking-wide text-emerald-100">
              {badge}
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-sm font-medium leading-snug">{item.title}</p>
      {item.note ? (
        <p className="mt-0.5 text-xs text-white/55">{item.note}</p>
      ) : null}
    </div>
  );
}

function upcomingLabel(ref: UpcomingRef, todayKey: string) {
  if (ref.dateKey === todayKey) return ref.item.start;
  const d = ref.at.getDay();
  return `周${WEEKDAY_LABELS[d]} ${ref.item.start}`;
}

function FocusWidget({
  currentItem,
  upcoming,
  remainingCurrent,
  untilNext,
  progress,
  todayKey,
  holidayName,
}: {
  currentItem: ScheduleItem | null;
  upcoming: UpcomingRef | null;
  remainingCurrent: number | null;
  untilNext: number | null;
  progress: number;
  todayKey: string;
  holidayName?: string;
}) {
  const urgent =
    remainingCurrent != null &&
    remainingCurrent > 0 &&
    remainingCurrent < 5 * 60_000;
  const currentOnce =
    currentItem != null && itemRecurrence(currentItem) === "once";
  const nextOnce =
    upcoming != null && itemRecurrence(upcoming.item) === "once";

  return (
    <div className="h-full p-1">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-[rgba(8,14,16,0.72)] text-white shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />

        <div
          data-tauri-drag-region
          className="absolute inset-x-0 top-0 z-10 flex h-6 cursor-grab items-center justify-center active:cursor-grabbing"
        >
          <div
            data-tauri-drag-region
            className="h-1 w-8 rounded-full bg-white/20"
          />
        </div>

        <div className="flex flex-1 flex-col justify-center gap-3 px-3.5 pb-2 pt-6">
          {currentItem ? (
            <div
              className={
                urgent
                  ? "widget-now-surface relative overflow-hidden rounded-2xl bg-[linear-gradient(145deg,#f0b35a_0%,#e07a3a_55%,#c45a28_100%)] px-3.5 py-4 text-[#1a0f08] shadow-[0_10px_28px_rgba(224,122,58,0.35)]"
                  : "widget-now-surface relative overflow-hidden rounded-2xl bg-[linear-gradient(145deg,#2ae0b0_0%,#12a884_52%,#0c7a62_100%)] px-3.5 py-4 text-[#041510] shadow-[0_10px_28px_rgba(18,168,132,0.38)]"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-md bg-black/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-current/80">
                    NOW
                  </span>
                  {currentOnce ? (
                    <span className="rounded-md bg-black/10 px-1.5 py-0.5 text-[10px] font-medium text-current/70">
                      仅一次
                    </span>
                  ) : null}
                </div>
                <span className="font-mono text-[11px] font-semibold tabular-nums text-current/75">
                  {remainingCurrent != null && remainingCurrent > 0
                    ? `剩 ${formatDurationCompact(remainingCurrent)}`
                    : "进行中"}
                </span>
              </div>

              <p className="mt-2.5 font-[family-name:var(--font-display)] text-[1.7rem] leading-[1.15] font-semibold tracking-tight text-balance">
                {currentItem.title}
              </p>

              <p className="mt-1.5 font-mono text-[11px] tabular-nums text-current/55">
                {currentItem.start} – {currentItem.end}
              </p>

              <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/15">
                <div
                  className="h-full rounded-full bg-black/35 transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-5">
              <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-white/40">
                FREE
              </span>
              <p className="mt-2.5 font-[family-name:var(--font-display)] text-xl font-medium tracking-tight text-white/70">
                空闲中
              </p>
              {holidayName ? (
                <p className="mt-1 text-xs text-amber-200/50">{holidayName}</p>
              ) : null}
              {upcoming && untilNext != null ? (
                <p className="mt-1 text-xs text-white/35">
                  {formatDurationCompact(untilNext)}后进入下一程
                </p>
              ) : (
                <p className="mt-1 text-xs text-white/30">暂无后续安排</p>
              )}
            </div>
          )}
        </div>

        {upcoming && untilNext != null ? (
          <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2">
            <span className="shrink-0 text-[9px] font-semibold tracking-[0.16em] text-white/25">
              NEXT
            </span>
            <p className="min-w-0 flex-1 truncate text-[11px] text-white/32">
              <span className="font-mono tabular-nums text-white/38">
                {upcomingLabel(upcoming, todayKey)}
              </span>{" "}
              {upcoming.item.title}
              {nextOnce ? <span className="text-white/22"> · 仅一次</span> : null}
            </p>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/22">
              {formatDurationCompact(untilNext)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function WidgetPage() {
  const { config, loading, hydrated, init, setConfig } = useConfigStore();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!hydrated) return;
    return startReminderLoop(() => useConfigStore.getState().config);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    applyWidgetOpacity(config.widgetOpacity);
  }, [hydrated, config.widgetOpacity]);

  useEffect(() => {
    if (!hydrated) return;
    void restoreWidgetGeometry();
  }, [hydrated]);

  useEffect(() => {
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;
    let timer: number | undefined;

    const scheduleSave = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void persistCurrentWidgetGeometry();
      }, 400);
    };

    void (async () => {
      try {
        const win = getCurrentWindow();
        if (win.label !== "widget") return;
        unlistenMoved = await win.onMoved(() => scheduleSave());
        unlistenResized = await win.onResized(() => scheduleSave());
      } catch {
        // browser preview
      }
    })();

    return () => {
      window.clearTimeout(timer);
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void subscribeConfigChanges((next) => {
      void setConfig(next, false);
    }).then((fn) => {
      if (!active) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [setConfig]);

  const todayKey = formatDateKey(now);
  const overrides = config.dayOverrides;
  const items = useMemo(
    () => todaysItems(config.items, now, overrides),
    [config.items, now, overrides],
  );
  const currentItem = useMemo(
    () => getCurrentItem(config.items, now, overrides),
    [config.items, now, overrides],
  );
  const upcoming = useMemo(
    () => getUpcomingItem(config.items, now, 7, overrides),
    [config.items, now, overrides],
  );
  const holiday = useMemo(
    () => getTodayLabel(now, overrides),
    [now, overrides],
  );
  const dateText = format(now, "M月d日 EEEE", { locale: zhCN });
  const focusMode = config.widgetMode === "current";

  const remainingCurrent =
    currentItem != null ? msUntilTime(currentItem.end, now) : null;
  const untilNext = upcoming != null ? msUntilDate(upcoming.at, now) : null;
  const progress = currentItem ? progressThroughItem(currentItem, now) : 0;

  if (!hydrated || loading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="w-full rounded-2xl bg-[color-mix(in_oklab,#10231f_88%,black)] px-4 py-6 text-center text-sm text-white/80">
          加载中…
        </div>
      </div>
    );
  }

  if (focusMode) {
    return (
      <FocusWidget
        currentItem={currentItem}
        upcoming={upcoming}
        remainingCurrent={remainingCurrent}
        untilNext={untilNext}
        progress={progress}
        todayKey={todayKey}
        holidayName={
          config.showHolidays && holiday.kind !== "none" ? holiday.name : undefined
        }
      />
    );
  }

  return (
    <div className="h-full p-2">
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(165deg,rgba(16,35,31,0.92),rgba(20,48,42,0.88))] text-white shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-md">
        <div
          data-tauri-drag-region
          className="flex cursor-grab items-center gap-2 border-b border-white/10 px-3 py-2 active:cursor-grabbing"
        >
          <GripHorizontal className="h-4 w-4 text-white/55" data-tauri-drag-region />
          <div data-tauri-drag-region className="min-w-0 flex-1">
            <p data-tauri-drag-region className="truncate text-xs text-white/60">
              今日日程
            </p>
            <p data-tauri-drag-region className="truncate text-sm font-medium">
              {dateText}
            </p>
          </div>
        </div>

        {config.showHolidays && holiday.kind !== "none" ? (
          <div
            className={
              holiday.kind === "work-on-weekend"
                ? "border-b border-white/10 bg-amber-500/20 px-3 py-2 text-xs text-amber-100"
                : "border-b border-white/10 bg-emerald-400/15 px-3 py-2 text-xs text-emerald-100"
            }
          >
            {holiday.name}
          </div>
        ) : null}

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/35 px-3 py-8 text-center">
              <p className="text-sm font-medium text-white/90">今日暂无日程</p>
            </div>
          ) : (
            items.map((item) => {
              const current = isItemNow(item, now, overrides);
              return (
                <FullModeItemCard
                  key={item.id}
                  item={item}
                  current={current}
                  badge={
                    current
                      ? remainingCurrent != null && remainingCurrent > 0
                        ? `剩余 ${formatDurationZh(remainingCurrent)}`
                        : "进行中"
                      : undefined
                  }
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
