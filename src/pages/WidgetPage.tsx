import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { GripHorizontal } from "lucide-react";
import {
  WEEKDAY_LABELS,
  formatDateKey,
  formatDurationCompact,
  formatDurationZh,
  formatTagLabel,
  getCurrentItem,
  getUpcomingItem,
  isItemNow,
  isPaired,
  itemDisplayTitle,
  itemRecurrence,
  itemTag,
  msUntilDate,
  msUntilTime,
  ownerColor,
  partnerFacingName,
  progressThroughItem,
  todaysItems,
  type CoupleIdentity,
  type ScheduleItem,
  type UpcomingRef,
} from "@/lib/config";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getTodayLabel } from "@/lib/holidays";
import { startReminderLoop } from "@/lib/reminders";
import {
  TAG_WIDGET,
  formatItemSubline,
} from "@/lib/schedule-style";
import { AddressLine } from "@/components/AddressLine";
import { CoexistenceBar } from "@/components/CoexistenceBar";
import { lanePartnerItems, laneSelfItems } from "@/lib/sync/couple";
import {
  applyWidgetOpacity,
  persistCurrentWidgetGeometry,
  restoreWidgetGeometry,
} from "@/lib/widget-chrome";
import {
  startCoupleSyncLoop,
  subscribeConfigChanges,
  useConfigStore,
} from "@/store/config-store";
import { cn } from "@/lib/utils";

function FullModeItemCard({
  item,
  current,
  badge,
  accent,
}: {
  item: ScheduleItem;
  current: boolean;
  badge?: string;
  accent?: string;
}) {
  const once = itemRecurrence(item) === "once";
  const courseSwap = !!item.isCourseSwap;
  const tag = itemTag(item);
  const style = TAG_WIDGET[tag];
  const subline = formatItemSubline(item);
  const line = accent || style.accent;
  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-2.5",
        style.card,
        current && "widget-now-surface ring-1 ring-white/30",
        (once || courseSwap) && "border-dashed",
      )}
      style={{
        boxShadow: `inset 3px 0 0 ${current ? line : `${line}66`}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="tabular font-mono text-xs text-white/65">
          {item.start}–{item.end}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              style.badge,
            )}
          >
            {formatTagLabel(tag)}
          </span>
          {courseSwap ? (
            <span className="text-[10px] text-amber-200/80">换课</span>
          ) : once ? (
            <span className="text-[10px] text-amber-200/80">仅一次</span>
          ) : null}
          {badge ? (
            <span className="text-[10px] tracking-wide text-white/75">
              {badge}
            </span>
          ) : null}
        </div>
      </div>
      <p className="font-display mt-1 text-[15px] leading-snug">
        {itemDisplayTitle(item)}
      </p>
      {subline ? (
        <p className="mt-0.5 text-xs font-medium text-white/80">{subline}</p>
      ) : null}
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

function PersonColumn({
  name,
  color,
  currentItem,
  upcoming,
  remainingCurrent,
  untilNext,
  progress,
  todayKey,
  emptyHint,
}: {
  name: string;
  color: string;
  currentItem: ScheduleItem | null;
  upcoming: UpcomingRef | null;
  remainingCurrent: number | null;
  untilNext: number | null;
  progress: number;
  todayKey: string;
  emptyHint?: string;
}) {
  const subline = currentItem ? formatItemSubline(currentItem) : null;
  const nextSubline = upcoming ? formatItemSubline(upcoming.item) : null;
  const tagStyle = currentItem ? TAG_WIDGET[itemTag(currentItem)] : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1.5 px-0.5">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="truncate text-[11px] font-medium text-white/70">
          {name}
        </span>
      </div>

      {currentItem && tagStyle ? (
        <div
          className={cn(
            "widget-now-surface relative overflow-hidden rounded-2xl border px-2.5 py-3 text-white",
            tagStyle.card,
          )}
          style={{ boxShadow: `inset 3px 0 0 ${color}` }}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.16em] text-white/85">
              NOW
            </span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                tagStyle.badge,
              )}
            >
              {formatTagLabel(itemTag(currentItem))}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-white/70">
              {remainingCurrent != null && remainingCurrent > 0
                ? `剩 ${formatDurationCompact(remainingCurrent)}`
                : "进行中"}
            </span>
          </div>
          <p className="font-display mt-1.5 text-[17px] font-medium leading-snug tracking-tight">
            {itemDisplayTitle(currentItem)}
          </p>
          {subline ? (
            <p className="mt-0.5 text-[11px] font-medium text-white/75">
              {subline}
            </p>
          ) : null}
          <p className="mt-1 font-mono text-[10px] tabular-nums text-white/60">
            {currentItem.start}–{currentItem.end}
          </p>
          <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white/75"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-2.5 py-3">
          <span className="text-[9px] font-semibold tracking-[0.18em] text-white/38">
            FREE
          </span>
          <p className="font-display mt-1 text-base text-white/70">空闲中</p>
          {emptyHint ? (
            <p className="mt-1 text-[10px] text-white/30">{emptyHint}</p>
          ) : null}
        </div>
      )}

      {upcoming && untilNext != null ? (
        <div className="rounded-xl bg-white/[0.04] px-2 py-1.5">
          <p className="truncate text-[10px] text-white/35">
            <span className="font-semibold tracking-wider text-white/25">
              NEXT{" "}
            </span>
            <span className="font-mono text-white/40">
              {upcomingLabel(upcoming, todayKey)}
            </span>{" "}
            {itemDisplayTitle(upcoming.item)}
            {nextSubline ? ` · ${nextSubline}` : ""}
          </p>
        </div>
      ) : (
        <p className="px-1 text-[10px] text-white/22">暂无下一程</p>
      )}
    </div>
  );
}

function DualFocusWidget({
  couple,
  soloMode,
  selfCurrent,
  selfUpcoming,
  partnerCurrent,
  partnerUpcoming,
  selfRemaining,
  selfUntilNext,
  partnerRemaining,
  partnerUntilNext,
  selfProgress,
  partnerProgress,
  todayKey,
  holidayName,
}: {
  couple: CoupleIdentity;
  soloMode: boolean;
  selfCurrent: ScheduleItem | null;
  selfUpcoming: UpcomingRef | null;
  partnerCurrent: ScheduleItem | null;
  partnerUpcoming: UpcomingRef | null;
  selfRemaining: number | null;
  selfUntilNext: number | null;
  partnerRemaining: number | null;
  partnerUntilNext: number | null;
  selfProgress: number;
  partnerProgress: number;
  todayKey: string;
  holidayName?: string;
}) {
  const showPartner = !soloMode;

  return (
    <div className="h-full p-1">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[26px] border border-white/[0.1] bg-[rgba(22,16,14,0.78)] text-white shadow-[0_22px_50px_rgba(20,10,8,0.48)] backdrop-blur-xl">
        <div
          data-tauri-drag-region
          className="absolute inset-x-0 top-0 z-10 flex h-6 cursor-grab items-center justify-center active:cursor-grabbing"
        >
          <div
            data-tauri-drag-region
            className="h-1 w-8 rounded-full bg-white/20"
          />
        </div>

        <div className="flex flex-1 gap-2 px-2.5 pb-2 pt-7">
          <PersonColumn
            name={soloMode ? "今日" : couple.selfName}
            color={couple.selfColor}
            currentItem={selfCurrent}
            upcoming={selfUpcoming}
            remainingCurrent={selfRemaining}
            untilNext={selfUntilNext}
            progress={selfProgress}
            todayKey={todayKey}
          />
          {showPartner ? (
            <>
              <div className="w-px shrink-0 bg-white/10" />
              <PersonColumn
                name={partnerFacingName(couple)}
                color={couple.partnerColor}
                currentItem={partnerCurrent}
                upcoming={partnerUpcoming}
                remainingCurrent={partnerRemaining}
                untilNext={partnerUntilNext}
                progress={partnerProgress}
                todayKey={todayKey}
              />
            </>
          ) : null}
        </div>

        <div className="flex flex-col gap-1 px-2.5 pb-2 pt-0.5">
          <AddressLine tone="glass" />
          <div className="flex min-h-8 items-center justify-center">
            <CoexistenceBar compact />
          </div>
        </div>

        {holidayName ? (
          <p className="px-3 pb-2 text-center text-[10px] text-amber-200/40">
            {holidayName}
          </p>
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
    return startCoupleSyncLoop(() => useConfigStore.getState().config);
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
  const couple = config.couple;
  const paired = isPaired(couple);
  const soloMode = config.soloMode;

  const mine = useMemo(() => laneSelfItems(config.items), [config.items]);
  const theirs = useMemo(
    () => (soloMode ? [] : lanePartnerItems(config.items)),
    [config.items, soloMode],
  );

  const selfCurrent = useMemo(
    () => getCurrentItem(mine, now, overrides),
    [mine, now, overrides],
  );
  const selfUpcoming = useMemo(
    () => getUpcomingItem(mine, now, 7, overrides),
    [mine, now, overrides],
  );
  const partnerCurrent = useMemo(
    () => getCurrentItem(theirs, now, overrides),
    [theirs, now, overrides],
  );
  const partnerUpcoming = useMemo(
    () => getUpcomingItem(theirs, now, 7, overrides),
    [theirs, now, overrides],
  );

  const items = useMemo(
    () =>
      todaysItems(
        soloMode ? laneSelfItems(config.items) : config.items,
        now,
        overrides,
      ),
    [config.items, now, overrides, soloMode],
  );
  const holiday = useMemo(
    () => getTodayLabel(now, overrides),
    [now, overrides],
  );
  const dateText = format(now, "M月d日 EEEE", { locale: zhCN });
  const focusMode = config.widgetMode === "current";

  const selfRemaining =
    selfCurrent != null ? msUntilTime(selfCurrent.end, now) : null;
  const selfUntilNext =
    selfUpcoming != null ? msUntilDate(selfUpcoming.at, now) : null;
  const partnerRemaining =
    partnerCurrent != null ? msUntilTime(partnerCurrent.end, now) : null;
  const partnerUntilNext =
    partnerUpcoming != null ? msUntilDate(partnerUpcoming.at, now) : null;
  const selfProgress = selfCurrent
    ? progressThroughItem(selfCurrent, now)
    : 0;
  const partnerProgress = partnerCurrent
    ? progressThroughItem(partnerCurrent, now)
    : 0;

  if (!hydrated || loading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="w-full rounded-[26px] bg-[rgba(22,16,14,0.88)] px-4 py-6 text-center font-display text-base text-white/80">
          加载中…
        </div>
      </div>
    );
  }

  if (focusMode) {
    return (
      <DualFocusWidget
        couple={couple}
        soloMode={soloMode}
        selfCurrent={selfCurrent}
        selfUpcoming={selfUpcoming}
        partnerCurrent={partnerCurrent}
        partnerUpcoming={partnerUpcoming}
        selfRemaining={selfRemaining}
        selfUntilNext={selfUntilNext}
        partnerRemaining={partnerRemaining}
        partnerUntilNext={partnerUntilNext}
        selfProgress={selfProgress}
        partnerProgress={partnerProgress}
        todayKey={todayKey}
        holidayName={
          config.showHolidays && holiday.kind !== "none"
            ? holiday.name
            : undefined
        }
      />
    );
  }

  return (
    <div className="h-full p-2">
      <div className="flex h-full flex-col overflow-hidden rounded-[26px] border border-white/12 bg-[linear-gradient(168deg,rgba(28,20,16,0.94),rgba(18,14,12,0.9))] text-white shadow-[0_22px_48px_rgba(20,10,8,0.4)] backdrop-blur-md">
        <div
          data-tauri-drag-region
          className="flex cursor-grab items-center gap-2 border-b border-white/10 px-3 py-2 active:cursor-grabbing"
        >
          <GripHorizontal
            className="h-4 w-4 text-white/55"
            data-tauri-drag-region
          />
          <div data-tauri-drag-region className="min-w-0 flex-1">
            <p data-tauri-drag-region className="truncate text-xs text-white/60">
              {soloMode
                ? "今日安排"
                : paired
                  ? `${couple.selfName} · ${partnerFacingName(couple)}`
                  : "今日安排"}
            </p>
            <p data-tauri-drag-region className="truncate text-sm font-medium">
              {dateText}
            </p>
          </div>
        </div>

        {config.showHolidays && holiday.kind !== "none" ? (
          <div className="border-b border-white/10 bg-[#c47a32]/18 px-3 py-2 text-xs tracking-wide text-[#f6e6d0]">
            {holiday.name}
          </div>
        ) : null}

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/25 px-3 py-10 text-center">
              <p className="font-display text-lg text-white/85">今天都空着</p>
            </div>
          ) : (
            items.map((item) => {
              const current = isItemNow(item, now, overrides);
              const accent = ownerColor(item, couple);
              return (
                <FullModeItemCard
                  key={item.id}
                  item={item}
                  current={current}
                  accent={accent}
                  badge={
                    current
                      ? selfRemaining != null && selfRemaining > 0
                        ? `剩余 ${formatDurationZh(selfRemaining)}`
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
