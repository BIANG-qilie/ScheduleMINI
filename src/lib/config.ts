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

export const AppConfigSchema = z.object({
  version: z.literal(1),
  showHolidays: z.boolean(),
  widgetVisible: z.boolean(),
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

export function isCurrentItem(item: ScheduleItem, now = new Date()) {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const current = `${hh}:${mm}`;
  return compareTime(item.start, current) <= 0 && compareTime(current, item.end) < 0;
}

export function todaysItems(items: ScheduleItem[], now = new Date()) {
  const weekday = now.getDay();
  return items
    .filter((item) => item.enabled && item.weekdays.includes(weekday))
    .sort((a, b) => compareTime(a.start, b.start));
}

export function formatWeekdays(weekdays: number[]) {
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((d) => `周${WEEKDAY_LABELS[d]}`)
    .join("、");
}
