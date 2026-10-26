import { describe, expect, it } from "vitest";
import { columnCycleRanges, emptyConfig, parseAppConfig } from "@/lib/config";
import {
  BOOT_RECOVER_LIMIT,
  applyDiskFailure,
  readCachedConfig,
  readRecoveryCount,
  serializeBootCache,
  shouldApplyDiskConfig,
  shouldShowBootScreen,
} from "@/lib/boot-policy";

describe("boot screen", () => {
  it("paints a cached schedule without waiting for disk", () => {
    expect(shouldShowBootScreen(true, false)).toBe(false);
  });

  it("keeps the boot screen only while the first disk read is still pending", () => {
    expect(shouldShowBootScreen(false, false)).toBe(true);
    expect(shouldShowBootScreen(false, true)).toBe(false);
  });
});

describe("boot cache", () => {
  it("round-trips a config and drops corrupt text", () => {
    const config = emptyConfig();
    config.couple = { ...config.couple, selfName: "阿宁" };
    const back = readCachedConfig(serializeBootCache(config));
    expect(back?.couple.selfName).toBe("阿宁");
    expect(readCachedConfig("{")).toBeNull();
    expect(readCachedConfig("null")).toBeNull();
    expect(readCachedConfig(null)).toBeNull();
  });
});

describe("disk result", () => {
  it("does not overwrite an edit made while the read was in flight", () => {
    expect(shouldApplyDiskConfig(0, 0)).toBe(true);
    expect(shouldApplyDiskConfig(0, 1)).toBe(false);
  });

  it("reloads a timed-out channel twice, then restarts once, and does not loop", () => {
    let recoveries = 0;
    const first = applyDiskFailure({
      hadCache: true,
      timedOut: true,
      recoveries,
    });
    expect(first.keepCache).toBe(true);
    expect(first.useEmpty).toBe(false);
    expect(first.recover).toBe(true);
    expect(first.restart).toBe(false);
    recoveries = first.recoveries;

    const second = applyDiskFailure({
      hadCache: true,
      timedOut: true,
      recoveries,
    });
    expect(second.recover).toBe(true);
    expect(second.recoveries).toBe(BOOT_RECOVER_LIMIT);
    recoveries = second.recoveries;

    const third = applyDiskFailure({
      hadCache: false,
      timedOut: true,
      recoveries,
    });
    expect(third.recover).toBe(false);
    expect(third.restart).toBe(true);
    expect(third.useEmpty).toBe(true);
    recoveries = third.recoveries;

    const fourth = applyDiskFailure({
      hadCache: true,
      timedOut: true,
      recoveries,
    });
    expect(fourth.recover).toBe(false);
    expect(fourth.restart).toBe(false);
    expect(fourth.keepCache).toBe(true);
  });

  it("does not reload when the file itself is invalid", () => {
    const decision = applyDiskFailure({
      hadCache: true,
      timedOut: false,
      recoveries: 0,
    });
    expect(decision.recover).toBe(false);
    expect(decision.restart).toBe(false);
    expect(decision.keepCache).toBe(true);
    expect(
      applyDiskFailure({ hadCache: false, timedOut: false, recoveries: 0 })
        .useEmpty,
    ).toBe(true);
  });
});

describe("boot cache keeps the week layout", () => {
  it("round-trips a cross-day span the rails still slice per day", () => {
    const base = emptyConfig();
    const config = parseAppConfig({
      ...base,
      items: [
        {
          id: "meet",
          start: "13:40",
          end: "20:00",
          title: "相处",
          weekdays: [],
          enabled: true,
          recurrence: "once",
          date: "2026-10-16",
          endDate: "2026-10-18",
          durationMinutes: 3260,
          tag: "life",
          skippedDates: [],
          owner: "shared",
        },
        {
          id: "night",
          start: "22:00",
          end: "06:00",
          title: "值夜",
          weekdays: [1],
          enabled: true,
          recurrence: "weekly",
          tag: "rest",
          skippedDates: [],
          owner: "self",
        },
      ],
    });
    const restored = readCachedConfig(serializeBootCache(config));
    expect(restored?.items.map((item) => item.id)).toEqual(["meet", "night"]);
    const meet = restored!.items[0]!;
    const night = restored!.items[1]!;
    expect(columnCycleRanges(meet, "2026-10-16")[0]?.startMin).toBe(6 * 60 + 40);
    expect(columnCycleRanges(meet, "2026-10-17")).toHaveLength(1);
    expect(columnCycleRanges(meet, "2026-10-18")[0]?.endMin).toBe(13 * 60);
    expect(columnCycleRanges(meet, "2026-10-15")).toEqual([]);
    expect(columnCycleRanges(meet, "2026-10-19")).toEqual([]);
    expect(columnCycleRanges(night, "2026-10-12").length).toBeGreaterThan(0);
    expect(columnCycleRanges(night, "2026-10-13")).toEqual([]);
  });
});

describe("recovery count", () => {
  it("ignores junk", () => {
    expect(readRecoveryCount(null)).toBe(0);
    expect(readRecoveryCount("2")).toBe(2);
    expect(readRecoveryCount("1.5")).toBe(0);
    expect(readRecoveryCount("-1")).toBe(0);
  });
});
