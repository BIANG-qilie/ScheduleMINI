import { z } from "zod";
import { isDayOff } from "@/lib/holidays";
import { createId } from "@/lib/utils";

const TimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式应为 HH:mm");
const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");
const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "颜色应为 #RRGGBB");

export const DEFAULT_SELF_COLOR = "#0f766e";
export const DEFAULT_PARTNER_COLOR = "#a21caf";
/** 共同日程强调色（琥珀） */
export const DEFAULT_SHARED_COLOR = "#b45309";

export const CoupleIdentitySchema = z.object({
  /** 稳定个人身份（selfId / personId）；多端须相同，与对方不同 */
  memberId: z.string().min(1),
  selfName: z.string().trim().min(1).default("我"),
  selfColor: HexColorSchema.default(DEFAULT_SELF_COLOR),
  partnerName: z.string().trim().min(1).default("对方"),
  partnerColor: HexColorSchema.default(DEFAULT_PARTNER_COLOR),
  inviteCode: z.string().nullable().optional(),
  partnerMemberId: z.string().nullable().optional(),
  pairedAt: z.string().nullable().optional(),
});
export type CoupleIdentity = z.infer<typeof CoupleIdentitySchema>;

/** 本机个人身份 id（多端共享） */
export function selfPersonId(couple: CoupleIdentity) {
  return couple.memberId;
}

export function defaultCouple(): CoupleIdentity {
  return {
    memberId: createId(),
    selfName: "我",
    selfColor: DEFAULT_SELF_COLOR,
    partnerName: "对方",
    partnerColor: DEFAULT_PARTNER_COLOR,
    inviteCode: null,
    partnerMemberId: null,
    pairedAt: null,
  };
}

export function isPaired(couple: CoupleIdentity) {
  return Boolean(couple.inviteCode && couple.partnerMemberId);
}

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
  commute: { label: "交通", respectsHolidays: false },
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
    /** 标签；仅 weekly + work 放假日跳过；once 不受放假影响 */
    tag: ScheduleTagSchema.default("work"),
    /** 周循环：取消单次出现的日期（YYYY-MM-DD，跨日记起始日） */
    skippedDates: z.array(DateSchema).default([]),
    /** 周循环：从此日（含）起才出现；缺省表示不限起点 */
    activeFrom: DateSchema.optional(),
    /** 周循环：至此日（含）仍出现；缺省表示不限终点；旧配置缺省=无失效 */
    activeUntil: DateSchema.optional(),
    /** 交通：出发地 / 目的地（可选） */
    origin: z.string().trim().optional(),
    destination: z.string().trim().optional(),
    /**
     * 展示归属：自己 / 对方 / 共同（相对本机视角）。
     * 缺省在 parseAppConfig 中补全；旧配置若仅有异机 ownerId 则解析为 partner。
     */
    owner: z.enum(["self", "partner", "shared"]).optional(),
    /** 最近写入者 memberId；联合维护下各方均可编辑 */
    ownerId: z.string().optional(),
    /** ISO 时间；冲突时后写覆盖 */
    updatedAt: z.string().optional(),
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
    if (
      val.recurrence === "weekly" &&
      val.activeFrom &&
      val.activeUntil &&
      val.activeUntil < val.activeFrom
    ) {
      ctx.addIssue({
        code: "custom",
        message: "失效日不能早于生效日",
        path: ["activeUntil"],
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
    couple: CoupleIdentitySchema.default(() => defaultCouple()),
    /** 单人模式：悬浮窗不强调对方栏；本地仍可编双方/共同日程 */
    soloMode: z.boolean().default(false),
    /**
     * 同步中继基址。空字符串表示未自定义：
     * 解析顺序为 设置值 > VITE_SYNC_RELAY_URL > 内置 Railway 默认。
     */
    syncRelayUrl: z.string().default(""),
    /** 共处模式：当前会话 + 本地日志 */
    coexistence: z
      .object({
        current: z
          .object({
            id: z.string(),
            startedAt: z.string(),
            pauses: z
              .array(
                z.object({
                  pausedAt: z.string(),
                  resumedAt: z.string().optional(),
                }),
              )
              .default([]),
          })
          .nullable()
          .default(null),
        log: z
          .array(
            z.object({
              id: z.string(),
              startedAt: z.string(),
              endedAt: z.string(),
              pauses: z
                .array(
                  z.object({
                    pausedAt: z.string(),
                    resumedAt: z.string().optional(),
                  }),
                )
                .default([]),
            }),
          )
          .default([]),
      })
      .default({ current: null, log: [] }),
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
    const seen = new Set<string>();
    for (let i = 0; i < val.items.length; i++) {
      const id = val.items[i].id;
      if (seen.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: "日程 id 不能重复",
          path: ["items", i, "id"],
        });
      }
      seen.add(id);
    }
  });

export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type ItemOwner = "self" | "partner" | "shared";
export type CoexistenceState = AppConfig["coexistence"];
export type CoexistenceSession = NonNullable<CoexistenceState["current"]>;

export function itemOwner(item: Pick<ScheduleItem, "owner">): ItemOwner {
  return item.owner ?? "self";
}

/** 展示车道：自己（不含共同） */
export function laneIsSelf(item: Pick<ScheduleItem, "owner">) {
  return itemOwner(item) === "self";
}

export function laneIsShared(item: Pick<ScheduleItem, "owner">) {
  return itemOwner(item) === "shared";
}

/** @deprecated 联合维护后各方可编；仅表示最近写入者是否为本机 */
export function ownerIsSelf(
  item: Pick<ScheduleItem, "ownerId">,
  couple: CoupleIdentity,
) {
  const author = item.ownerId || couple.memberId;
  return author === couple.memberId;
}

export function ownerColor(
  item: Pick<ScheduleItem, "owner">,
  couple: CoupleIdentity,
) {
  const o = itemOwner(item);
  if (o === "shared") return DEFAULT_SHARED_COLOR;
  if (o === "partner") return couple.partnerColor;
  return couple.selfColor;
}

export function ownerLabel(
  item: Pick<ScheduleItem, "owner">,
  couple: CoupleIdentity,
) {
  const o = itemOwner(item);
  if (o === "shared") return "共同";
  if (o === "partner") return couple.partnerName;
  return couple.selfName;
}

/** 共处已进行时长（毫秒，已扣暂停） */
export function coexistenceElapsedMs(
  session: {
    startedAt: string;
    endedAt?: string;
    pauses: { pausedAt: string; resumedAt?: string }[];
  },
  now = new Date(),
) {
  const end = session.endedAt
    ? new Date(session.endedAt).getTime()
    : now.getTime();
  let ms = end - new Date(session.startedAt).getTime();
  for (const p of session.pauses) {
    const pauseStart = new Date(p.pausedAt).getTime();
    const pauseEnd = p.resumedAt
      ? new Date(p.resumedAt).getTime()
      : session.endedAt
        ? new Date(session.endedAt).getTime()
        : now.getTime();
    if (pauseEnd > pauseStart) ms -= pauseEnd - pauseStart;
  }
  return Math.max(0, ms);
}

export function coexistenceIsPaused(
  session: NonNullable<CoexistenceState["current"]> | null | undefined,
) {
  if (!session) return false;
  const last = session.pauses[session.pauses.length - 1];
  return Boolean(last && !last.resumedAt);
}

/** 净时长文案：不足 1 分钟写秒，避免误读为满分钟 */
export function formatNetDurationPrecise(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec} 秒`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins < 60) {
    return secs === 0 ? `${mins} 分钟` : `${mins} 分 ${secs} 秒`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (remMins === 0 && secs === 0) return `${hours} 小时`;
  if (secs === 0) return `${hours} 小时 ${remMins} 分钟`;
  return `${hours} 小时 ${remMins} 分 ${secs} 秒`;
}

export function toHhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const COEX_MIN_BLOCK_MS = 60_000;

export type CoexistenceFinished = {
  id: string;
  startedAt: string;
  endedAt: string;
  pauses: { pausedAt: string; resumedAt?: string }[];
};

/**
 * 共处结束 → 共同 once 字段：
 * 壁钟起止（不足 1 分钟撑高）；跨日不拆条，走 end < start；备注写净时长。
 */
export function buildCoexistenceSharedItemFields(finished: CoexistenceFinished) {
  const start = new Date(finished.startedAt);
  const realEnd = new Date(finished.endedAt);
  const wallEnd = new Date(realEnd);
  if (wallEnd.getTime() - start.getTime() < COEX_MIN_BLOCK_MS) {
    wallEnd.setTime(start.getTime() + COEX_MIN_BLOCK_MS);
  }
  const net = coexistenceElapsedMs(finished, realEnd);
  const netLabel = formatNetDurationPrecise(net);
  const short = net < COEX_MIN_BLOCK_MS;
  return {
    start: toHhmm(start),
    end: toHhmm(wallEnd),
    title: short ? `共处 · 净 ${netLabel}` : "共处",
    note: `净时长 ${netLabel}`,
    weekdays: [] as number[],
    enabled: true as const,
    recurrence: "once" as const,
    date: formatDateKey(start),
    tag: "life" as const,
    owner: "shared" as const,
  };
}

/** 周列重叠块：左对齐分列（同簇内缩窄） */
export function computeOverlapLayout(
  blocks: { id: string; start: number; end: number }[],
): Map<string, { column: number; columnCount: number }> {
  const sorted = [...blocks].sort(
    (a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id),
  );
  const clusters: (typeof sorted)[] = [];
  let current: typeof sorted = [];
  let clusterEnd = -Infinity;
  for (const b of sorted) {
    if (current.length === 0 || b.start < clusterEnd) {
      current.push(b);
      clusterEnd = Math.max(clusterEnd, b.end);
    } else {
      clusters.push(current);
      current = [b];
      clusterEnd = b.end;
    }
  }
  if (current.length) clusters.push(current);

  const result = new Map<string, { column: number; columnCount: number }>();
  for (const cluster of clusters) {
    const ends: number[] = [];
    const cols = new Map<string, number>();
    for (const b of cluster) {
      let col = ends.findIndex((t) => t <= b.start);
      if (col === -1) {
        col = ends.length;
        ends.push(b.end);
      } else {
        ends[col] = b.end;
      }
      cols.set(b.id, col);
    }
    const columnCount = Math.max(1, ends.length);
    for (const b of cluster) {
      result.set(b.id, {
        column: cols.get(b.id) ?? 0,
        columnCount,
      });
    }
  }
  return result;
}

export const CONFIG_VERSION = 1 as const;
export const CONFIG_FILE_NAME = "config.json";
export const CONFIG_CHANGED_EVENT = "config-changed";
export const APP_DISPLAY_NAME = "小日程";

export const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

/** 课表列顺序：周一 → 周日 */
export const WEEK_COLUMN_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export function defaultConfig(): AppConfig {
  const couple = defaultCouple();
  const now = new Date().toISOString();
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
    couple,
    soloMode: false,
    syncRelayUrl: "",
    coexistence: { current: null, log: [] },
    items: [
      {
        id: "sample-morning",
        start: "09:00",
        end: "10:00",
        title: "早餐或开工",
        note: "",
        weekdays: [1, 2, 3, 4, 5],
        enabled: true,
        recurrence: "weekly",
        tag: "life",
        skippedDates: [],
        owner: "self",
        ownerId: couple.memberId,
        updatedAt: now,
      },
      {
        id: "sample-deepwork",
        start: "14:00",
        end: "16:00",
        title: "专注时段",
        weekdays: [1, 2, 3, 4, 5],
        enabled: true,
        recurrence: "weekly",
        tag: "work",
        skippedDates: [],
        owner: "self",
        ownerId: couple.memberId,
        updatedAt: now,
      },
      {
        id: "sample-review",
        start: "20:00",
        end: "20:30",
        title: "收尾",
        weekdays: [0, 6],
        enabled: true,
        recurrence: "weekly",
        tag: "rest",
        skippedDates: [],
        owner: "self",
        ownerId: couple.memberId,
        updatedAt: now,
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
  const parsed = AppConfigSchema.parse(raw);
  const couple = parsed.couple ?? defaultCouple();
  const items = parsed.items.map((it) => {
    const ownerId = it.ownerId || couple.memberId;
    const owner: ItemOwner =
      it.owner ??
      (ownerId !== couple.memberId ? "partner" : "self");
    return {
      ...it,
      owner,
      ownerId,
      updatedAt: it.updatedAt || new Date().toISOString(),
    };
  });
  return {
    ...parsed,
    couple,
    soloMode: parsed.soloMode ?? false,
    coexistence: parsed.coexistence ?? { current: null, log: [] },
    items,
  };
}

export function safeParseAppConfig(raw: unknown) {
  const r = AppConfigSchema.safeParse(raw);
  if (!r.success) return r;
  return { success: true as const, data: parseAppConfig(r.data) };
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

export function itemSkippedDates(item: ScheduleItem): string[] {
  return item.skippedDates ?? [];
}

/**
 * 某次出现的锚点日期：非跨日即当天；跨日取起始日
 *（在次日列取消时也写起始日）。
 */
export function occurrenceAnchorDate(
  item: ScheduleItem,
  dateKey: string,
  weekday = parseDateKey(dateKey).getDay(),
): string {
  if (itemRecurrence(item) === "once") {
    return item.date ?? dateKey;
  }
  if (!isOvernightItem(item)) return dateKey;
  const prevWeekday = (weekday + 6) % 7;
  const onStartDay = item.weekdays.includes(weekday);
  const onEndDay = item.weekdays.includes(prevWeekday);
  if (onEndDay && !onStartDay) {
    const prev = parseDateKey(dateKey);
    prev.setDate(prev.getDate() - 1);
    return formatDateKey(prev);
  }
  return dateKey;
}

export function isOccurrenceSkipped(
  item: ScheduleItem,
  dateKey: string,
  weekday = parseDateKey(dateKey).getDay(),
) {
  if (itemRecurrence(item) !== "weekly") return false;
  const anchor = occurrenceAnchorDate(item, dateKey, weekday);
  return itemSkippedDates(item).includes(anchor);
}

export function itemOccursOnDate(
  item: ScheduleItem,
  dateKey: string,
  weekday = parseDateKey(dateKey).getDay(),
  dayOverrides: Record<string, DayOverride> = {},
) {
  if (!item.enabled) return false;

  if (itemRecurrence(item) === "once") {
    // 仅一次：按指定日期出现，不受放假/调休冲掉
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

  if (isOccurrenceSkipped(item, dateKey, weekday)) return false;

  // 周循环窗口：以本次出现的起始日为锚；activeFrom/activeUntil 均为含当日
  const anchor = occurrenceAnchorDate(item, dateKey, weekday);
  if (item.activeFrom && anchor < item.activeFrom) return false;
  if (item.activeUntil && anchor > item.activeUntil) return false;

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

function formatMonthDay(dateKey: string) {
  const d = parseDateKey(dateKey);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatScheduleScope(item: ScheduleItem) {
  if (itemRecurrence(item) === "once" && item.date) {
    const d = parseDateKey(item.date);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  const days = formatWeekdays(item.weekdays);
  const from = item.activeFrom ? formatMonthDay(item.activeFrom) : null;
  const until = item.activeUntil ? formatMonthDay(item.activeUntil) : null;
  if (from && until) return `${days} · ${from}–${until}`;
  if (from) return `${days} · ${from}起`;
  if (until) return `${days} · 至${until}`;
  return days;
}
