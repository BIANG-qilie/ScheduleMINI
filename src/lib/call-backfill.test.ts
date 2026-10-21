import { describe, expect, it } from "vitest";
import {
  describeCallBackfill,
  reconstructCallBackfill,
  resolveCallBackfill,
} from "@/lib/call-backfill";

describe("resolveCallBackfill", () => {
  it("sets start to end minus duration", () => {
    const end = new Date(2026, 9, 21, 15, 30, 0, 0);
    const now = new Date(2026, 9, 21, 15, 40, 0, 0);
    const result = resolveCallBackfill({
      endAt: end,
      durationMinutes: 30,
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.startAt.getTime()).toBe(end.getTime() - 30 * 60_000);
    expect(result.start).toBe("15:00");
    expect(result.end).toBe("15:30");
    expect(result.date).toBe("2026-10-21");
  });

  it("stores an overnight span when the call crosses midnight", () => {
    const end = new Date(2026, 9, 21, 0, 10, 0, 0);
    const result = resolveCallBackfill({
      endAt: end,
      durationMinutes: 30,
      now: end,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.startAt.getTime()).toBe(end.getTime() - 30 * 60_000);
    expect(result.start).toBe("23:40");
    expect(result.end).toBe("00:10");
    expect(result.date).toBe("2026-10-20");
  });

  it("rejects an end in the future", () => {
    const now = new Date(2026, 9, 21, 15, 0, 0, 0);
    const end = new Date(2026, 9, 21, 15, 1, 0, 0);
    expect(
      resolveCallBackfill({ endAt: end, durationMinutes: 30, now }),
    ).toEqual({ ok: false, message: "结束时间不能晚于现在" });
  });

  it("accepts an end in the current minute", () => {
    const now = new Date(2026, 9, 21, 15, 0, 45, 0);
    const end = new Date(2026, 9, 21, 15, 0, 10, 0);
    const result = resolveCallBackfill({
      endAt: end,
      durationMinutes: 5,
      now,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects duration over 48 hours and accepts 2880 minutes", () => {
    const end = new Date(2026, 9, 21, 15, 30, 0, 0);
    expect(
      resolveCallBackfill({ endAt: end, durationMinutes: 2881, now: end }),
    ).toEqual({ ok: false, message: "时长不能超过 48 小时" });
    const accepted = resolveCallBackfill({
      endAt: end,
      durationMinutes: 2880,
      now: end,
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.startAt.getTime()).toBe(end.getTime() - 2880 * 60_000);
    expect(accepted.start).toBe("15:30");
    expect(accepted.end).toBe("15:30");
    expect(accepted.date).toBe("2026-10-19");
  });

  it("rejects duration that is not greater than 0", () => {
    const end = new Date(2026, 9, 21, 15, 30, 0, 0);
    expect(
      resolveCallBackfill({ endAt: end, durationMinutes: 0, now: end }).ok,
    ).toBe(false);
    expect(
      resolveCallBackfill({ endAt: end, durationMinutes: -5, now: end }).ok,
    ).toBe(false);
  });
});

describe("describeCallBackfill", () => {
  it("keeps a 30 minute backfill writable", () => {
    const described = describeCallBackfill({
      backfillEnd: "2026-10-21T15:30",
      preset: 30,
      custom: "",
      now: new Date(2026, 9, 21, 15, 40, 0, 0),
    });
    expect(described.state).toBe("ready");
    if (described.state !== "ready") return;
    expect(described.resolved.start).toBe("15:00");
    expect(described.resolved.end).toBe("15:30");
    expect(described.resolved.date).toBe("2026-10-21");
  });

  it("refuses a same clock span before it is stored", () => {
    const described = describeCallBackfill({
      backfillEnd: "2026-10-21T15:30",
      preset: null,
      custom: "2880",
      now: new Date(2026, 9, 21, 15, 30, 0, 0),
    });
    expect(described).toEqual({
      state: "invalid",
      message: "整 24 小时或 48 小时时，起止是同一钟点",
    });
  });
});

describe("reconstructCallBackfill", () => {
  it("rebuilds a same-day call", () => {
    const rebuilt = reconstructCallBackfill({
      start: "15:00",
      end: "15:30",
      date: "2026-10-21",
    });
    expect(rebuilt.durationMinutes).toBe(30);
    expect(rebuilt.backfillEnd).toBe("2026-10-21T15:30");
  });

  it("rebuilds an overnight call onto the next morning", () => {
    const rebuilt = reconstructCallBackfill({
      start: "23:40",
      end: "00:10",
      date: "2026-10-20",
    });
    expect(rebuilt.durationMinutes).toBe(30);
    expect(rebuilt.backfillEnd).toBe("2026-10-21T00:10");
  });
});
