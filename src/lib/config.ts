import { z } from "zod";
import { isDayOff } from "@/lib/holidays";

const TimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式应为 HH:mm");
const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");

export const RecurrenceSchema = z.enum(["weekly", "once"]);
export type Recurrence = z.infer<typeof RecurrenceSchema>;

export const ScheduleTagSchema = z.enum([
  "work",
  "commute",
  "study",
  "rest",
  "life",
  "other",
]);
export type ScheduleTag = z.infer<typeof ScheduleTagSchema>;

/** 标签展示名与是否随放假跳过 */
export const SCHEDULE_TAG_META: Record<
  ScheduleTag,
  { label: string; respectsHolidays: boolean }
> = {
  work: { label: "工作", respectsHolidays: true },
  commute: { label: "交通", respectsHolidays: true },
  study: { label: "学习", respectsHolidays: false },
  rest: { label: "休息", respectsHolidays: false },
  life: { label: "生活", respectsHolidays: false },
  other: { label: "其他", respectsHolidays: false },
};

export const SCHEDULE_TAG_OPTIONS = (
  Object.keys(SCHEDULE_TAG_META) as ScheduleTag[]
).map((id) => ({ id, ...SCHEDULE_TAG_META[id] }));

export function tagRespectsHolidays(tag: ScheduleTag) {
  return SCHEDULE_TAG_META[tag]?.respectsHolidays ?? false;
}

export function formatTagLabel(tag: ScheduleTag) {
  return SCHEDULE_TAG_META[tag]?.label ?? tag;
}

export const DayOverrideSchema = z.enum(["off", "work"]);
export type DayOverride = z.infer<typeof DayOverrideSchema>;

export const ScheduleItemSchema = z
  .object({
    id: z.string().min(1),
    start: TimeSchema,
    end: TimeSchema,
    title: z.string().trim().min(1, "请填写标题"),
    note: z.string().optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).default([]),
    enabled: z.boolean(),
    /** weekly=按周循环；once=指定日期仅一次（旧配置缺省视为 weekly） */
    recurrence: RecurrenceSchema.default("weekly"),
    /** once 时必填，YYYY-MM-DD */
    date: DateSchema.optional(),
    /** 标签；work/commute 放假日跳过周循环 */
    tag: ScheduleTagSchema.default("work"),
  })
  .superRefine((val, ctx) => {
    if (val.start === val.end) {
      ctx.addIssue({
        code: "custom",
        message: "结束时间不能与开始时间相同",
        path: ["end"],
      });
    }
    if (val.recurrence === "weekly" && val.weekdays.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "请至少选择一个星期几",
        path: ["weekdays"],
      });
    }
    if (val.recurrence === "once" && !val.date) {
      ctx.addIssue({
        code: "custom",
        message: "请选择日期",
        path: ["date"],
      });
    }
  });

export const WidgetModeSchema = z.enum(["full", "current"]);
export type WidgetMode = z.infer<typeof WidgetModeSchema>;

export const SettingsViewModeSchema = z.enum(["list", "week"]);
export type SettingsViewMode = z.infer<typeof SettingsViewModeSchema>;

export const ReminderMinutesSchema = z.union([
  z.literal(5),
  z.literal(10),
  z.literal(15),
]);
export type ReminderMinutes = z.infer<typeof ReminderMinutesSchema>;

export const AppConfigSchema = z
  .object({
    version: z.literal(1),
    showHolidays: z.boolean(),
    widgetVisible: z.boolean(),
    /** full=今日全部；current=仅当前时段 + 距下一程 */
    widgetMode: WidgetModeSchema.default("current"),
    /** 设置页日程展示：list=列表；week=周网格（默认） */
    settingsViewMode: SettingsViewModeSchema.default("week"),
    autostart: z.boolean().default(false),
    remindersEnabled: z.boolean().default(true),
    reminderMinutesBefore: ReminderMinutesSchema.default(10),
    widgetOpacity: z.number().min(0.4).max(1).default(0.92),
    gridStartHour: z.number().int().min(5).max(12).default(7),
    gridEndHour: z.number().int().min(14).max(24).default(22),
    dayOverrides: z.record(z.string(), DayOverrideSchema).default({}),
    items: z.array(ScheduleItemSchema),
  })
  .superRefine((val, ctx) => {
    if (val.gridEndHour <= val.gridStartHour) {
      ctx.addIssue({
        code: "custom",
        message: "结束小时须晚于开始小时",
        path: ["gridEndHour"],
      });
    }
  });

export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

export const CONFIG_VERSION = 1 as const;
export const CONFIG_FILE_NAME = "config.json";
export const CONFIG_CHANGED_EVENT = "config-changed";
export const APP_DISPLAY_NAME = "小日程";

export const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

/** 课表列顺序：周一 → 周日 */
export const WEEK_COLUMN_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export function defaultConfig(): AppConfig {
  return {
    version: CONFIG_VERSION,
    showHolidays: true,
    widgetVisible: true,
    widgetMode: "current",
    settingsViewMode: "week",
    autostart: false,
    remindersEnabled: true,
    reminderMinutesBefore: 10,
    widgetOpacity: 0.92,
    gridStartHour: 7,
    gridEndHour: 22,
    dayOverrides: {},
    items: [
      {
        id: "sample-morning",
        start: "09:00",
        end: "10:00",
        title: "晨会",
        note: "同步今日重点",
        weekdays: [1, 2, 3, 4, 5],
        enabled: true,
        recurrence: "weekly",
        tag: "work",
      },
      {
        id: "sample-deepwork",
        start: "14:00",
        end: "16:00",
        title: "深度工作",
        note: "关闭通知",
        weekdays: [1, 2, 3, 4, 5],
        enabled: true,
        recurrence: "weekly",
        tag: "work",
      },
      {
        id: "sample-review",
        start: "20:00",
        end: "20:30",
        title: "复盘",
        weekdays: [0, 6],
        enabled: true,
        recurrence: "weekly",
        tag: "rest",
      },
    ],
  };
}

/** 空配置：加载失败时用，不含样例日程 */
export function emptyConfig(): AppConfig {
  return {
    ...defaultConfig(),
    items: [],
  };
}

/** end < start 表示跨日（过夜） */
export function isOvernightItem(item: Pick<ScheduleItem, "start" | "end">) {
  return compareTime(item.end, item.start) < 0;
}

export function parseAppConfig(raw: unknown): AppConfig {
  return AppConfigSchema.parse(raw);
}

export function safeParseAppConfig(raw: unknown) {
  return AppConfigSchema.safeParse(raw);
}

export function compareTime(a: string, b: string) {
  return a.localeCompare(b);
}

export function formatDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** 以周一为一周起始：返回含 `anchor` 的那一周各列（含具体日期） */
export function getCurrentWeekColumns(anchor = new Date()) {
  const day = anchor.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(anchor.getDate() + mondayOffset);

  return WEEK_COLUMN_DAYS.map((weekday, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      weekday,
      dateKey: formatDateKey(date),
      monthDay: `${date.getMonth() + 1}/${date.getDate()}`,
    };
  });
}

/** 相对「今天所在周」偏移 weekOffset 周后的锚点日期（正午） */
export function getWeekAnchor(weekOffset = 0, now = new Date()) {
  const anchor = new Date(now);
  anchor.setHours(12, 0, 0, 0);
  anchor.setDate(now.getDate() + weekOffset * 7);
  return anchor;
}

/** 周范围文案，如「9/22 – 9/28」 */
export function formatWeekRangeLabel(columns: ReturnType<typeof getCurrentWeekColumns>) {
  if (columns.length === 0) return "";
  const first = columns[0];
  const last = columns[columns.length - 1];
  return `${first.monthDay} – ${last.monthDay}`;
}

export function itemRecurrence(item: ScheduleItem): Recurrence {
  return item.recurrence ?? "weekly";
}

export function itemTag(item: ScheduleItem): ScheduleTag {
  return item.tag ?? "work";
}

export function itemOccursOnDate(
  item: ScheduleItem,
  dateKey: string,
  weekday = parseDateKey(dateKey).getDay(),
  dayOverrides: Record<string, DayOverride> = {},
) {
  if (!item.enabled) return false;

  if (itemRecurrence(item) === "once") {
    if (item.date === dateKey) return true;
    // 跨日仅一次：次日凌晨仍属该日程
    if (item.date && isOvernightItem(item)) {
      const next = parseDateKey(item.date);
      next.setDate(next.getDate() + 1);
      return formatDateKey(next) === dateKey;
    }
    return false;
  }

  const prevWeekday = (weekday + 6) % 7;
  const onStartDay = item.weekdays.includes(weekday);
  const onEndDay =
    isOvernightItem(item) && item.weekdays.includes(prevWeekday);
  if (!onStartDay && !onEndDay) return false;

  if (tagRespectsHolidays(itemTag(item))) {
    if (isDayOff(dateKey, dayOverrides)) return false;
    // 跨日次日：若起始日放假则整段不生效
    if (onEndDay && !onStartDay) {
      const prev = parseDateKey(dateKey);
      prev.setDate(prev.getDate() - 1);
      if (isDayOff(formatDateKey(prev), dayOverrides)) return false;
    }
  }
  return true;
}

/**
 * 跨日条目在某一列应渲染的时段（同一天内的片段）。
 * 起始日：start→24:00；次日：00:00→end；非跨日：start→end。
 */
export function itemSegmentOnDate(
  item: ScheduleItem,
  dateKey: string,
  weekday = parseDateKey(dateKey).getDay(),
): { start: string; end: string } | null {
  if (!itemOccursOnDate(item, dateKey, weekday)) return null;
  if (!isOvernightItem(item)) {
    return { start: item.start, end: item.end };
  }
  const prevWeekday = (weekday + 6) % 7;
  const onStartDay =
    itemRecurrence(item) === "once"
      ? item.date === dateKey
      : item.weekdays.includes(weekday);
  const onEndDay =
    itemRecurrence(item) === "once"
      ? item.date !== dateKey
      : item.weekdays.includes(prevWeekday);
  if (onStartDay && onEndDay) {
    // 理论上同星期不会同时，once 不会；防御
    return { start: item.start, end: "24:00" };
  }
  if (onStartDay) return { start: item.start, end: "24:00" };
  if (onEndDay) return { start: "00:00", end: item.end };
  return null;
}

export function nowTimeString(now = new Date()) {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** @deprecated 仅看钟点；跨日请用 isItemNow */
export function isCurrentItem(item: ScheduleItem, now = new Date()) {
  return isItemNow(item, now);
}

export function todaysItems(
  items: ScheduleItem[],
  now = new Date(),
  dayOverrides: Record<string, DayOverride> = {},
) {
  const dateKey = formatDateKey(now);
  const weekday = now.getDay();
  return items
    .filter((item) => itemOccursOnDate(item, dateKey, weekday, dayOverrides))
    .sort((a, b) => compareTime(a.start, b.start));
}

export function getCurrentItem(
  items: ScheduleItem[],
  now = new Date(),
  dayOverrides: Record<string, DayOverride> = {},
) {
  return (
    todaysItems(items, now, dayOverrides).find((item) =>
      isItemNow(item, now, dayOverrides),
    ) ?? null
  );
}

/**
 * 是否正处于该日程发生中（含跨日：仅起始日 start 之后，或次日 end 之前）。
 */
export function isItemNow(
  item: ScheduleItem,
  now = new Date(),
  dayOverrides: Record<string, DayOverride> = {},
) {
  const dateKey = formatDateKey(now);
  const weekday = now.getDay();
  if (!itemOccursOnDate(item, dateKey, weekday, dayOverrides)) return false;

  const current = nowTimeString(now);
  if (!isOvernightItem(item)) {
    return (
      compareTime(item.start, current) <= 0 &&
      compareTime(current, item.end) < 0
    );
  }

  const onStartDay =
    itemRecurrence(item) === "once"
      ? item.date === dateKey
      : item.weekdays.includes(weekday);
  const onEndDay =
    itemRecurrence(item) === "once"
      ? Boolean(item.date && item.date !== dateKey)
      : item.weekdays.includes((weekday + 6) % 7);

  if (onStartDay && compareTime(item.start, current) <= 0) return true;
  if (onEndDay && compareTime(current, item.end) < 0) return true;
  return false;
}

export type UpcomingRef = {
  item: ScheduleItem;
  /** 该次发生的具体日期时间 */
  at: Date;
  dateKey: string;
};

/**
 * 向后查找下一程（含今天尚未开始的，以及未来 7 天内的周循环/仅一次）。
 */
export function getUpcomingItem(
  items: ScheduleItem[],
  now = new Date(),
  horizonDays = 7,
  dayOverrides: Record<string, DayOverride> = {},
): UpcomingRef | null {
  let best: UpcomingRef | null = null;

  for (let offset = 0; offset < horizonDays; offset++) {
    const day = new Date(now);
    day.setHours(12, 0, 0, 0);
    day.setDate(now.getDate() + offset);
    const dateKey = formatDateKey(day);
    const weekday = day.getDay();

    for (const item of items) {
      if (!itemOccursOnDate(item, dateKey, weekday, dayOverrides)) continue;
      const [h, m] = item.start.split(":").map(Number);
      const at = new Date(day);
      at.setHours(h, m, 0, 0);
      if (at.getTime() <= now.getTime()) continue;
      if (!best || at.getTime() < best.at.getTime()) {
        best = { item, at, dateKey };
      }
    }
  }

  return best;
}

/** @deprecated 仅今日下一程；请优先用 getUpcomingItem */
export function getNextItem(
  items: ScheduleItem[],
  now = new Date(),
  dayOverrides: Record<string, DayOverride> = {},
) {
  return getUpcomingItem(items, now, 1, dayOverrides)?.item ?? null;
}

export function msUntilDate(at: Date, now = new Date()) {
  return at.getTime() - now.getTime();
}

export function msUntilTime(hhmm: string, now = new Date()) {
  const [h, m] = hhmm.split(":").map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return target.getTime() - now.getTime();
}

/** 中文相对时长，如「23 分钟」「1 小时 5 分钟」 */
export function formatDurationZh(ms: number) {
  if (ms <= 0) return "不到 1 分钟";
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return "不到 1 分钟";
  const totalMin = Math.ceil(totalSec / 60);
  if (totalMin < 60) return `${totalMin} 分钟`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins === 0 ? `${hours} 小时` : `${hours} 小时 ${mins} 分钟`;
}

/** 扫视用紧凑时长：40分 / 1时05分 / <1分 */
export function formatDurationCompact(ms: number) {
  if (ms <= 0) return "<1分";
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return "<1分";
  const totalMin = Math.ceil(totalSec / 60);
  if (totalMin < 60) return `${totalMin}分`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins === 0 ? `${hours}时` : `${hours}时${String(mins).padStart(2, "0")}分`;
}

/** 当前时段进度 0–1（含跨日：end < start） */
export function progressThroughItem(item: ScheduleItem, now = new Date()) {
  const [sh, sm] = item.start.split(":").map(Number);
  const [eh, em] = item.end.split(":").map(Number);
  const [ch, cm] = nowTimeString(now).split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const curMin = ch * 60 + cm;

  if (isOvernightItem(item)) {
    const totalMin = 24 * 60 - startMin + endMin;
    if (totalMin <= 0) return 1;
    const elapsed =
      curMin >= startMin ? curMin - startMin : 24 * 60 - startMin + curMin;
    return Math.min(1, Math.max(0, elapsed / totalMin));
  }

  const totalMin = endMin - startMin;
  if (totalMin <= 0) return 1;
  const elapsed = curMin - startMin;
  return Math.min(1, Math.max(0, elapsed / totalMin));
}

export function formatWeekdays(weekdays: number[]) {
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((d) => `周${WEEKDAY_LABELS[d]}`)
    .join("、");
}

export function formatScheduleScope(item: ScheduleItem) {
  const tagLabel = formatTagLabel(itemTag(item));
  if (itemRecurrence(item) === "once" && item.date) {
    const d = parseDateKey(item.date);
    return `仅一次 · ${tagLabel} · ${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${tagLabel} · ${formatWeekdays(item.weekdays)}`;
}
