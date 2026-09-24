import { describe, expect, it } from "vitest";
import {
  ScheduleItemSchema,
  emptyConfig,
  getCurrentItem,
  isItemNow,
  isOvernightItem,
  itemOccursOnDate,
  itemSegmentOnDate,
  progressThroughItem,
  safeParseAppConfig,
} from "@/lib/config";
import { resolveDayState } from "@/lib/holidays";

const overnightWeekly = {
  id: "night",
  start: "22:00",
  end: "06:00",
  title: "值夜",
  weekdays: [1], // 周一晚 → 周二晨
  enabled: true,
  recurrence: "weekly" as const,
  tag: "work" as const,
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

  it("周视图片段：周一晚 + 周二晨", () => {
    expect(itemSegmentOnDate(overnightWeekly, "2026-09-21", 1)).toEqual({
      start: "22:00",
      end: "24:00",
    });
    expect(itemSegmentOnDate(overnightWeekly, "2026-09-22", 2)).toEqual({
      start: "00:00",
      end: "06:00",
    });
  });

  it("progress stays in 0–1", () => {
    const now = new Date(2026, 8, 21, 23, 0, 0);
    const p = progressThroughItem(overnightWeekly, now);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });
});

describe("holidays and work tag", () => {
  it("labels 2026-09-25 as Mid-Autumn off", () => {
    const d = resolveDayState("2026-09-25", {});
    expect(d.isOff).toBe(true);
    expect(d.name).toContain("中秋");
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
    };
    expect(itemOccursOnDate(item, "2026-09-25", 5, {})).toBe(false);
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
    };
    expect(itemOccursOnDate(commute, "2026-09-25", 5, {})).toBe(true);
    expect(itemOccursOnDate(study, "2026-09-25", 5, {})).toBe(true);
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
