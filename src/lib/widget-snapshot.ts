import {
  formatDateKey,
  formatItemSpan,
  parseDateKey,
  formatTagLabel,
  isOvernightItem,
  itemAbsoluteInterval,
  itemDisplayTitle,
  itemOccursOnDate,
  itemStartsOnDate,
  itemTag,
  partnerFacingName,
  selfWidgetName,
  type AppConfig,
  type DayOverride,
  type ScheduleItem,
} from "@/lib/config";
import { ensureHolidayData } from "@/lib/holidays";
import { TAG_BAR } from "@/lib/schedule-style";
import { lanePartnerItems, laneSelfItems } from "@/lib/sync/couple";

/** 与配置写在同一目录，桌面小组件只读这一份派生快照 */
export const WIDGET_SNAPSHOT_FILE = "widget-snapshot.json";

const HORIZON_DAYS = 60;

export type WidgetOccurrence = {
  startMs: number;
  endMs: number;
  /** 起始日，YYYY-MM-DD，本地时区 */
  startDate: string;
  /** 开始钟点，重叠时与应用内「此刻」同一顺序 */
  sortKey: string;
  title: string;
  time: string;
  tag: string;
  tagColor: string;
};

export type WidgetSnapshot = {
  version: 1;
  /** 快照覆盖到的时刻；过了这个时间，小组件请用户打开应用 */
  untilMs: number;
  selfName: string;
  partnerName: string;
  selfColor: string;
  partnerColor: string;
  self: WidgetOccurrence[];
  partner: WidgetOccurrence[];
};

export type HomeWidgetMode = "self" | "partner" | "both";

export type WidgetLaneText = {
  name: string;
  ownerColor: string;
  headline: string;
  time: string;
  tag: string;
  tagColor: string;
  next: string;
};

export type HomeWidgetText = {
  mode: HomeWidgetMode;
  kicker: string;
  empty: boolean;
  emptyMessage: string;
  lanes: WidgetLaneText[];
};

function atLocal(day: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const next = new Date(day);
  next.setHours(h, m, 0, 0);
  return next;
}

function startsOn(
  item: ScheduleItem,
  dateKey: string,
  weekday: number,
  dayOverrides: Record<string, DayOverride>,
) {
  return itemStartsOnDate(item, dateKey, weekday, dayOverrides);
}

function expandLane(
  items: ScheduleItem[],
  dayOverrides: Record<string, DayOverride>,
  origin: Date,
) {
  const out: WidgetOccurrence[] = [];
  for (let offset = 0; offset <= HORIZON_DAYS; offset++) {
    const day = new Date(origin);
    day.setDate(origin.getDate() + offset);
    const dateKey = formatDateKey(day);
    const weekday = day.getDay();
    for (const item of items) {
      const interval = itemAbsoluteInterval(item);
      if (interval && item.date) {
        const dayStart = parseDateKey(dateKey);
        dayStart.setHours(0, 0, 0, 0);
        const startedHere = item.date === dateKey;
        const carried =
          offset === 0 && item.date < dateKey && interval.endAt > dayStart;
        if (startedHere || carried) {
          const tag = itemTag(item);
          out.push({
            startMs: interval.startAt.getTime(),
            endMs: interval.endAt.getTime(),
            startDate: item.date,
            sortKey: item.start,
            title: itemDisplayTitle(item),
            time: formatItemSpan(item),
            tag: formatTagLabel(tag),
            tagColor: TAG_BAR[tag],
          });
        }
        continue;
      }
      if (!startsOn(item, dateKey, weekday, dayOverrides)) continue;
      const start = atLocal(day, item.start);
      const end = atLocal(day, item.end);
      if (isOvernightItem(item)) {
        const next = new Date(day);
        next.setDate(day.getDate() + 1);
        end.setDate(end.getDate() + 1);
        // 次日若不再发生（例如工作周循环跨进假日），午夜截止
        if (!itemOccursOnDate(item, formatDateKey(next), next.getDay(), dayOverrides)) {
          end.setTime(atLocal(next, "00:00").getTime());
        }
      }
      const tag = itemTag(item);
      out.push({
        startMs: start.getTime(),
        endMs: end.getTime(),
        startDate: dateKey,
        sortKey: item.start,
        title: itemDisplayTitle(item),
        time: `${item.start}–${item.end}`,
        tag: formatTagLabel(tag),
        tagColor: TAG_BAR[tag],
      });
    }
  }
  return out;
}

/** 把应用里的出现规则展开成小组件能直接比较的时间段 */
export async function buildWidgetSnapshot(
  config: AppConfig,
  now = new Date(),
): Promise<WidgetSnapshot> {
  await ensureHolidayData();
  const origin = new Date(now);
  origin.setHours(12, 0, 0, 0);
  origin.setDate(origin.getDate() - 1);
  const horizonEnd = new Date(origin);
  horizonEnd.setDate(origin.getDate() + HORIZON_DAYS + 1);
  horizonEnd.setHours(12, 0, 0, 0);
  const overrides = config.dayOverrides;
  return {
    version: 1,
    untilMs: horizonEnd.getTime(),
    selfName: selfWidgetName(config.couple),
    partnerName: partnerFacingName(config.couple),
    selfColor: config.couple.selfColor,
    partnerColor: config.couple.partnerColor,
    self: expandLane(laneSelfItems(config.items), overrides, origin),
    partner: expandLane(lanePartnerItems(config.items), overrides, origin),
  };
}

function currentOf(items: WidgetOccurrence[], nowMs: number) {
  const hits = items.filter((item) => item.startMs <= nowMs && nowMs < item.endMs);
  hits.sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.startMs - b.startMs);
  return hits[0] ?? null;
}

function nextToday(items: WidgetOccurrence[], now: Date) {
  const today = formatDateKey(now);
  const nowMs = now.getTime();
  const hits = items.filter(
    (item) => item.startDate === today && item.startMs > nowMs,
  );
  hits.sort((a, b) => a.startMs - b.startMs);
  return hits[0] ?? null;
}

function laneText(
  name: string,
  color: string,
  items: WidgetOccurrence[],
  now: Date,
): WidgetLaneText {
  const current = currentOf(items, now.getTime());
  if (current) {
    return {
      name,
      ownerColor: color,
      headline: current.title,
      time: current.time,
      tag: current.tag,
      tagColor: current.tagColor,
      next: "",
    };
  }
  const upcoming = nextToday(items, now);
  return {
    name,
    ownerColor: color,
    headline: "空闲",
    time: "",
    tag: "",
    tagColor: "",
    next: upcoming ? `下一程 ${upcoming.title} ${upcoming.time}` : "",
  };
}

const KICKER: Record<HomeWidgetMode, string> = {
  self: "自己",
  partner: "对方",
  both: "双方",
};

/** 快照 + 模式 + 现在 → 小组件上的字 */
export function renderHomeWidget(
  snapshot: WidgetSnapshot | null,
  mode: HomeWidgetMode,
  now = new Date(),
): HomeWidgetText {
  if (!snapshot || snapshot.version !== 1) {
    return {
      mode,
      kicker: KICKER[mode],
      empty: true,
      emptyMessage: "打开小日程，日程会出现在这里",
      lanes: [],
    };
  }
  if (now.getTime() > snapshot.untilMs) {
    return {
      mode,
      kicker: KICKER[mode],
      empty: true,
      emptyMessage: "打开小日程更新",
      lanes: [],
    };
  }
  const self = laneText(snapshot.selfName, snapshot.selfColor, snapshot.self, now);
  const partner = laneText(
    snapshot.partnerName,
    snapshot.partnerColor,
    snapshot.partner,
    now,
  );
  const lanes =
    mode === "self" ? [self] : mode === "partner" ? [partner] : [self, partner];
  return {
    mode,
    kicker: KICKER[mode],
    empty: false,
    emptyMessage: "",
    lanes,
  };
}
