import { z } from "zod";

export const ScheduleItemSchema = z.object({
  id: z.string().min(1),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "开始时间格式应为 HH:mm"),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "结束时间格式应为 HH:mm"),
  title: z.string().trim().min(1, "请填写标题"),
  note: z.string().optional(),
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1, "请至少选择一个星期几"),
  enabled: z.boolean(),
});

export const WidgetModeSchema = z.enum(["full", "current"]);
export type WidgetMode = z.infer<typeof WidgetModeSchema>;

export const AppConfigSchema = z.object({
  version: z.literal(1),
  showHolidays: z.boolean(),
  widgetVisible: z.boolean(),
  /** full=今日全部；current=仅当前时段 + 距下一程 */
  widgetMode: WidgetModeSchema.default("current"),
  items: z.array(ScheduleItemSchema),
});

export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

export const CONFIG_VERSION = 1 as const;
export const CONFIG_FILE_NAME = "config.json";
export const CONFIG_CHANGED_EVENT = "config-changed";

export const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

export function defaultConfig(): AppConfig {
  return {
    version: CONFIG_VERSION,
    showHolidays: true,
    widgetVisible: true,
    widgetMode: "current",
    items: [
      {
        id: "sample-morning",
        start: "09:00",
        end: "10:00",
        title: "晨会",
        note: "同步今日重点",
        weekdays: [1, 2, 3, 4, 5],
        enabled: true,
      },
      {
        id: "sample-deepwork",
        start: "14:00",
        end: "16:00",
        title: "深度工作",
        note: "关闭通知",
        weekdays: [1, 2, 3, 4, 5],
        enabled: true,
      },
      {
        id: "sample-review",
        start: "20:00",
        end: "20:30",
        title: "复盘",
        weekdays: [0, 6],
        enabled: true,
      },
    ],
  };
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

export function nowTimeString(now = new Date()) {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function isCurrentItem(item: ScheduleItem, now = new Date()) {
  const current = nowTimeString(now);
  return compareTime(item.start, current) <= 0 && compareTime(current, item.end) < 0;
}

export function todaysItems(items: ScheduleItem[], now = new Date()) {
  const weekday = now.getDay();
  return items
    .filter((item) => item.enabled && item.weekdays.includes(weekday))
    .sort((a, b) => compareTime(a.start, b.start));
}

export function getCurrentItem(items: ScheduleItem[], now = new Date()) {
  return todaysItems(items, now).find((item) => isCurrentItem(item, now)) ?? null;
}

/** 下一程：开始时间晚于当前时刻的第一条今日日程 */
export function getNextItem(items: ScheduleItem[], now = new Date()) {
  const current = nowTimeString(now);
  return (
    todaysItems(items, now).find((item) => compareTime(item.start, current) > 0) ??
    null
  );
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

/** 当前时段进度 0–1 */
export function progressThroughItem(item: ScheduleItem, now = new Date()) {
  const startMs = msUntilTime(item.start, now);
  const endMs = msUntilTime(item.end, now);
  const total = endMs - startMs;
  if (total <= 0) return 1;
  const elapsed = -startMs;
  return Math.min(1, Math.max(0, elapsed / total));
}

export function formatWeekdays(weekdays: number[]) {
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((d) => `周${WEEKDAY_LABELS[d]}`)
    .join("、");
}
