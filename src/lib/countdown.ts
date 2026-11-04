import {
  WEEKDAY_LABELS,
  formatDateKey,
  itemOccursOnDate,
  itemRecurrence,
  itemSpanMinutes,
  parseDateKey,
  shiftDateKey,
  type DayOverride,
  type ScheduleItem,
} from "@/lib/config";
import { daysBetween } from "@/lib/anniversary";

export type ClockParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export type CountdownDisplay =
  | { mode: "before"; parts: ClockParts; sentence: string }
  | { mode: "during"; label: "进行中" }
  | { mode: "ended"; sentence: string; endKey: string };

export function isCountdownItem(item: Pick<ScheduleItem, "countdown">) {
  return item.countdown === true;
}

export function clockPartsBetween(now: Date, target: Date): ClockParts {
  let rest = Math.max(0, target.getTime() - now.getTime());
  const days = Math.floor(rest / 86_400_000);
  rest -= days * 86_400_000;
  const hours = Math.floor(rest / 3_600_000);
  rest -= hours * 3_600_000;
  const minutes = Math.floor(rest / 60_000);
  rest -= minutes * 60_000;
  const seconds = Math.floor(rest / 1000);
  return { days, hours, minutes, seconds };
}

export function countdownSentence(parts: ClockParts) {
  return `${parts.days} 天 ${parts.hours} 小时 ${parts.minutes} 分 ${parts.seconds} 秒`;
}

export function endedSentence(end: Date) {
  return `结束在 ${end.getFullYear()}年${end.getMonth() + 1}月${end.getDate()}日`;
}

function atClock(dateKey: string, clock: string) {
  const date = parseDateKey(dateKey);
  const [hour, minute] = clock.split(":").map(Number);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function occurrenceWindow(item: ScheduleItem, startKey: string) {
  const start = atClock(startKey, item.start);
  const end = new Date(start.getTime() + itemSpanMinutes(item) * 60_000);
  if (end.getTime() <= start.getTime()) return null;
  return { start, end };
}

function isWeeklyStart(item: ScheduleItem, dateKey: string, dayOverrides: Record<string, DayOverride>) {
  if (!item.weekdays.includes(parseDateKey(dateKey).getDay())) return false;
  if (!itemOccursOnDate(item, dateKey, parseDateKey(dateKey).getDay(), dayOverrides)) {
    return false;
  }
  return true;
}

/** 从昨天扫到一年后，覆盖过夜的「进行中」和下一次。 */
export function countdownWindows(
  item: ScheduleItem,
  now: Date,
  dayOverrides: Record<string, DayOverride> = {},
) {
  if (!item.enabled) return [];
  if (itemRecurrence(item) === "once") {
    if (!item.date) return [];
    const window = occurrenceWindow(item, item.date);
    return window ? [window] : [];
  }
  const today = formatDateKey(now);
  const windows: { start: Date; end: Date }[] = [];
  for (let offset = -1; offset <= 370; offset += 1) {
    const dateKey = shiftDateKey(today, offset);
    if (!isWeeklyStart(item, dateKey, dayOverrides)) continue;
    const window = occurrenceWindow(item, dateKey);
    if (window) windows.push(window);
  }
  return windows;
}

/**
 * 开始前是倒计时。进行中只写「进行中」。
 * 没有下一次时写结束在那一天。这三种不同时出现。
 */
export function readCountdown(
  item: ScheduleItem,
  now: Date,
  dayOverrides: Record<string, DayOverride> = {},
): CountdownDisplay {
  const windows = countdownWindows(item, now, dayOverrides);
  const current = windows.find(
    (window) => now.getTime() >= window.start.getTime() && now.getTime() < window.end.getTime(),
  );
  if (current) return { mode: "during", label: "进行中" };
  const next = windows.find((window) => window.start.getTime() > now.getTime());
  if (next) {
    const parts = clockPartsBetween(now, next.start);
    return { mode: "before", parts, sentence: countdownSentence(parts) };
  }
  const last = [...windows].reverse().find((window) => window.end.getTime() <= now.getTime());
  const end = last?.end ?? atClock(item.date ?? formatDateKey(now), item.end);
  return { mode: "ended", sentence: endedSentence(end), endKey: formatDateKey(end) };
}

export function formatImportWhen(start: Date, now: Date) {
  const startKey = formatDateKey(start);
  const today = formatDateKey(now);
  const hm = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
  if (startKey === today) return `今天 ${hm}`;
  if (startKey === shiftDateKey(today, 1)) return `明天 ${hm}`;
  const days = daysBetween(today, startKey);
  if (days > 1 && days < 7) return `周${WEEKDAY_LABELS[start.getDay()]} ${hm}`;
  return `${start.getMonth() + 1}月${start.getDate()}日`;
}

export function nextCountdownStart(
  item: ScheduleItem,
  now: Date,
  dayOverrides: Record<string, DayOverride> = {},
) {
  const windows = countdownWindows(item, now, dayOverrides);
  const current = windows.find(
    (window) => now.getTime() >= window.start.getTime() && now.getTime() < window.end.getTime(),
  );
  if (current) return current.start;
  return windows.find((window) => window.start.getTime() > now.getTime())?.start ?? null;
}

export function scheduleDeleteMessage(title: string, countdown: boolean) {
  const name = title.trim() || "此日程";
  if (countdown) return `确定删除「${name}」？这条倒数也会去掉`;
  return `确定删除「${name}」？`;
}

export function schedulesDeleteMessage(count: number, anyCountdown: boolean) {
  if (anyCountdown) return `删除选中的 ${count} 条？这条倒数也会去掉`;
  return `删除选中的 ${count} 条？`;
}
