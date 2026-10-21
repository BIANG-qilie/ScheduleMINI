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

/** 称呼只留一个短标签，不写成一句留言 */
export const ADDRESS_MAX = 8;

export function normalizeAddress(raw: string) {
  return [...raw.trim().replace(/\s+/g, " ")].slice(0, ADDRESS_MAX).join("");
}

export const CoupleIdentitySchema = z.object({
  /** 稳定个人身份（selfId / personId）；多端须相同，与对方不同 */
  memberId: z.string().min(1),
  selfName: z.string().trim().min(1).default("我"),
  selfColor: HexColorSchema.default(DEFAULT_SELF_COLOR),
  partnerName: z.string().trim().min(1).default("对方"),
  partnerColor: HexColorSchema.default(DEFAULT_PARTNER_COLOR),
  /** 我给对方的称呼。空则展示回落到 partnerName */
  addressForThem: z
    .string()
    .default("")
    .transform((value) => normalizeAddress(value)),
  addressForThemAt: z.string().default(""),
  /** 对方给我的称呼 */
  addressForMe: z
    .string()
    .default("")
    .transform((value) => normalizeAddress(value)),
  addressForMeAt: z.string().default(""),
  inviteCode: z.string().nullable().optional(),
  partnerMemberId: z.string().nullable().optional(),
  pairedAt: z.string().nullable().optional(),
});
export type CoupleIdentity = z.infer<typeof CoupleIdentitySchema>;

export function partnerFacingName(
  couple: Pick<CoupleIdentity, "addressForThem" | "partnerName">,
) {
  return couple.addressForThem.trim() || couple.partnerName || "对方";
}

/** 对方给我的称呼。没设过就是空字符串 */
export function calledByPartner(couple: Pick<CoupleIdentity, "addressForMe">) {
  return couple.addressForMe.trim();
}

/** 主屏幕小组件上自己这一侧：有对方给的称呼时用称呼 */
export function selfWidgetName(
  couple: Pick<CoupleIdentity, "addressForMe" | "selfName">,
) {
  return couple.addressForMe.trim() || couple.selfName;
}

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
    addressForThem: "",
    addressForThemAt: "",
    addressForMe: "",
    addressForMeAt: "",
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
  "call",
  "game",
  "other",
]);
export type ScheduleTag = z.infer<typeof ScheduleTagSchema>;

/** 通话渠道（仅 tag=call） */
export const CallChannelSchema = z.enum([
  "phone",
  "douyin",
  "wechat",
  "other",
]);
export type CallChannel = z.infer<typeof CallChannelSchema>;

export const DEFAULT_CALL_CHANNEL: CallChannel = "phone";

export const CALL_CHANNEL_META: Record<CallChannel, { label: string }> = {
  phone: { label: "手机通话" },
  douyin: { label: "抖音通话" },
  wechat: { label: "微信通话" },
  other: { label: "其他通话" },
};

export const CALL_CHANNEL_OPTIONS = (
  Object.keys(CALL_CHANNEL_META) as CallChannel[]
).map((id) => ({ id, ...CALL_CHANNEL_META[id] }));

/** 游戏平台（仅 tag=game，可选） */
export const GamePlatformValues = ["mobile", "pc", "switch", "other"] as const;
export type GamePlatform = (typeof GamePlatformValues)[number];

/** 旧枚举 → 新枚举 */
const LEGACY_GAME_PLATFORM: Record<string, GamePlatform> = {
  wechat: "mobile",
  qq: "mobile",
  steam: "pc",
  switch: "switch",
  other: "other",
  mobile: "mobile",
  pc: "pc",
};

export function migrateGamePlatform(raw: unknown): GamePlatform | undefined {
  if (typeof raw !== "string") return undefined;
  return LEGACY_GAME_PLATFORM[raw];
}

export const GamePlatformSchema = z.preprocess(
  (val) => migrateGamePlatform(val) ?? val,
  z.enum(GamePlatformValues),
);

export const GAME_PLATFORM_META: Record<GamePlatform, { label: string }> = {
  mobile: { label: "手游" },
  pc: { label: "PC" },
  switch: { label: "Switch" },
  other: { label: "其他" },
};

export const GAME_PLATFORM_OPTIONS = GamePlatformValues.map((id) => ({
  id,
  ...GAME_PLATFORM_META[id],
}));

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
  call: { label: "通话", respectsHolidays: false },
  game: { label: "游戏", respectsHolidays: false },
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

export function formatCallChannelLabel(channel: CallChannel) {
  return CALL_CHANNEL_META[channel]?.label ?? channel;
}

export function itemCallChannel(item: {
  tag?: ScheduleTag;
  callChannel?: CallChannel;
}): CallChannel | undefined {
  if ((item.tag ?? "work") !== "call") return undefined;
  return item.callChannel ?? DEFAULT_CALL_CHANNEL;
}

export function formatGamePlatformLabel(platform: GamePlatform) {
  return GAME_PLATFORM_META[platform]?.label ?? platform;
}

export function itemGamePlatform(item: {
  tag?: ScheduleTag;
  gamePlatform?: GamePlatform;
}): GamePlatform | undefined {
  if ((item.tag ?? "work") !== "game") return undefined;
  return item.gamePlatform;
}

/** 工作子类型：上课 / 带读 / 编程 / 其他工作 */
export const WorkKindSchema = z.enum([
  "class",
  "tutoring",
  "coding",
  "other",
]);
export type WorkKind = z.infer<typeof WorkKindSchema>;

export const DEFAULT_WORK_KIND: WorkKind = "other";

export type WorkRequiredField = "primary" | "secondary" | "title";

export const WORK_KIND_META: Record<
  WorkKind,
  {
    label: string;
    primaryLabel: string;
    secondaryLabel: string;
    primaryPlaceholder: string;
    secondaryPlaceholder: string;
    /** 必填字段；带读为对象/班级（secondary） */
    requiredField: WorkRequiredField;
  }
> = {
  class: {
    label: "上课",
    primaryLabel: "科目",
    secondaryLabel: "班级",
    primaryPlaceholder: "例如：数学",
    secondaryPlaceholder: "例如：高一 1 班",
    requiredField: "primary",
  },
  tutoring: {
    label: "带读",
    primaryLabel: "读本 / 材料",
    secondaryLabel: "对象 / 班级",
    primaryPlaceholder: "例如：绘本《月亮的味道》",
    secondaryPlaceholder: "例如：二年级 / 高一 1 班",
    requiredField: "secondary",
  },
  coding: {
    label: "编程",
    primaryLabel: "项目 / 主题",
    secondaryLabel: "语言 / 栈",
    primaryPlaceholder: "例如：小日程桌面端",
    secondaryPlaceholder: "例如：TypeScript",
    requiredField: "primary",
  },
  other: {
    label: "其他工作",
    primaryLabel: "标题 / 内容",
    secondaryLabel: "",
    primaryPlaceholder: "例如：站会、深度工作、约谈",
    secondaryPlaceholder: "",
    requiredField: "title",
  },
};

export const WORK_KIND_OPTIONS = (
  Object.keys(WORK_KIND_META) as WorkKind[]
).map((id) => ({ id, ...WORK_KIND_META[id] }));

export function formatWorkKindLabel(kind: WorkKind) {
  return WORK_KIND_META[kind]?.label ?? kind;
}

/** 工作展示：`主 · 次`（有则拼）；带读可仅对象/班级；旧数据回退 title */
export function formatWorkDisplay(item: {
  tag?: ScheduleTag;
  workKind?: WorkKind;
  workPrimary?: string;
  workSecondary?: string;
  title: string;
}): string {
  if ((item.tag ?? "work") !== "work") return item.title;
  const kind = item.workKind ?? DEFAULT_WORK_KIND;
  if (kind === "other") return item.title;
  const primary = item.workPrimary?.trim();
  const secondary = item.workSecondary?.trim();
  if (kind === "tutoring") {
    if (!secondary) return item.title;
    return primary ? `${primary} · ${secondary}` : secondary;
  }
  if (!primary) return item.title;
  return secondary ? `${primary} · ${secondary}` : primary;
}

export function workKindRequiredField(kind: WorkKind): WorkRequiredField {
  return WORK_KIND_META[kind].requiredField;
}

/** 周/列表/小窗主标题 */
export function itemDisplayTitle(item: {
  tag?: ScheduleTag;
  workKind?: WorkKind;
  workPrimary?: string;
  workSecondary?: string;
  title: string;
}): string {
  if ((item.tag ?? "work") === "work") return formatWorkDisplay(item);
  return item.title;
}

export function itemWorkKind(item: {
  tag?: ScheduleTag;
  workKind?: WorkKind;
}): WorkKind | undefined {
  if ((item.tag ?? "work") !== "work") return undefined;
  return item.workKind ?? DEFAULT_WORK_KIND;
}

export function itemIsCourseSwap(item: {
  tag?: ScheduleTag;
  workKind?: WorkKind;
  isCourseSwap?: boolean;
}): boolean {
  return (
    (item.tag ?? "work") === "work" &&
    (item.workKind ?? DEFAULT_WORK_KIND) === "class" &&
    !!item.isCourseSwap
  );
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
    /** 通话渠道；仅 tag=call 有意义，旧数据缺省在 parse 时补 phone */
    callChannel: CallChannelSchema.optional(),
    /** 游戏平台；仅 tag=game，可选 */
    gamePlatform: GamePlatformSchema.optional(),
    /** 工作子类型；仅 tag=work；旧数据缺省 other */
    workKind: WorkKindSchema.optional(),
    /** 工作主字段：科目 / 读本 / 项目 */
    workPrimary: z.string().trim().optional(),
    /** 工作次字段：班级 / 对象 / 语言 */
    workSecondary: z.string().trim().optional(),
    /** 上课换课：仅一次代课/调课，带琥珀虚线提示 */
    isCourseSwap: z.boolean().optional(),
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
    if (val.tag === "work") {
      const kind = val.workKind ?? DEFAULT_WORK_KIND;
      const required = WORK_KIND_META[kind].requiredField;
      if (required === "primary" && !val.workPrimary?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: `请填写${WORK_KIND_META[kind].primaryLabel}`,
          path: ["workPrimary"],
        });
      }
      if (required === "secondary" && !val.workSecondary?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: `请填写${WORK_KIND_META[kind].secondaryLabel}`,
          path: ["workSecondary"],
        });
      }
      if (val.isCourseSwap && kind !== "class") {
        ctx.addIssue({
          code: "custom",
          message: "换课仅适用于上课",
          path: ["isCourseSwap"],
        });
      }
      if (val.isCourseSwap && val.recurrence !== "once") {
        ctx.addIssue({
          code: "custom",
          message: "换课须为仅一次",
          path: ["recurrence"],
        });
      }
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
    /** 周列日周期起点（含）；网格按此时起绕满 24h，可滚动 */
    gridStartHour: z.number().int().min(0).max(23).default(7),
    /**
     * 默认可视窗口终点（不含）。
     * 若 ≤ start 则表示次日该点（如 7→2 = 07:00–次日 02:00）。
     */
    gridEndHour: z.number().int().min(0).max(23).default(2),
    dayOverrides: z.record(z.string(), DayOverrideSchema).default({}),
    couple: CoupleIdentitySchema.default(() => defaultCouple()),
    /** 单人模式：悬浮窗不强调对方栏；本地仍可编双方/共同日程 */
    soloMode: z.boolean().default(false),
    /**
     * 同步中继基址。空字符串表示未自定义：
     * 解析顺序为 设置值 > VITE_SYNC_RELAY_URL > 内置 Railway 默认。
     */
    syncRelayUrl: z.string().default(""),
    /** 同步删除墓碑：条目 id → 删除时间（ISO） */
    deletedItems: z.record(z.string(), z.string()).default({}),
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
        /** 会话最后一次变更。空字符串表示还没同步过 */
        updatedAt: z.string().default(""),
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
      .default({ current: null, updatedAt: "", log: [] }),
    items: z.array(ScheduleItemSchema),
  })
  .superRefine((val, ctx) => {
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
  if (o === "partner") return partnerFacingName(couple);
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

/**
 * 周视图表视口跨度（小时）。
 * end ≤ start 表示跨午夜到次日 end；相等为整日 24h。
 */
export function gridViewSpanHours(start: number, end: number): number {
  if (start === end) return 24;
  if (end > start) return end - start;
  return 24 - start + end;
}

/** 从 cycleStart 起绕一圈的 24 个钟点 */
export function gridDayHours(cycleStartHour: number): number[] {
  return Array.from({ length: 24 }, (_, i) => (cycleStartHour + i) % 24);
}

/** 钟点相对日周期起点的分钟（0 … 24×60） */
export function clockToCycleMinutes(
  hhmm: string,
  cycleStartHour: number,
): number {
  if (hhmm === "24:00") {
    // 日历日末 = 次日 00:00
    let delta = 0 - cycleStartHour * 60;
    if (delta <= 0) delta += 24 * 60;
    return delta;
  }
  const [h, m] = hhmm.split(":").map(Number);
  let delta = h * 60 + m - cycleStartHour * 60;
  if (delta < 0) delta += 24 * 60;
  return delta;
}

export function formatGridHourLabel(hour: number, cycleStartHour: number) {
  const label = `${String(hour).padStart(2, "0")}:00`;
  // 周期内落到凌晨且钟点 < 起点 → 次日
  if (hour < cycleStartHour) return `次日 ${label}`;
  return label;
}

export function shiftDateKey(dateKey: string, days: number) {
  const next = parseDateKey(dateKey);
  next.setDate(next.getDate() + days);
  return formatDateKey(next);
}

/**
 * 周列下半段（钟点早于日周期起点）是下一日历日。
 * 20 日列的 00:00 读作「21日 00:00」，不是再下一列的凌晨。
 */
export function formatLowerBandHour(hour: number, columnDateKey: string) {
  const day = Number(shiftDateKey(columnDateKey, 1).slice(8, 10));
  const hh = String(hour).padStart(2, "0");
  return `${day}日 ${hh}:00`;
}

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
    gridEndHour: 2,
    dayOverrides: {},
    couple,
    soloMode: false,
    syncRelayUrl: "",
    deletedItems: {},
    coexistence: { current: null, updatedAt: "", log: [] },
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
    const tag = it.tag ?? "work";
    return {
      ...it,
      tag,
      owner,
      ownerId,
      updatedAt: it.updatedAt || new Date().toISOString(),
      callChannel:
        tag === "call" ? (it.callChannel ?? DEFAULT_CALL_CHANNEL) : undefined,
      gamePlatform:
        tag === "game"
          ? migrateGamePlatform(it.gamePlatform) ?? it.gamePlatform
          : undefined,
      workKind: tag === "work" ? (it.workKind ?? DEFAULT_WORK_KIND) : undefined,
      workPrimary: tag === "work" ? it.workPrimary : undefined,
      workSecondary: tag === "work" ? it.workSecondary : undefined,
      isCourseSwap:
        tag === "work" &&
        (it.workKind ?? DEFAULT_WORK_KIND) === "class" &&
        it.isCourseSwap
          ? true
          : undefined,
      origin: tag === "commute" ? it.origin : undefined,
      destination: tag === "commute" ? it.destination : undefined,
    };
  });
  return {
    ...parsed,
    couple,
    soloMode: parsed.soloMode ?? false,
    coexistence: parsed.coexistence ?? {
      current: null,
      updatedAt: "",
      log: [],
    },
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

export type TimeSegment = { start: string; end: string };

function overnightStartsOn(
  item: ScheduleItem,
  dateKey: string,
  weekday: number,
) {
  if (itemRecurrence(item) === "once") return item.date === dateKey;
  return item.weekdays.includes(weekday);
}

/** 00:00–end 整段落在起始日列的下半段（次日凌晨），而不是下一列 */
function morningFitsStartColumn(end: string, cycleStartHour: number) {
  if (cycleStartHour <= 0) return false;
  const [h, m] = end.split(":").map(Number);
  return h * 60 + m <= cycleStartHour * 60;
}

/**
 * 某一列要画的片段。
 * 跨日的凌晨留在起始日列：20 日 22:00–06:00 是该列里的
 * 22:00–24:00 再接 21日 00:00–06:00。下一列的 00:00 已是再下一天。
 * 次日若因放假不再发生，凌晨段不画，晚上收到 24:00。
 */
export function columnSegmentsOnDate(
  item: ScheduleItem,
  dateKey: string,
  weekday = parseDateKey(dateKey).getDay(),
  dayOverrides: Record<string, DayOverride> = {},
  cycleStartHour = 7,
): TimeSegment[] {
  if (!item.enabled) return [];
  if (!isOvernightItem(item)) {
    if (!itemOccursOnDate(item, dateKey, weekday, dayOverrides)) return [];
    return [{ start: item.start, end: item.end }];
  }

  const onStart = overnightStartsOn(item, dateKey, weekday);
  if (onStart && itemOccursOnDate(item, dateKey, weekday, dayOverrides)) {
    const parts: TimeSegment[] = [{ start: item.start, end: "24:00" }];
    const nextKey = shiftDateKey(dateKey, 1);
    const next = parseDateKey(nextKey);
    if (
      itemOccursOnDate(item, nextKey, next.getDay(), dayOverrides) &&
      morningFitsStartColumn(item.end, cycleStartHour)
    ) {
      parts.push({ start: "00:00", end: item.end });
    }
    return parts;
  }

  // 日周期从 0 点起时没有「次日」下半段，凌晨才落到结束日列的顶部
  const prevKey = shiftDateKey(dateKey, -1);
  const prev = parseDateKey(prevKey);
  const continuesHere =
    itemOccursOnDate(item, dateKey, weekday, dayOverrides) &&
    overnightStartsOn(item, prevKey, prev.getDay());
  if (continuesHere && !morningFitsStartColumn(item.end, cycleStartHour)) {
    return [{ start: "00:00", end: item.end }];
  }
  return [];
}

/**
 * 跨日条目在某一列的第一段。完整放置用 columnSegmentsOnDate。
 * 非跨日：start→end。跨日起始日：start→24:00。结束日列不承接凌晨尾巴。
 */
export function itemSegmentOnDate(
  item: ScheduleItem,
  dateKey: string,
  weekday = parseDateKey(dateKey).getDay(),
  dayOverrides: Record<string, DayOverride> = {},
  cycleStartHour = 7,
): TimeSegment | null {
  return (
    columnSegmentsOnDate(
      item,
      dateKey,
      weekday,
      dayOverrides,
      cycleStartHour,
    )[0] ?? null
  );
}

/** 这一天是一次真正的开始，而不是跨日尾巴 */
export function itemStartsOnDate(
  item: ScheduleItem,
  dateKey: string,
  weekday = parseDateKey(dateKey).getDay(),
  dayOverrides: Record<string, DayOverride> = {},
) {
  if (!itemOccursOnDate(item, dateKey, weekday, dayOverrides)) return false;
  if (!isOvernightItem(item)) return true;
  return overnightStartsOn(item, dateKey, weekday);
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

  const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
  // 含整整一周后的同一次开始（周三夜里仍在进行时，下一次是下周三）
  for (let offset = 0; offset <= horizonDays; offset++) {
    const day = new Date(now);
    day.setHours(12, 0, 0, 0);
    day.setDate(now.getDate() + offset);
    const dateKey = formatDateKey(day);
    const weekday = day.getDay();

    for (const item of items) {
      if (!itemStartsOnDate(item, dateKey, weekday, dayOverrides)) continue;
      const [h, m] = item.start.split(":").map(Number);
      const at = new Date(day);
      at.setHours(h, m, 0, 0);
      if (at.getTime() <= now.getTime()) continue;
      if (at.getTime() - now.getTime() > horizonMs) continue;
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
