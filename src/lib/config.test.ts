import { beforeAll, describe, expect, it } from "vitest";
import {
  ScheduleItemSchema,
  clockToCycleMinutes,
  columnCycleRanges,
  columnSegmentsOnDate,
  emptyConfig,
  formatCallChannelLabel,
  formatItemSpan,
  formatLowerBandHour,
  formatWorkDisplay,
  itemCycleSlice,
  getCurrentItem,
  getUpcomingItem,
  gridDayHours,
  gridViewSpanHours,
  isItemNow,
  isOvernightItem,
  itemCallChannel,
  itemOccursOnDate,
  itemSegmentOnDate,
  parseAppConfig,
  progressThroughItem,
  resolveOnceSpan,
  safeParseAppConfig,
} from "@/lib/config";
import { formatItemSubline } from "@/lib/schedule-style";
import { ensureHolidayData, resolveDayState } from "@/lib/holidays";

beforeAll(async () => {
  await ensureHolidayData();
});

const overnightWeekly = {
  id: "night",
  start: "22:00",
  end: "06:00",
  title: "值夜",
  weekdays: [1], // 周一晚 → 周二晨
  enabled: true,
  recurrence: "weekly" as const,
  tag: "work" as const,
  skippedDates: [] as string[],
};

describe("ScheduleItemSchema", () => {
  const base = {
    id: "1",
    start: "09:00",
    end: "10:00",
    title: "课",
    weekdays: [1],
    enabled: true,
    recurrence: "weekly" as const,
    tag: "work" as const,
  };

  it("rejects identical start and end", () => {
    const r = ScheduleItemSchema.safeParse({ ...base, end: "09:00" });
    expect(r.success).toBe(false);
  });

  it("allows overnight when end < start", () => {
    const r = ScheduleItemSchema.safeParse({
      ...base,
      start: "22:00",
      end: "06:00",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(isOvernightItem(r.data)).toBe(true);
  });

  it("keeps durationMinutes so a 24h or 48h call can share the same clock", () => {
    const call = {
      ...base,
      tag: "call" as const,
      callChannel: "phone" as const,
      title: "手机通话",
      recurrence: "once" as const,
      date: "2026-10-19",
      weekdays: [] as number[],
      start: "15:30",
      end: "15:30",
    };
    expect(
      ScheduleItemSchema.safeParse({ ...call, durationMinutes: 1440, date: "2026-10-20" })
        .success,
    ).toBe(true);
    const saved = ScheduleItemSchema.safeParse({ ...call, durationMinutes: 2880 });
    expect(saved.success).toBe(true);
    if (saved.success) expect(saved.data.durationMinutes).toBe(2880);
    expect(ScheduleItemSchema.safeParse(call).success).toBe(false);
  });

  it("accepts call tag with callChannel", () => {
    const r = ScheduleItemSchema.safeParse({
      ...base,
      tag: "call",
      callChannel: "wechat",
      title: "晚间通话",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tag).toBe("call");
      expect(r.data.callChannel).toBe("wechat");
    }
  });
});

describe("long call backfill", () => {
  const fortyEight = {
    id: "long",
    start: "15:30",
    end: "15:30",
    title: "手机通话",
    weekdays: [] as number[],
    enabled: true,
    recurrence: "once" as const,
    date: "2026-10-19",
    tag: "call" as const,
    callChannel: "phone" as const,
    durationMinutes: 2880,
    skippedDates: [] as string[],
  };
  const twentyFour = {
    ...fortyEight,
    id: "day",
    date: "2026-10-20",
    durationMinutes: 1440,
  };

  it("parse keeps durationMinutes", () => {
    const cfg = parseAppConfig({
      version: 1,
      showHolidays: true,
      widgetVisible: true,
      items: [fortyEight],
    });
    expect(cfg.items[0].durationMinutes).toBe(2880);
    expect(cfg.items[0].start).toBe("15:30");
    expect(cfg.items[0].end).toBe("15:30");
  });

  it("shows a 48h span across two midnights", () => {
    expect(itemOccursOnDate(fortyEight, "2026-10-19", 1)).toBe(true);
    expect(itemOccursOnDate(fortyEight, "2026-10-20", 2)).toBe(true);
    expect(itemOccursOnDate(fortyEight, "2026-10-21", 3)).toBe(true);
    expect(itemOccursOnDate(fortyEight, "2026-10-18", 0)).toBe(false);
    expect(itemOccursOnDate(fortyEight, "2026-10-22", 4)).toBe(false);
    expect(itemSegmentOnDate(fortyEight, "2026-10-19", 1)).toEqual({
      start: "15:30",
      end: "24:00",
    });
    expect(itemSegmentOnDate(fortyEight, "2026-10-20", 2)).toEqual({
      start: "00:00",
      end: "24:00",
    });
    expect(itemSegmentOnDate(fortyEight, "2026-10-21", 3)).toEqual({
      start: "00:00",
      end: "15:30",
    });
    const midnight = 17 * 60;
    const monday = itemCycleSlice(fortyEight, "2026-10-19", 7);
    const tuesday = itemCycleSlice(fortyEight, "2026-10-20", 7);
    const wednesday = itemCycleSlice(fortyEight, "2026-10-21", 7);
    expect(monday).toEqual({ startMin: 8.5 * 60, endMin: 24 * 60 });
    expect(tuesday).toEqual({ startMin: 0, endMin: 24 * 60 });
    expect(wednesday).toEqual({ startMin: 0, endMin: 8.5 * 60 });
    expect(monday && monday.startMin < midnight && monday.endMin > midnight).toBe(true);
    expect(tuesday && tuesday.startMin < midnight && tuesday.endMin > midnight).toBe(true);
    expect(formatItemSpan(fortyEight)).toBe("10月19日 15:30–10月21日 15:30");
    const middle = new Date(2026, 9, 20, 12, 0, 0);
    expect(isItemNow(fortyEight, middle)).toBe(true);
    expect(progressThroughItem(fortyEight, middle)).toBeCloseTo(20.5 / 48, 5);
  });

  it("shows a 24h span across one midnight", () => {
    expect(itemSegmentOnDate(twentyFour, "2026-10-20", 2)).toEqual({
      start: "15:30",
      end: "24:00",
    });
    expect(itemSegmentOnDate(twentyFour, "2026-10-21", 3)).toEqual({
      start: "00:00",
      end: "15:30",
    });
    expect(itemOccursOnDate(twentyFour, "2026-10-19", 1)).toBe(false);
    expect(formatItemSpan(twentyFour)).toBe("10月20日 15:30–10月21日 15:30");
    const during = new Date(2026, 9, 21, 3, 0, 0);
    expect(isItemNow(twentyFour, during)).toBe(true);
  });
});

describe("call tag migrate", () => {
  it("defaults missing callChannel to phone", () => {
    const cfg = parseAppConfig({
      version: 1,
      showHolidays: true,
      widgetVisible: true,
      items: [
        {
          id: "c1",
          start: "20:00",
          end: "21:00",
          title: "通话",
          weekdays: [1],
          enabled: true,
          tag: "call",
        },
      ],
    });
    expect(cfg.items[0].callChannel).toBe("phone");
    expect(itemCallChannel(cfg.items[0])).toBe("phone");
    expect(formatCallChannelLabel("phone")).toBe("手机通话");
    expect(formatItemSubline(cfg.items[0])).toBe("手机通话");
  });

  it("strips callChannel when tag is not call", () => {
    const cfg = parseAppConfig({
      version: 1,
      showHolidays: true,
      widgetVisible: true,
      items: [
        {
          id: "w1",
          start: "09:00",
          end: "10:00",
          title: "站会",
          weekdays: [1],
          enabled: true,
          tag: "work",
          callChannel: "wechat",
        },
      ],
    });
    expect(cfg.items[0].callChannel).toBeUndefined();
  });

  it("migrates legacy game tag and gamePlatform values", () => {
    const cfg = parseAppConfig({
      version: 1,
      showHolidays: true,
      widgetVisible: true,
      items: [
        {
          id: "g1",
          start: "21:00",
          end: "23:00",
          title: "开黑",
          weekdays: [5],
          enabled: true,
          tag: "game",
          gamePlatform: "steam",
          owner: "shared",
        },
        {
          id: "g2",
          start: "20:00",
          end: "21:00",
          title: "手游",
          weekdays: [6],
          enabled: true,
          tag: "game",
          gamePlatform: "wechat",
        },
      ],
    });
    expect(cfg.items[0].tag).toBe("entertainment");
    expect(cfg.items[1].tag).toBe("entertainment");
    expect(cfg.items[0].gamePlatform).toBe("pc");
    expect(formatItemSubline(cfg.items[0])).toBe("PC");
    expect(cfg.items[1].gamePlatform).toBe("mobile");
    expect(formatItemSubline(cfg.items[1])).toBe("手游");
  });
});

describe("work subtypes", () => {
  it("formats 上课 as 科目 · 班级", () => {
    expect(
      formatWorkDisplay({
        tag: "work",
        workKind: "class",
        workPrimary: "数学",
        workSecondary: "高一 1 班",
        title: "旧标题",
      }),
    ).toBe("数学 · 高一 1 班");
  });

  it("formats 带读 with required 对象/班级", () => {
    expect(
      formatWorkDisplay({
        tag: "work",
        workKind: "tutoring",
        workPrimary: "",
        workSecondary: "二年级",
        title: "旧标题",
      }),
    ).toBe("二年级");
    expect(
      formatWorkDisplay({
        tag: "work",
        workKind: "tutoring",
        workPrimary: "绘本",
        workSecondary: "二年级",
        title: "旧标题",
      }),
    ).toBe("绘本 · 二年级");
  });

  it("rejects 带读 without 对象/班级", () => {
    const r = ScheduleItemSchema.safeParse({
      id: "t",
      start: "09:00",
      end: "10:00",
      title: "x",
      weekdays: [],
      enabled: true,
      recurrence: "once",
      date: "2026-09-29",
      tag: "work",
      workKind: "tutoring",
      workPrimary: "绘本",
    });
    expect(r.success).toBe(false);
  });

  it("persists 换课 as once class item", () => {
    const cfg = parseAppConfig({
      version: 1,
      showHolidays: true,
      widgetVisible: true,
      items: [
        {
          id: "swap",
          start: "10:00",
          end: "11:00",
          title: "美术 · 五2",
          weekdays: [],
          enabled: true,
          recurrence: "once",
          date: "2026-09-30",
          tag: "work",
          workKind: "class",
          workPrimary: "美术",
          workSecondary: "五2",
          isCourseSwap: true,
        },
      ],
    });
    expect(cfg.items[0].isCourseSwap).toBe(true);
    expect(cfg.items[0].recurrence).toBe("once");
  });

  it("migrates old work items to other", () => {
    const cfg = parseAppConfig({
      version: 1,
      showHolidays: true,
      widgetVisible: true,
      items: [
        {
          id: "w",
          start: "09:00",
          end: "10:00",
          title: "站会",
          weekdays: [1],
          enabled: true,
          tag: "work",
        },
      ],
    });
    expect(cfg.items[0].workKind).toBe("other");
    expect(cfg.items[0].title).toBe("站会");
  });
});

describe("grid wrap window", () => {
  it("defaults to 07 → next-day 02 (19h view, 24h cycle)", () => {
    const cfg = emptyConfig();
    expect(cfg.gridStartHour).toBe(7);
    expect(cfg.gridEndHour).toBe(2);
    expect(gridViewSpanHours(7, 2)).toBe(19);
    expect(gridDayHours(7)).toHaveLength(24);
    expect(gridDayHours(7)[0]).toBe(7);
    expect(gridDayHours(7)[17]).toBe(0);
  });

  it("maps overnight clock into cycle offsets", () => {
    expect(clockToCycleMinutes("22:00", 7)).toBe(15 * 60);
    expect(clockToCycleMinutes("24:00", 7)).toBe(17 * 60);
    expect(clockToCycleMinutes("00:00", 7)).toBe(17 * 60);
    expect(clockToCycleMinutes("02:00", 7)).toBe(19 * 60);
    expect(clockToCycleMinutes("09:00", 7)).toBe(2 * 60);
  });
});

describe("周循环跨日 22:00–06:00", () => {
  it("周一 23:00 为 NOW", () => {
    // 2026-09-21 周一
    const now = new Date(2026, 8, 21, 23, 0, 0);
    expect(itemOccursOnDate(overnightWeekly, "2026-09-21", 1, {})).toBe(true);
    expect(isItemNow(overnightWeekly, now, {})).toBe(true);
    expect(getCurrentItem([overnightWeekly], now, {})?.id).toBe("night");
  });

  it("周二 03:00 仍为 NOW", () => {
    // 2026-09-22 周二
    const now = new Date(2026, 8, 22, 3, 0, 0);
    expect(itemOccursOnDate(overnightWeekly, "2026-09-22", 2, {})).toBe(true);
    expect(isItemNow(overnightWeekly, now, {})).toBe(true);
    expect(getCurrentItem([overnightWeekly], now, {})?.id).toBe("night");
  });

  it("周一 03:00 尚未开始", () => {
    const now = new Date(2026, 8, 21, 3, 0, 0);
    expect(isItemNow(overnightWeekly, now, {})).toBe(false);
    expect(getCurrentItem([overnightWeekly], now, {})).toBeNull();
  });

  it("周二 12:00 已结束", () => {
    const now = new Date(2026, 8, 22, 12, 0, 0);
    expect(isItemNow(overnightWeekly, now, {})).toBe(false);
  });

  it("周视图片段留在起始日列，结束日列不画凌晨尾巴", () => {
    expect(columnSegmentsOnDate(overnightWeekly, "2026-09-21", 1)).toEqual([
      { start: "22:00", end: "24:00" },
      { start: "00:00", end: "06:00" },
    ]);
    expect(columnSegmentsOnDate(overnightWeekly, "2026-09-22", 2)).toEqual([]);
    expect(columnCycleRanges(overnightWeekly, "2026-09-21", 1)).toEqual([
      { startMin: 15 * 60, endMin: 17 * 60, overnight: true },
      { startMin: 17 * 60, endMin: 23 * 60, overnight: true },
    ]);
    expect(columnCycleRanges(overnightWeekly, "2026-09-22", 2)).toEqual([]);
    expect(itemSegmentOnDate(overnightWeekly, "2026-09-21", 1)).toEqual({
      start: "22:00",
      end: "24:00",
    });
    expect(itemSegmentOnDate(overnightWeekly, "2026-09-22", 2)).toBeNull();
  });

  it("20日 22:00–06:00 落在 20 日列，直到 21 日 06:00", () => {
    const item = {
      ...overnightWeekly,
      id: "tue-night",
      weekdays: [2],
      tag: "life" as const,
    };
    // 2026-10-20 周二 → 21 日凌晨
    const on20 = columnSegmentsOnDate(item, "2026-10-20", 2, {}, 7);
    expect(on20).toEqual([
      { start: "22:00", end: "24:00" },
      { start: "00:00", end: "06:00" },
    ]);
    expect(columnSegmentsOnDate(item, "2026-10-21", 3, {}, 7)).toEqual([]);
    const evening = clockToCycleMinutes(on20[0].start, 7);
    const midnight = clockToCycleMinutes("24:00", 7);
    const morningStart = clockToCycleMinutes(on20[1].start, 7);
    const morningEnd = clockToCycleMinutes(on20[1].end, 7);
    expect(morningStart).toBe(midnight);
    expect(morningEnd).toBeGreaterThan(evening);
    expect(morningEnd).toBe(23 * 60);
    expect(formatLowerBandHour(0, "2026-10-20")).toBe("21日 00:00");
    expect(formatLowerBandHour(6, "2026-10-20")).toBe("21日 06:00");
  });

  it("进行中的夜班不会在次日晚上被当成又一次开始", () => {
    const item = {
      ...overnightWeekly,
      id: "tue-night",
      title: "夜班",
      weekdays: [2],
      tag: "life" as const,
    };
    const evening = new Date(2026, 9, 20, 23, 10, 0);
    const morning = new Date(2026, 9, 21, 3, 10, 0);
    expect(getUpcomingItem([item], evening)?.dateKey).toBe("2026-10-27");
    expect(getUpcomingItem([item], evening)?.item.id).toBe("tue-night");
    expect(getUpcomingItem([item], morning)?.dateKey).toBe("2026-10-27");
    const other = {
      id: "thu-work",
      start: "22:00",
      end: "23:00",
      title: "夜班工作",
      weekdays: [4],
      enabled: true,
      recurrence: "weekly" as const,
      tag: "life" as const,
      skippedDates: [] as string[],
    };
    expect(getUpcomingItem([item, other], morning)?.item.id).toBe("thu-work");
    expect(getUpcomingItem([item, other], morning)?.dateKey).toBe("2026-10-22");
  });

  it("progress stays in 0–1", () => {
    const now = new Date(2026, 8, 21, 23, 0, 0);
    const p = progressThroughItem(overnightWeekly, now);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });
});

describe("全天切片与跨多日", () => {
  const fullDay = {
    id: "full",
    start: "00:00",
    end: "23:59",
    title: "整天",
    weekdays: [] as number[],
    enabled: true,
    recurrence: "once" as const,
    date: "2026-10-17",
    tag: "life" as const,
    skippedDates: [] as string[],
  };

  it("00:00–23:59 在周列上有可见高度", () => {
    const saved = resolveOnceSpan({
      date: "2026-10-17",
      start: "00:00",
      endDate: "2026-10-17",
      end: "23:59",
    });
    expect(saved).toEqual({
      ok: true,
      date: "2026-10-17",
      start: "00:00",
      end: "23:59",
    });
    const on17 = columnCycleRanges(fullDay, "2026-10-17");
    const on16 = columnCycleRanges(fullDay, "2026-10-16");
    expect(on17).toEqual([
      { startMin: 0, endMin: 16 * 60 + 59, overnight: false },
    ]);
    expect(on16).toEqual([
      { startMin: 17 * 60, endMin: 24 * 60, overnight: false },
    ]);
    expect(on17[0].endMin).toBeGreaterThan(on17[0].startMin);
    expect(on16[0].endMin).toBeGreaterThan(on16[0].startMin);
    expect(columnCycleRanges(fullDay, "2026-10-18")).toEqual([]);
    const covered =
      on16[0].endMin - on16[0].startMin + (on17[0].endMin - on17[0].startMin);
    expect(covered).toBe(23 * 60 + 59);
    const noon = new Date(2026, 9, 17, 12, 0, 0);
    expect(isItemNow(fullDay, noon)).toBe(true);
    expect(getCurrentItem([fullDay], noon)?.id).toBe("full");
  });

  it("16日 13:40 到 18日 20:00 是一条，三天各画对应时段", () => {
    const span = resolveOnceSpan({
      date: "2026-10-16",
      start: "13:40",
      endDate: "2026-10-18",
      end: "20:00",
    });
    expect(span.ok).toBe(true);
    if (!span.ok) return;
    expect(span.endDate).toBe("2026-10-18");
    expect(span.durationMinutes).toBe(3260);
    const item = {
      id: "meet",
      start: span.start,
      end: span.end,
      title: "相处",
      weekdays: [] as number[],
      enabled: true,
      recurrence: "once" as const,
      date: span.date,
      endDate: span.endDate,
      durationMinutes: span.durationMinutes,
      tag: "life" as const,
      skippedDates: [] as string[],
    };
    expect(ScheduleItemSchema.safeParse(item).success).toBe(true);
    const parsed = parseAppConfig({
      version: 1,
      showHolidays: true,
      widgetVisible: true,
      items: [item],
    });
    expect(parsed.items[0].endDate).toBe("2026-10-18");
    expect(parsed.items[0].durationMinutes).toBe(3260);
    expect(itemSegmentOnDate(item, "2026-10-16")).toEqual({
      start: "13:40",
      end: "24:00",
    });
    expect(itemSegmentOnDate(item, "2026-10-17")).toEqual({
      start: "00:00",
      end: "24:00",
    });
    expect(itemSegmentOnDate(item, "2026-10-18")).toEqual({
      start: "00:00",
      end: "20:00",
    });
    expect(itemSegmentOnDate(item, "2026-10-15")).toBeNull();
    expect(itemSegmentOnDate(item, "2026-10-19")).toBeNull();

    expect(columnCycleRanges(item, "2026-10-16")).toEqual([
      { startMin: 6 * 60 + 40, endMin: 24 * 60, overnight: true },
    ]);
    expect(columnCycleRanges(item, "2026-10-17")).toEqual([
      { startMin: 0, endMin: 24 * 60, overnight: true },
    ]);
    expect(columnCycleRanges(item, "2026-10-18")).toEqual([
      { startMin: 0, endMin: 13 * 60, overnight: false },
    ]);
    expect(columnCycleRanges(item, "2026-10-15")).toEqual([]);
    expect(columnCycleRanges(item, "2026-10-19")).toEqual([]);
    const day16 = columnCycleRanges(item, "2026-10-16")[0];
    const day17 = columnCycleRanges(item, "2026-10-17")[0];
    const midnight = clockToCycleMinutes("00:00", 7);
    expect(day16.startMin).toBeLessThan(midnight);
    expect(day16.endMin).toBeGreaterThan(midnight);
    expect(day17.endMin).toBeGreaterThan(clockToCycleMinutes("23:59", 7));

    const duringMiddle = new Date(2026, 9, 17, 15, 0, 0);
    const duringLast = new Date(2026, 9, 18, 19, 0, 0);
    const ended = new Date(2026, 9, 18, 20, 0, 0);
    expect(isItemNow(item, duringMiddle)).toBe(true);
    expect(getCurrentItem([item], duringMiddle)?.id).toBe("meet");
    expect(isItemNow(item, duringLast)).toBe(true);
    expect(getCurrentItem([item], duringLast)?.id).toBe("meet");
    expect(isItemNow(item, ended)).toBe(false);
    expect(formatItemSpan(item)).toBe("10月16日 13:40–10月18日 20:00");
  });

  it("22:00–次日 06:00 不写成跨多日，仍留在起始日列", () => {
    expect(
      resolveOnceSpan({
        date: "2026-10-20",
        start: "22:00",
        endDate: "2026-10-21",
        end: "06:00",
      }),
    ).toEqual({
      ok: true,
      date: "2026-10-20",
      start: "22:00",
      end: "06:00",
    });
    expect(columnCycleRanges(overnightWeekly, "2026-09-21")).toEqual([
      { startMin: 15 * 60, endMin: 17 * 60, overnight: true },
      { startMin: 17 * 60, endMin: 23 * 60, overnight: true },
    ]);
    expect(columnCycleRanges(overnightWeekly, "2026-09-22")).toEqual([]);
    expect(columnSegmentsOnDate(overnightWeekly, "2026-09-22")).toEqual([]);
  });
});

describe("holidays and work tag", () => {
  it("labels 2026-09-25 as Mid-Autumn off", () => {
    const d = resolveDayState("2026-09-25", {});
    expect(d.isOff).toBe(true);
    expect(d.name).toContain("中秋");
  });

  it("shows Friday work weekly item on 2026-10-02 when marked 上班", () => {
    const item = {
      id: "makeup",
      start: "13:00",
      end: "14:00",
      title: "调休应出现",
      weekdays: [5],
      enabled: true,
      recurrence: "weekly" as const,
      tag: "work" as const,
      skippedDates: [] as string[],
    };
    const marked = { "2026-10-02": "work" as const };
    expect(resolveDayState("2026-10-02", {}).isOff).toBe(true);
    expect(itemOccursOnDate(item, "2026-10-02", 5, {})).toBe(false);
    expect(itemSegmentOnDate(item, "2026-10-02", 5, {})).toBeNull();
    expect(itemOccursOnDate(item, "2026-10-02", 5, marked)).toBe(true);
    expect(itemSegmentOnDate(item, "2026-10-02", 5, marked)).toEqual({
      start: "13:00",
      end: "14:00",
    });

    const life = { ...item, id: "life", tag: "life" as const, title: "放假仍在" };
    expect(itemOccursOnDate(life, "2026-10-02", 5, {})).toBe(true);
    expect(itemSegmentOnDate(life, "2026-10-02", 5, {})).toEqual({
      start: "13:00",
      end: "14:00",
    });
    const once = {
      ...item,
      id: "once",
      title: "国庆仅一次",
      weekdays: [] as number[],
      recurrence: "once" as const,
      date: "2026-10-02",
    };
    expect(itemOccursOnDate(once, "2026-10-02", 5, {})).toBe(true);
    expect(itemSegmentOnDate(once, "2026-10-02", 5, {})).toEqual({
      start: "13:00",
      end: "14:00",
    });
  });

  it("skips work weekly items on holiday", () => {
    const item = {
      id: "w",
      start: "09:00",
      end: "10:00",
      title: "科学",
      weekdays: [5],
      enabled: true,
      recurrence: "weekly" as const,
      tag: "work" as const,
      skippedDates: [],
    };
    expect(itemOccursOnDate(item, "2026-09-25", 5, {})).toBe(false);
  });

  it("keeps once work items on holiday", () => {
    const item = {
      id: "o",
      start: "09:00",
      end: "10:00",
      title: "中秋家宴",
      weekdays: [],
      enabled: true,
      recurrence: "once" as const,
      date: "2026-09-25",
      tag: "work" as const,
      skippedDates: [],
    };
    expect(itemOccursOnDate(item, "2026-09-25", 5, {})).toBe(true);
  });

  it("keeps commute and study on holiday", () => {
    const commute = {
      id: "c",
      start: "07:30",
      end: "08:20",
      title: "通勤",
      weekdays: [5],
      enabled: true,
      recurrence: "weekly" as const,
      tag: "commute" as const,
      skippedDates: [],
    };
    const study = {
      id: "s",
      start: "20:00",
      end: "21:00",
      title: "读书",
      weekdays: [5],
      enabled: true,
      recurrence: "weekly" as const,
      tag: "study" as const,
      skippedDates: [],
    };
    expect(itemOccursOnDate(commute, "2026-09-25", 5, {})).toBe(true);
    expect(itemOccursOnDate(study, "2026-09-25", 5, {})).toBe(true);
  });

  it("skips a single weekly occurrence by date", () => {
    const item = {
      id: "w",
      start: "09:00",
      end: "10:00",
      title: "站会",
      weekdays: [1],
      enabled: true,
      recurrence: "weekly" as const,
      tag: "work" as const,
      skippedDates: ["2026-09-21"],
    };
    expect(itemOccursOnDate(item, "2026-09-21", 1, {})).toBe(false);
    expect(itemOccursOnDate(item, "2026-09-28", 1, {})).toBe(true);
  });

  it("overnight skip uses start-day anchor on end day", () => {
    const item = {
      ...overnightWeekly,
      skippedDates: ["2026-09-21"],
    };
    expect(itemOccursOnDate(item, "2026-09-21", 1, {})).toBe(false);
    expect(itemOccursOnDate(item, "2026-09-22", 2, {})).toBe(false);
    expect(itemOccursOnDate(item, "2026-09-28", 1, {})).toBe(true);
  });

  it("respects weekly activeFrom date", () => {
    const item = {
      id: "w",
      start: "09:00",
      end: "10:00",
      title: "站会",
      weekdays: [1, 2, 3, 4, 5],
      enabled: true,
      recurrence: "weekly" as const,
      tag: "work" as const,
      skippedDates: [],
      activeFrom: "2026-09-24",
    };
    expect(itemOccursOnDate(item, "2026-09-23", 3, {})).toBe(false);
    expect(itemOccursOnDate(item, "2026-09-24", 4, {})).toBe(true);
    expect(itemOccursOnDate(item, "2026-09-28", 1, {})).toBe(true);
  });

  it("respects weekly activeUntil inclusive", () => {
    const item = {
      id: "w2",
      start: "09:00",
      end: "10:00",
      title: "课",
      weekdays: [1, 2, 3, 4, 5],
      enabled: true,
      recurrence: "weekly" as const,
      tag: "life" as const,
      skippedDates: [],
      activeFrom: "2026-09-21",
      activeUntil: "2026-09-25",
    };
    expect(itemOccursOnDate(item, "2026-09-25", 5, {})).toBe(true);
    expect(itemOccursOnDate(item, "2026-09-28", 1, {})).toBe(false);
  });
});

describe("emptyConfig", () => {
  it("has no sample items", () => {
    expect(emptyConfig().items).toEqual([]);
  });

  it("rejects corrupt app config", () => {
    const r = safeParseAppConfig({ version: 1, items: "bad" });
    expect(r.success).toBe(false);
  });
});
