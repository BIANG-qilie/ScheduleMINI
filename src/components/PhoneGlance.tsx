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
  partnerFacingName,
  progressThroughItem,
  type CoupleIdentity,
  type ScheduleItem,
  type UpcomingRef,
} from "@/lib/config";
import { getTodayLabel, onHolidayData } from "@/lib/holidays";
import { formatItemSubline } from "@/lib/schedule-style";
import { lanePartnerItems, laneSelfItems } from "@/lib/sync/couple";
import { useConfigStore } from "@/store/config-store";
import { AddressLine } from "@/components/AddressLine";
import { CoexistenceBar } from "@/components/CoexistenceBar";

function upcomingWhen(ref: UpcomingRef, todayKey: string) {
  if (ref.dateKey === todayKey) return ref.item.start;
  return `周${WEEKDAY_LABELS[ref.at.getDay()]} ${ref.item.start}`;
}

function greeting(now: Date) {
  const h = now.getHours();
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function Half({
  name,
  color,
  current,
  upcoming,
  now,
  todayKey,
}: {
  name: string;
  color: string;
  current: ScheduleItem | null;
  upcoming: UpcomingRef | null;
  now: Date;
  todayKey: string;
}) {
  const subline = current ? formatItemSubline(current) : null;
  const remaining = current ? msUntilTime(current.end, now) : null;
  const untilNext = upcoming ? msUntilDate(upcoming.at, now) : null;
  const progress = current ? progressThroughItem(current, now) : 0;

  return (
    <section
      className="ticket-half"
      data-busy={current ? "" : undefined}
      style={{ ["--lane" as string]: color }}
    >
      <header className="ticket-head">
        <h2>
          <span className="ticket-dot" aria-hidden />
          {name}
        </h2>
        <span className="ticket-state">
          {current
            ? remaining != null && remaining > 0
              ? `还剩 ${formatDurationCompact(remaining)}`
              : "进行中"
            : "空闲"}
        </span>
      </header>

      <p className="ticket-title">
        {current ? itemDisplayTitle(current) : "这一段是空的"}
      </p>
      {current ? (
        <p className="ticket-meta">
          <span className="font-mono tabular">
            {current.start}–{current.end}
          </span>
          {subline ? <span>{subline}</span> : null}
        </p>
      ) : null}
      {current?.note?.trim() ? (
        <p className="ticket-note">{current.note.trim()}</p>
      ) : null}
      {current ? (
        <div className="ticket-progress" aria-hidden>
          <i style={{ transform: `scaleX(${progress})` }} />
        </div>
      ) : null}

      {upcoming && untilNext != null ? (
        <div className="ticket-next">
          <span className="ticket-next-label">下一程</span>
          <span className="ticket-next-title">
            {itemDisplayTitle(upcoming.item)}
          </span>
          <span className="font-mono tabular ticket-next-when">
            {upcomingWhen(upcoming, todayKey)} · {formatDurationCompact(untilNext)}后
          </span>
        </div>
      ) : (
        <div className="ticket-next">
          <span className="ticket-next-label">下一程</span>
          <span className="ticket-next-title muted">暂时没有</span>
        </div>
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
  const syncStatus = useConfigStore((s) => s.syncStatus);
  const [now, setNow] = useState(() => new Date());
  const [holidayTick, setHolidayTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => onHolidayData(() => setHolidayTick((n) => n + 1)), []);

  const todayKey = formatDateKey(now);
  const holiday = useMemo(
    () => getTodayLabel(now, dayOverrides),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, dayOverrides, holidayTick],
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

  const bothFree = !soloMode && !selfCurrent && !partnerCurrent;

  return (
    <div className="phone-now">
      {syncStatus?.startsWith("同步失败") ? (
        <p role="status" className="text-xs text-red-700">
          {syncStatus}
        </p>
      ) : null}
      <header className="now-hero">
        <p className="kicker">此刻</p>
        <h2 className="now-date">
          {format(now, "M月d日", { locale: zhCN })}
          <span>{format(now, "EEEE", { locale: zhCN })}</span>
        </h2>
        <p className="now-greet">
          {greeting(now)}
          {showHolidays && holiday.kind !== "none" ? (
            <em>{holiday.name}</em>
          ) : null}
        </p>
      </header>

      <div className={soloMode ? "ticket solo" : "ticket"}>
        <Half
          name={soloMode ? "今日" : couple.selfName}
          color={couple.selfColor}
          current={selfCurrent}
          upcoming={selfUpcoming}
          now={now}
          todayKey={todayKey}
        />
        {soloMode ? null : (
          <>
            <div className="ticket-seam" aria-hidden>
              <span>♡</span>
            </div>
            <Half
              name={partnerFacingName(couple)}
              color={couple.partnerColor}
              current={partnerCurrent}
              upcoming={partnerUpcoming}
              now={now}
              todayKey={todayKey}
            />
          </>
        )}
      </div>

      {bothFree ? <p className="now-hint">你们现在都空着</p> : null}

      <AddressLine />

      <div className="phone-coex">
        <CoexistenceBar />
      </div>
    </div>
  );
}
