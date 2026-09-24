import { describe, expect, it } from "vitest";
import {
  ScheduleItemSchema,
  emptyConfig,
  isCurrentItem,
  isOvernightItem,
  itemOccursOnDate,
  progressThroughItem,
  safeParseAppConfig,
} from "@/lib/config";
import { resolveDayState } from "@/lib/holidays";

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

describe("isCurrentItem overnight", () => {
  const overnight = {
    id: "n",
    start: "22:00",
    end: "06:00",
    title: "值夜",
    weekdays: [1],
    enabled: true,
    recurrence: "weekly" as const,
    tag: "work" as const,
  };

  it("is current late evening", () => {
    const now = new Date(2026, 8, 24, 23, 0, 0);
    expect(isCurrentItem(overnight, now)).toBe(true);
  });

  it("is current early morning", () => {
    const now = new Date(2026, 8, 25, 3, 0, 0);
    expect(isCurrentItem(overnight, now)).toBe(true);
  });

  it("is not current midday", () => {
    const now = new Date(2026, 8, 24, 12, 0, 0);
    expect(isCurrentItem(overnight, now)).toBe(false);
  });

  it("progress stays in 0–1 for overnight", () => {
    const now = new Date(2026, 8, 24, 23, 0, 0);
    const p = progressThroughItem(overnight, now);
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
