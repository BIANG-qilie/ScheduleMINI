import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  WEEKDAY_LABELS,
  formatDateKey,
  formatDurationCompact,
  getCurrentItem,
  getUpcomingItem,
  itemDisplayTitle,
  msUntilDate,
  msUntilTime,
  progressThroughItem,
  type CoupleIdentity,
  type ScheduleItem,
  type UpcomingRef,
} from "@/lib/config";
import { getTodayLabel } from "@/lib/holidays";
import { formatItemSubline } from "@/lib/schedule-style";
import { lanePartnerItems, laneSelfItems } from "@/lib/sync/couple";
import { useConfigStore } from "@/store/config-store";
import { CoexistenceBar } from "@/components/CoexistenceBar";
import { cn } from "@/lib/utils";

function upcomingWhen(ref: UpcomingRef, todayKey: string) {
  if (ref.dateKey === todayKey) return ref.item.start;
  return `周${WEEKDAY_LABELS[ref.at.getDay()]} ${ref.item.start}`;
}

function Lane({
  name,
  color,
  current,
  upcoming,
  remaining,
  untilNext,
  progress,
  todayKey,
}: {
  name: string;
  color: string;
  current: ScheduleItem | null;
  upcoming: UpcomingRef | null;
  remaining: number | null;
  untilNext: number | null;
  progress: number;
  todayKey: string;
}) {
  const subline = current ? formatItemSubline(current) : null;
  const nextSub = upcoming ? formatItemSubline(upcoming.item) : null;

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1.5 px-0.5">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <h2 className="truncate text-sm font-medium">{name}</h2>
      </div>

      {current ? (
        <div
          className="rounded-3xl px-3.5 py-3.5 text-[#1c1612]"
          style={{
            background: `linear-gradient(165deg, color-mix(in oklab, ${color} 55%, white), color-mix(in oklab, ${color} 78%, white))`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 35%, white)`,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold tracking-[0.16em]">
              现在
            </span>
            <span className="font-mono text-[11px] tabular-nums">
              {remaining != null && remaining > 0
                ? `剩 ${formatDurationCompact(remaining)}`
                : "进行中"}
            </span>
          </div>
          <p className="font-display mt-1.5 text-xl leading-snug">
            {itemDisplayTitle(current)}
          </p>
          {subline ? (
            <p className="mt-1 text-xs font-medium opacity-75">{subline}</p>
          ) : null}
          {current.note?.trim() ? (
            <p className="mt-1 text-xs leading-snug opacity-70">
              {current.note.trim()}
            </p>
          ) : null}
          <p className="mt-1.5 font-mono text-[11px] tabular-nums opacity-60">
            {current.start}–{current.end}
          </p>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-black/35"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-4">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-ink-muted)]">
            现在
          </p>
          <p className="font-display mt-1 text-lg">空闲</p>
        </div>
      )}

      {upcoming && untilNext != null ? (
        <div className="rounded-2xl bg-[var(--color-surface)] px-3 py-2.5">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-[var(--color-ink-muted)]">
            下一程
          </p>
          <p className="mt-1 text-sm leading-snug">
            <span className="font-mono text-xs tabular-nums text-[var(--color-ink-muted)]">
              {upcomingWhen(upcoming, todayKey)}
            </span>{" "}
            {itemDisplayTitle(upcoming.item)}
          </p>
          {nextSub ? (
            <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
              {nextSub}
            </p>
          ) : null}
          {upcoming.item.note?.trim() ? (
            <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
              {upcoming.item.note.trim()}
            </p>
          ) : null}
          <p className="mt-1 font-mono text-[10px] tabular-nums text-[var(--color-ink-muted)]">
            {formatDurationCompact(untilNext)}后
          </p>
        </div>
      ) : (
        <p className="px-1 text-xs text-[var(--color-ink-muted)]">没有下一程</p>
      )}
    </section>
  );
}

export function PhoneGlance({
  couple,
  soloMode,
  showHolidays,
}: {
  couple: CoupleIdentity;
  soloMode: boolean;
  showHolidays: boolean;
}) {
  const items = useConfigStore((s) => s.config.items);
  const dayOverrides = useConfigStore((s) => s.config.dayOverrides);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const todayKey = formatDateKey(now);
  const holiday = useMemo(
    () => getTodayLabel(now, dayOverrides),
    [now, dayOverrides],
  );
  const mine = useMemo(() => laneSelfItems(items), [items]);
  const theirs = useMemo(
    () => (soloMode ? [] : lanePartnerItems(items)),
    [items, soloMode],
  );

  const selfCurrent = useMemo(
    () => getCurrentItem(mine, now, dayOverrides),
    [mine, now, dayOverrides],
  );
  const selfUpcoming = useMemo(
    () => getUpcomingItem(mine, now, 7, dayOverrides),
    [mine, now, dayOverrides],
  );
  const partnerCurrent = useMemo(
    () => getCurrentItem(theirs, now, dayOverrides),
    [theirs, now, dayOverrides],
  );
  const partnerUpcoming = useMemo(
    () => getUpcomingItem(theirs, now, 7, dayOverrides),
    [theirs, now, dayOverrides],
  );

  const dateText = format(now, "M月d日 EEEE", { locale: zhCN });

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      <div>
        <p className="kicker">此刻</p>
        <p className="font-display mt-1 text-2xl leading-none">{dateText}</p>
        {showHolidays && holiday.kind !== "none" ? (
          <p className="mt-2 text-sm text-[var(--color-warn)]">{holiday.name}</p>
        ) : null}
      </div>

      <div className={cn("flex gap-3", soloMode ? "flex-col" : "flex-row")}>
        <Lane
          name={soloMode ? "今日" : couple.selfName}
          color={couple.selfColor}
          current={selfCurrent}
          upcoming={selfUpcoming}
          remaining={
            selfCurrent != null ? msUntilTime(selfCurrent.end, now) : null
          }
          untilNext={
            selfUpcoming != null ? msUntilDate(selfUpcoming.at, now) : null
          }
          progress={
            selfCurrent ? progressThroughItem(selfCurrent, now) : 0
          }
          todayKey={todayKey}
        />
        {soloMode ? null : (
          <Lane
            name={couple.partnerName}
            color={couple.partnerColor}
            current={partnerCurrent}
            upcoming={partnerUpcoming}
            remaining={
              partnerCurrent != null
                ? msUntilTime(partnerCurrent.end, now)
                : null
            }
            untilNext={
              partnerUpcoming != null
                ? msUntilDate(partnerUpcoming.at, now)
                : null
            }
            progress={
              partnerCurrent ? progressThroughItem(partnerCurrent, now) : 0
            }
            todayKey={todayKey}
          />
        )}
      </div>

      <CoexistenceBar className="[&_button]:h-12 [&_button]:px-5 [&_button]:text-sm" />
    </div>
  );
}
