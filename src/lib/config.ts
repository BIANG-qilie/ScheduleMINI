import { z } from "zod";
import { isDayOff } from "@/lib/holidays";
import { migrateSyncRelayUrl } from "@/lib/sync/relay";
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
  /**
   * 绑定快照的写入时间。空字符串表示还没往中继写过绑定。
   * 内容不变时保持原值，避免每次推送都改明文指纹、把对方从长轮询里叫醒。
   */
  bindingUpdatedAt: z.string().default(""),
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
    bindingUpdatedAt: "",
  };
}

export function isPaired(couple: CoupleIdentity) {
  return Boolean(couple.inviteCode && couple.partnerMemberId);
}

/** 设置里「邀请对方」一栏。未配对时是 null，界面改显示邀请码表单 */
export function pairBanner(couple: CoupleIdentity) {
  if (!isPaired(couple)) return null;
  return `已与「${partnerFacingName(couple)}」配对`;
}

/** 悬浮窗标题。未配对时不点出对方的名字 */
export function widgetCoupleTitle(couple: CoupleIdentity) {
  if (!isPaired(couple)) return "今日安排";
  return `${couple.selfName} · ${partnerFacingName(couple)}`;
}

export const RecurrenceSchema = z.enum(["weekly", "once"]);
export type Recurrence = z.infer<typeof RecurrenceSchema>;

/** 旧 tag=game → entertainment（标签文案「娱乐」） */
export function migrateScheduleTag(raw: unknown): unknown {
  if (raw === "game") return "entertainment";
  return raw;
}

export const ScheduleTagValues = [
  "work",
  "commute",
  "study",
  "rest",
  "life",
  "call",
  "entertainment",
  "social",
  "other",
] as const;

export const ScheduleTagSchema = z.preprocess(
  migrateScheduleTag,
  z.enum(ScheduleTagValues),
);
export type ScheduleTag = (typeof ScheduleTagValues)[number];

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

/** 娱乐平台（仅 tag=entertainment，可选；字段名沿用 gamePlatform） */
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
  entertainment: { label: "娱乐", respectsHolidays: false },
  social: { label: "社交", respectsHolidays: false },
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
  if ((item.tag ?? "work") !== "entertainment") return undefined;
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
    /**
     * once 的结束日期（YYYY-MM-DD）。
     * 跨过不止一夜时必填，和结束钟点一起决定真实结束时刻。
     * 只过一夜（结束钟点早于开始）不写，凌晨仍留在起始日列。
     */
    endDate: DateSchema.optional(),
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
    /** 娱乐平台；仅 tag=entertainment，可选 */
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
    /**
     * 仅一次的真实时长（分钟）。钟点相同或跨过不止一个午夜时，用它还原起止。
     * 缺省则仍按 start/end 钟点；旧端去掉该字段后只显示钟点。
     * 通话补录另有 48 小时上限；这里允许更长的一次日程。
     */
    durationMinutes: z.number().int().min(1).max(366 * 24 * 60).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.durationMinutes != null && (val.recurrence !== "once" || !val.date)) {
      ctx.addIssue({
        code: "custom",
        message: "时长只记在仅一次上",
        path: ["durationMinutes"],
      });
    }
    if (val.endDate && (val.recurrence !== "once" || !val.date)) {
      ctx.addIssue({
        code: "custom",
        message: "结束日期只记在仅一次上",
        path: ["endDate"],
      });
    }
    if (val.endDate && val.date && val.recurrence === "once") {
      if (val.endDate < val.date) {
        ctx.addIssue({
          code: "custom",
          message: "结束日期不能早于开始日期",
          path: ["endDate"],
        });
      } else if (val.endDate > val.date) {
        const startAt = parseDateKey(val.date);
        const [sh, sm] = val.start.split(":").map(Number);
        startAt.setHours(sh, sm, 0, 0);
        const endAt = parseDateKey(val.endDate);
        const [eh, em] = val.end.split(":").map(Number);
        endAt.setHours(eh, em, 0, 0);
        const minutes = Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
        if (minutes <= 0) {
          ctx.addIssue({
            code: "custom",
            message: "结束须晚于开始",
            path: ["endDate"],
          });
        } else if (
          val.durationMinutes != null &&
          val.durationMinutes !== minutes
        ) {
          ctx.addIssue({
            code: "custom",
            message: "时长和结束日期不一致",
            path: ["durationMinutes"],
          });
        }
      }
    }
    const sameClockSpansFullDays =
      val.durationMinutes != null && val.durationMinutes % (24 * 60) === 0;
    if (val.start === val.end && !sameClockSpansFullDays) {
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
     * 解析顺序为 设置值 > VITE_SYNC_RELAY_URL > 内置默认。
     * 保存过的旧 Railway 默认地址在解析时清成空。
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

/** 底带阈值：时长达到此时长的块不占列。[拟定] */
export const OVERLAP_BAND_MIN_MINUTES = 4 * 60;
/** 周视图一列里卡片的最小宽度。[拟定] */
export const WEEK_MIN_CARD_PX = 64;
/**
 * 手机日列里卡片的最小宽度。
 * 约 120px，一条里放得下两张可读标题；再挤就收成 +N，不再四张并排截断。
 */
export const DAY_MIN_CARD_PX = 120;

/** 条目真实跨度（分钟）。过夜按跨午夜累加；有 durationMinutes 时以它为准。 */
export function itemSpanMinutes(item: {
  start: string;
  end: string;
  durationMinutes?: number;
}) {
  if (item.durationMinutes != null && item.durationMinutes > 0) {
    return item.durationMinutes;
  }
  const [sh, sm] = item.start.split(":").map(Number);
  const [eh, em] = item.end.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (end > start) return end - start;
  if (end < start) return 24 * 60 - start + end;
  return 24 * 60;
}

/**
 * 长条背景：跨日、过夜、通话，或时长 ≥ 4 小时。
 * 这类块铺满列宽，不参加分列。
 */
export function isOverlapBand(input: {
  startMin: number;
  endMin: number;
  durationMin?: number;
  overnight?: boolean;
  spanned?: boolean;
  call?: boolean;
}) {
  if (input.call || input.overnight || input.spanned) return true;
  const minutes = input.durationMin ?? input.endMin - input.startMin;
  return minutes >= OVERLAP_BAND_MIN_MINUTES;
}

export type OverlapBlock = {
  id: string;
  start: number;
  end: number;
  /** 底带：不占列 */
  band?: boolean;
};

export type OverlapCardSlot = {
  column: number;
  /** 含自身，向右占几列 */
  span: number;
  columnCount: number;
};

export type OverlapPill = {
  id: string;
  start: number;
  end: number;
  column: number;
  span: number;
  columnCount: number;
  hiddenIds: string[];
};

export type OverlapLayout = {
  cards: Map<string, OverlapCardSlot>;
  bands: string[];
  pills: OverlapPill[];
  hiddenIds: string[];
};

function sortOverlapBlocks<T extends { id: string; start: number; end: number }>(
  blocks: T[],
) {
  return [...blocks].sort(
    (a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id),
  );
}

function clusterOverlapBlocks<T extends { start: number; end: number }>(
  sorted: T[],
) {
  const clusters: T[][] = [];
  let current: T[] = [];
  let clusterEnd = -Infinity;
  for (const block of sorted) {
    if (current.length === 0 || block.start < clusterEnd) {
      current.push(block);
      clusterEnd = Math.max(clusterEnd, block.end);
    } else {
      clusters.push(current);
      current = [block];
      clusterEnd = block.end;
    }
  }
  if (current.length) clusters.push(current);
  return clusters;
}

function columnsThatFit(laneWidth?: number, minCardWidth?: number) {
  if (laneWidth == null || minCardWidth == null) return Number.POSITIVE_INFINITY;
  if (!(laneWidth > 0) || !(minCardWidth > 0)) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.floor(laneWidth / minCardWidth));
}

type PlacedOverlap = OverlapBlock & { column: number };

function assignOverlapColumns(events: OverlapBlock[], maxColumns: number) {
  const ends: number[] = [];
  const placed: PlacedOverlap[] = [];
  const hidden: OverlapBlock[] = [];
  for (const event of events) {
    let column = ends.findIndex((end) => end <= event.start);
    if (column === -1) {
      if (ends.length >= maxColumns) {
        hidden.push(event);
        continue;
      }
      column = ends.length;
      ends.push(event.end);
    } else {
      ends[column] = event.end;
    }
    placed.push({ ...event, column });
  }
  return { placed, hidden, usedColumns: ends.length };
}

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
) {
  return a.start < b.end && b.start < a.end;
}

/**
 * 前景卡片：分簇、贪心分列，再向右伸到下一张挡住的列。
 * 列宽放不下最小宽度时，只留前 k−1 张，其余收成一颗 +N。
 * 同一重叠时段只出一颗，即使被收起的几项彼此不再相交。
 * +N 浮在右上角，不占列，留下的卡片仍向右铺满。
 * 未给列宽时不折叠。
 */
export function computeOverlapLayout(
  blocks: OverlapBlock[],
  options?: { laneWidth?: number; minCardWidth?: number },
): OverlapLayout {
  const sorted = sortOverlapBlocks(blocks);
  const bands = sorted.filter((block) => block.band).map((block) => block.id);
  const foreground = sorted.filter((block) => !block.band);
  const cards = new Map<string, OverlapCardSlot>();
  const pills: OverlapPill[] = [];
  const hiddenIds: string[] = [];
  const limit = columnsThatFit(options?.laneWidth, options?.minCardWidth);

  for (const group of clusterOverlapBlocks(foreground)) {
    const unlimited = assignOverlapColumns(group, Number.POSITIVE_INFINITY);
    const overflow = unlimited.usedColumns > limit;
    const packed = overflow
      ? assignOverlapColumns(group, Math.max(0, limit - 1))
      : unlimited;
    const columnCount = Math.max(1, packed.usedColumns);
    if (packed.hidden.length) {
      const ids = packed.hidden.map((block) => block.id);
      hiddenIds.push(...ids);
      const start = Math.min(...packed.hidden.map((block) => block.start));
      const end = Math.max(...packed.hidden.map((block) => block.end));
      pills.push({
        id: `+${ids.join("+")}`,
        start,
        end,
        column: Math.max(0, packed.usedColumns - 1),
        span: 1,
        columnCount,
        hiddenIds: ids,
      });
    }
    const obstacles = packed.placed;
    for (const event of packed.placed) {
      let span = columnCount - event.column;
      for (const other of obstacles) {
        if (other.id === event.id || other.column <= event.column) continue;
        if (!rangesOverlap(event, other)) continue;
        span = Math.min(span, other.column - event.column);
      }
      cards.set(event.id, {
        column: event.column,
        span: Math.max(1, span),
        columnCount,
      });
    }
  }

  return { cards, bands, pills, hiddenIds };
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
        tag === "entertainment"
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
    syncRelayUrl: migrateSyncRelayUrl(parsed.syncRelayUrl),
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
    const spanned = spannedDates(item, dateKey);
    if (spanned != null) return spanned;
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

export function itemDurationMinutes(item: { durationMinutes?: number }) {
  const minutes = item.durationMinutes;
  if (minutes == null || !Number.isInteger(minutes) || minutes <= 0) return undefined;
  return minutes;
}

/**
 * 带结束日期或 durationMinutes 的仅一次：真实起止。
 * 只过一夜（没有 endDate、也没有时长）返回 null，仍走钟点跨日。
 */
export function itemAbsoluteInterval(item: ScheduleItem) {
  if (itemRecurrence(item) !== "once" || !item.date) return null;
  const startAt = parseDateKey(item.date);
  const [hour, minute] = item.start.split(":").map(Number);
  startAt.setHours(hour, minute, 0, 0);
  if (item.endDate && item.endDate > item.date) {
    const endAt = parseDateKey(item.endDate);
    const [eh, em] = item.end.split(":").map(Number);
    endAt.setHours(eh, em, 0, 0);
    if (endAt.getTime() <= startAt.getTime()) return null;
    return { startAt, endAt };
  }
  const minutes = itemDurationMinutes(item);
  if (minutes == null) return null;
  return {
    startAt,
    endAt: new Date(startAt.getTime() + minutes * 60_000),
  };
}

/** 编辑器里仅一次的结束日期。只过一夜时是起始日的次日。 */
export function onceEndDate(item: ScheduleItem) {
  if (itemRecurrence(item) !== "once" || !item.date) return item.date ?? "";
  if (item.endDate) return item.endDate;
  const interval = itemAbsoluteInterval(item);
  if (interval) return formatDateKey(interval.endAt);
  if (isOvernightItem(item)) return shiftDateKey(item.date, 1);
  return item.date;
}

const ONCE_SPAN_MAX_MINUTES = 366 * 24 * 60;

/**
 * 仅一次的开始日期+钟点、结束日期+钟点。
 * 同一天，或只过一夜（结束日是次日且结束钟点更早）不写 endDate / 时长。
 * 更长的一段写成一条，时长可以超过通话补录的 48 小时。
 */
export function resolveOnceSpan(input: {
  date: string;
  start: string;
  endDate: string;
  end: string;
}):
  | {
      ok: true;
      date: string;
      start: string;
      end: string;
      endDate?: string;
      durationMinutes?: number;
    }
  | { ok: false; message: string } {
  if (!input.date || !input.endDate) {
    return { ok: false, message: "请选择开始和结束日期" };
  }
  if (!/^\d{2}:\d{2}$/.test(input.start) || !/^\d{2}:\d{2}$/.test(input.end)) {
    return { ok: false, message: "请填写开始和结束时间" };
  }
  const startAt = parseDateKey(input.date);
  const [sh, sm] = input.start.split(":").map(Number);
  startAt.setHours(sh, sm, 0, 0);
  const endAt = parseDateKey(input.endDate);
  const [eh, em] = input.end.split(":").map(Number);
  endAt.setHours(eh, em, 0, 0);
  if (endAt.getTime() <= startAt.getTime()) {
    return { ok: false, message: "结束须晚于开始" };
  }
  const minutes = Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
  if (minutes > ONCE_SPAN_MAX_MINUTES) {
    return { ok: false, message: "跨度不能超过一年" };
  }
  const classicOvernight =
    input.endDate === shiftDateKey(input.date, 1) &&
    compareTime(input.end, input.start) < 0;
  if (input.endDate === input.date || classicOvernight) {
    return {
      ok: true,
      date: input.date,
      start: input.start,
      end: input.end,
    };
  }
  return {
    ok: true,
    date: input.date,
    start: input.start,
    end: input.end,
    endDate: input.endDate,
    durationMinutes: minutes,
  };
}

function dayBounds(dateKey: string) {
  const start = parseDateKey(dateKey);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** 有真实时长时，按日历日判断是否相交；否则返回 null，走钟点规则。 */
function spannedDates(item: ScheduleItem, dateKey: string) {
  const interval = itemAbsoluteInterval(item);
  if (!interval) return null;
  const day = dayBounds(dateKey);
  return interval.startAt < day.end && interval.endAt > day.start;
}

export function formatItemSpan(item: ScheduleItem) {
  const interval = itemAbsoluteInterval(item);
  if (!interval) return `${item.start}–${item.end}`;
  const startKey = formatDateKey(interval.startAt);
  const endKey = formatDateKey(interval.endAt);
  const startClock = toHhmm(interval.startAt);
  const endClock = toHhmm(interval.endAt);
  if (startKey === endKey) return `${startClock}–${endClock}`;
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  return `${start.getMonth() + 1}月${start.getDate()}日 ${startClock}–${end.getMonth() + 1}月${end.getDate()}日 ${endClock}`;
}

/**
 * 周列窗口是「当日 gridStartHour → 次日同一钟点」。
 * 返回这段日程落在该列里的分钟偏移；跨过的午夜都在对应列里。
 */
export function itemCycleSlice(
  item: ScheduleItem,
  dateKey: string,
  cycleStartHour: number,
) {
  const interval = itemAbsoluteInterval(item);
  if (!interval) return null;
  const columnStart = parseDateKey(dateKey);
  columnStart.setHours(cycleStartHour, 0, 0, 0);
  const columnEnd = new Date(columnStart);
  columnEnd.setDate(columnEnd.getDate() + 1);
  const segStart = Math.max(interval.startAt.getTime(), columnStart.getTime());
  const segEnd = Math.min(interval.endAt.getTime(), columnEnd.getTime());
  if (segEnd <= segStart) return null;
  return {
    startMin: (segStart - columnStart.getTime()) / 60_000,
    endMin: (segEnd - columnStart.getTime()) / 60_000,
  };
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
 * 带真实时长的条目由 itemCycleSlice 按列切开，这里不重复给出钟点段。
 */
export function columnSegmentsOnDate(
  item: ScheduleItem,
  dateKey: string,
  weekday = parseDateKey(dateKey).getDay(),
  dayOverrides: Record<string, DayOverride> = {},
  cycleStartHour = 7,
): TimeSegment[] {
  if (!item.enabled) return [];
  if (itemAbsoluteInterval(item)) return [];
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

export type ColumnCycleRange = {
  startMin: number;
  endMin: number;
  /** 贴着午夜，周格上标「跨日」 */
  overnight: boolean;
};

function clockMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 把钟点段折进「当日 cycleStart → 次日 cycleStart」的分钟偏移。
 * 00:00–cycleStart 整段顶到列底，避免 07:00 被折成 0 后丢掉。
 */
function segmentCycleRange(
  segment: TimeSegment,
  cycleStartHour: number,
): ColumnCycleRange | null {
  const cycleStartLabel = `${String(cycleStartHour).padStart(2, "0")}:00`;
  let startMin = clockToCycleMinutes(segment.start, cycleStartHour);
  let endMin = clockToCycleMinutes(segment.end, cycleStartHour);
  if (segment.start === "00:00" && segment.end === cycleStartLabel) {
    endMin = 24 * 60;
  }
  if (endMin <= startMin) {
    if (segment.end === "24:00" || segment.end === "00:00") {
      endMin = Math.min(24 * 60, startMin + 40);
    } else {
      return null;
    }
  }
  return {
    startMin,
    endMin,
    overnight: segment.end === "24:00" || segment.start === "00:00",
  };
}

/**
 * 同一天里的钟点（结束晚于开始）。
 * 列的上半是当天 cycleStart 之后，下半是次日凌晨。
 * 00:00–23:59 因此会拆到前一列的下半和当天列的上半，两段都有高度。
 */
function sameDayColumnRanges(
  item: ScheduleItem,
  dateKey: string,
  weekday: number,
  dayOverrides: Record<string, DayOverride>,
  cycleStartHour: number,
): ColumnCycleRange[] {
  const ranges: ColumnCycleRange[] = [];
  const cycleStartMin = cycleStartHour * 60;
  const itemStart = clockMinutes(item.start);
  const itemEnd = clockMinutes(item.end);
  if (itemEnd <= itemStart) return ranges;

  const push = (
    occurDate: string,
    occurWeekday: number,
    windowStart: number,
    windowEnd: number,
    toCycle: (minute: number) => number,
  ) => {
    if (!itemOccursOnDate(item, occurDate, occurWeekday, dayOverrides)) return;
    const segStart = Math.max(itemStart, windowStart);
    const segEnd = Math.min(itemEnd, windowEnd);
    if (segEnd <= segStart) return;
    ranges.push({
      startMin: toCycle(segStart),
      endMin: toCycle(segEnd),
      overnight: false,
    });
  };

  push(dateKey, weekday, cycleStartMin, 24 * 60, (minute) => minute - cycleStartMin);
  if (cycleStartHour > 0) {
    const nextKey = shiftDateKey(dateKey, 1);
    const lowerOrigin = (24 - cycleStartHour) * 60;
    push(
      nextKey,
      parseDateKey(nextKey).getDay(),
      0,
      cycleStartMin,
      (minute) => lowerOrigin + minute,
    );
  }
  return ranges;
}

/**
 * 某一列要画的分钟区间（相对该列 0 点，也就是当日 gridStartHour）。
 * 有真实结束日期的跨天日程按列窗口切开；只过一夜仍整段落在起始日列。
 */
export function columnCycleRanges(
  item: ScheduleItem,
  dateKey: string,
  weekday = parseDateKey(dateKey).getDay(),
  dayOverrides: Record<string, DayOverride> = {},
  cycleStartHour = 7,
): ColumnCycleRange[] {
  if (!item.enabled) return [];
  if (itemAbsoluteInterval(item)) {
    const slice = itemCycleSlice(item, dateKey, cycleStartHour);
    if (!slice || slice.endMin <= slice.startMin) return [];
    const midnight = clockToCycleMinutes("00:00", cycleStartHour);
    return [
      {
        startMin: slice.startMin,
        endMin: slice.endMin,
        overnight: slice.startMin < midnight && slice.endMin > midnight,
      },
    ];
  }
  if (isOvernightItem(item)) {
    return columnSegmentsOnDate(
      item,
      dateKey,
      weekday,
      dayOverrides,
      cycleStartHour,
    )
      .map((segment) => segmentCycleRange(segment, cycleStartHour))
      .filter((range): range is ColumnCycleRange => range != null);
  }
  return sameDayColumnRanges(
    item,
    dateKey,
    weekday,
    dayOverrides,
    cycleStartHour,
  );
}

/**
 * 某一日历日上的第一段。
 * 有时长字段时按真实区间切到当日。
 * 无时长时取该列第一段：跨日凌晨留在起始日列，结束日列不再承接尾巴。
 */
export function itemSegmentOnDate(
  item: ScheduleItem,
  dateKey: string,
  weekday = parseDateKey(dateKey).getDay(),
  dayOverrides: Record<string, DayOverride> = {},
  cycleStartHour = 7,
): TimeSegment | null {
  const interval = itemAbsoluteInterval(item);
  if (interval) {
    if (!itemOccursOnDate(item, dateKey, weekday, dayOverrides)) return null;
    const day = dayBounds(dateKey);
    const segStart = new Date(Math.max(interval.startAt.getTime(), day.start.getTime()));
    const segEnd = new Date(Math.min(interval.endAt.getTime(), day.end.getTime()));
    if (segEnd.getTime() <= segStart.getTime()) return null;
    return {
      start: segStart.getTime() === day.start.getTime() ? "00:00" : toHhmm(segStart),
      end: segEnd.getTime() === day.end.getTime() ? "24:00" : toHhmm(segEnd),
    };
  }
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

/** 这一天是一次真正的开始，而不是跨日尾巴或补录的后续日 */
export function itemStartsOnDate(
  item: ScheduleItem,
  dateKey: string,
  weekday = parseDateKey(dateKey).getDay(),
  dayOverrides: Record<string, DayOverride> = {},
) {
  if (itemAbsoluteInterval(item)) {
    return (
      item.date === dateKey &&
      itemOccursOnDate(item, dateKey, weekday, dayOverrides)
    );
  }
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
  const interval = itemAbsoluteInterval(item);
  if (interval) {
    if (!item.enabled) return false;
    const nowMs = now.getTime();
    return nowMs >= interval.startAt.getTime() && nowMs < interval.endAt.getTime();
  }

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

export function msUntilItemEnd(item: ScheduleItem, now = new Date()) {
  const interval = itemAbsoluteInterval(item);
  if (interval) return interval.endAt.getTime() - now.getTime();
  return msUntilTime(item.end, now);
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
  const interval = itemAbsoluteInterval(item);
  if (interval) {
    const total = interval.endAt.getTime() - interval.startAt.getTime();
    if (total <= 0) return 1;
    const elapsed = now.getTime() - interval.startAt.getTime();
    return Math.min(1, Math.max(0, elapsed / total));
  }

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
    const startLabel = `${d.getMonth() + 1}月${d.getDate()}日`;
    const interval = itemAbsoluteInterval(item);
    if (interval) {
      const endKey = formatDateKey(interval.endAt);
      if (endKey !== item.date) {
        const end = parseDateKey(endKey);
        return `${startLabel}–${end.getMonth() + 1}月${end.getDate()}日`;
      }
    }
    return startLabel;
  }
  const days = formatWeekdays(item.weekdays);
  const from = item.activeFrom ? formatMonthDay(item.activeFrom) : null;
  const until = item.activeUntil ? formatMonthDay(item.activeUntil) : null;
  if (from && until) return `${days} · ${from}–${until}`;
  if (from) return `${days} · ${from}起`;
  if (until) return `${days} · 至${until}`;
  return days;
}
