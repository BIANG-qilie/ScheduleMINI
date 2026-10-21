import {
  CALL_CHANNEL_META,
  DEFAULT_CALL_CHANNEL,
  compareTime,
  formatCallChannelLabel,
  formatDateKey,
  parseDateKey,
  toHhmm,
  type CallChannel,
  type ScheduleItem,
} from "@/lib/config";

/** 通话补录最长 48 小时 */
export const CALL_BACKFILL_MAX_MINUTES = 48 * 60;

export const CALL_BACKFILL_PRESETS = [5, 15, 30, 60] as const;
export type CallBackfillPreset = (typeof CALL_BACKFILL_PRESETS)[number];

export type CallBackfillResolved = {
  startAt: Date;
  endAt: Date;
  start: string;
  end: string;
  date: string;
  durationMinutes: number;
};

export type CallEntryMode = "plan" | "backfill";

function truncateToMinute(date: Date) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
}

export function isCallBackfillPreset(value: number): value is CallBackfillPreset {
  return (CALL_BACKFILL_PRESETS as readonly number[]).includes(value);
}

export function toDatetimeLocalValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export function parseDatetimeLocalValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(
    value,
  );
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0,
  );
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** 自定义分钟优先；空字符串表示用预设。非法文本得到 NaN。 */
export function readBackfillDuration(
  preset: CallBackfillPreset | null,
  custom: string,
): number | null {
  const text = custom.trim();
  if (text !== "") {
    if (!/^\d+$/.test(text)) return Number.NaN;
    return Number(text);
  }
  return preset;
}

/**
 * 结束时刻减去时长。
 * 结束时间可以早于现在，不能晚于现在。时长大于 0，不超过 48 小时。
 */
export function resolveCallBackfill(input: {
  endAt: Date;
  durationMinutes: number;
  now?: Date;
}): { ok: true } & CallBackfillResolved | { ok: false; message: string } {
  const now = truncateToMinute(input.now ?? new Date());
  const endAt = truncateToMinute(input.endAt);
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    return { ok: false, message: "时长须大于 0" };
  }
  if (input.durationMinutes > CALL_BACKFILL_MAX_MINUTES) {
    return { ok: false, message: "时长不能超过 48 小时" };
  }
  if (endAt.getTime() > now.getTime()) {
    return { ok: false, message: "结束时间不能晚于现在" };
  }
  const startAt = new Date(endAt.getTime() - input.durationMinutes * 60_000);
  return {
    ok: true,
    startAt,
    endAt,
    start: toHhmm(startAt),
    end: toHhmm(endAt),
    date: formatDateKey(startAt),
    durationMinutes: input.durationMinutes,
  };
}

export function formatBackfillSpan(resolved: CallBackfillResolved) {
  const startKey = resolved.date;
  const endKey = formatDateKey(resolved.endAt);
  const start = parseDateKey(startKey);
  const startLabel = `${start.getMonth() + 1}月${start.getDate()}日`;
  if (startKey === endKey) return `${startLabel} ${resolved.start}–${resolved.end}`;
  const end = parseDateKey(endKey);
  return `${startLabel} ${resolved.start}–${end.getMonth() + 1}月${end.getDate()}日 ${resolved.end}`;
}

/** 从已保存的起止还原补录结束时刻与时长。跨午夜按过夜：结束在起始日的次日。 */
export function reconstructCallBackfill(item: {
  start: string;
  end: string;
  date: string;
  durationMinutes?: number;
}) {
  const startAt = parseDateKey(item.date);
  const [sh, sm] = item.start.split(":").map(Number);
  startAt.setHours(sh, sm, 0, 0);
  const endAt = new Date(startAt);
  if (item.durationMinutes != null && item.durationMinutes > 0) {
    endAt.setTime(startAt.getTime() + item.durationMinutes * 60_000);
  } else {
    const [eh, em] = item.end.split(":").map(Number);
    endAt.setHours(eh, em, 0, 0);
    if (compareTime(item.end, item.start) < 0) {
      endAt.setDate(endAt.getDate() + 1);
    }
  }
  const durationMinutes = Math.round(
    (endAt.getTime() - startAt.getTime()) / 60_000,
  );
  return {
    endAt,
    durationMinutes,
    backfillEnd: toDatetimeLocalValue(endAt),
  };
}

export function callBackfillTitle(channel: CallChannel) {
  return formatCallChannelLabel(channel);
}

/** 仅一次、标题为渠道名的通话，编辑时打开补录。 */
export function isBackfillCallItem(
  item: Pick<ScheduleItem, "tag" | "recurrence" | "title" | "callChannel">,
) {
  if ((item.tag ?? "work") !== "call") return false;
  if ((item.recurrence ?? "weekly") !== "once") return false;
  const channel = item.callChannel ?? DEFAULT_CALL_CHANNEL;
  return item.title === CALL_CHANNEL_META[channel].label;
}

export function describeCallBackfill(input: {
  backfillEnd: string;
  preset: CallBackfillPreset | null;
  custom: string;
  now?: Date;
}):
  | { state: "empty"; message: string }
  | { state: "invalid"; message: string }
  | { state: "ready"; resolved: CallBackfillResolved; preview: string } {
  const endAt = parseDatetimeLocalValue(input.backfillEnd);
  if (!endAt) return { state: "empty", message: "请填写结束时间" };
  const duration = readBackfillDuration(input.preset, input.custom);
  if (duration == null) return { state: "empty", message: "请填写时长" };
  if (!Number.isInteger(duration)) {
    return { state: "invalid", message: "时长须为整数分钟" };
  }
  const resolved = resolveCallBackfill({
    endAt,
    durationMinutes: duration,
    now: input.now,
  });
  if (!resolved.ok) return { state: "invalid", message: resolved.message };
  return {
    state: "ready",
    resolved,
    preview: formatBackfillSpan(resolved),
  };
}
