import { describe, expect, it } from "vitest";
import {
  buildCoexistenceSharedItemFields,
  coexistenceElapsedMs,
  coexistenceIsPaused,
  computeOverlapLayout,
  formatNetDurationPrecise,
  isOvernightItem,
  safeParseAppConfig,
} from "@/lib/config";

describe("coexistenceElapsedMs", () => {
  it("subtracts completed pauses from wall span", () => {
    const ms = coexistenceElapsedMs(
      {
        startedAt: "2026-09-21T10:00:00.000Z",
        endedAt: "2026-09-21T10:10:00.000Z",
        pauses: [
          {
            pausedAt: "2026-09-21T10:02:00.000Z",
            resumedAt: "2026-09-21T10:05:00.000Z",
          },
        ],
      },
      new Date("2026-09-21T10:10:00.000Z"),
    );
    expect(ms).toBe(7 * 60_000);
  });

  it("counts open pause until now when still paused", () => {
    const ms = coexistenceElapsedMs(
      {
        startedAt: "2026-09-21T10:00:00.000Z",
        pauses: [{ pausedAt: "2026-09-21T10:03:00.000Z" }],
      },
      new Date("2026-09-21T10:08:00.000Z"),
    );
    expect(ms).toBe(3 * 60_000);
  });
});

describe("coexistenceIsPaused", () => {
  it("true when last pause lacks resumedAt", () => {
    expect(
      coexistenceIsPaused({
        id: "s",
        startedAt: "2026-09-21T10:00:00.000Z",
        pauses: [{ pausedAt: "2026-09-21T10:01:00.000Z" }],
      }),
    ).toBe(true);
  });

  it("false when resumed", () => {
    expect(
      coexistenceIsPaused({
        id: "s",
        startedAt: "2026-09-21T10:00:00.000Z",
        pauses: [
          {
            pausedAt: "2026-09-21T10:01:00.000Z",
            resumedAt: "2026-09-21T10:02:00.000Z",
          },
        ],
      }),
    ).toBe(false);
  });
});

describe("buildCoexistenceSharedItemFields", () => {
  it("writes shared once with wall clock and net note", () => {
    const fields = buildCoexistenceSharedItemFields({
      id: "c1",
      startedAt: "2026-09-21T12:00:00.000",
      endedAt: "2026-09-21T12:10:00.000",
      pauses: [
        {
          pausedAt: "2026-09-21T12:02:00.000",
          resumedAt: "2026-09-21T12:05:00.000",
        },
      ],
    });
    expect(fields.owner).toBe("shared");
    expect(fields.recurrence).toBe("once");
    expect(fields.tag).toBe("life");
    expect(fields.title).toBe("共处");
    expect(fields.start).toBe("12:00");
    expect(fields.end).toBe("12:10");
    expect(fields.date).toBe("2026-09-21");
    expect(fields.note).toMatch(/净时长/);
    expect(fields.note).toMatch(/7 分钟/);
  });

  it("pads short wall clock to 1 minute and annotates seconds", () => {
    const fields = buildCoexistenceSharedItemFields({
      id: "c2",
      startedAt: "2026-09-21T12:00:00.000",
      endedAt: "2026-09-21T12:00:12.000",
      pauses: [],
    });
    expect(fields.start).toBe("12:00");
    expect(fields.end).toBe("12:01");
    expect(fields.title).toBe("共处 · 净 12 秒");
    expect(fields.note).toBe("净时长 12 秒");
  });

  it("cross-day once uses overnight end < start without splitting", () => {
    const fields = buildCoexistenceSharedItemFields({
      id: "c3",
      startedAt: "2026-09-21T23:30:00.000",
      endedAt: "2026-09-22T01:15:00.000",
      pauses: [],
    });
    expect(fields.recurrence).toBe("once");
    expect(fields.date).toBe("2026-09-21");
    expect(fields.start).toBe("23:30");
    expect(fields.end).toBe("01:15");
    expect(isOvernightItem(fields)).toBe(true);
  });
});

describe("formatNetDurationPrecise", () => {
  it("shows seconds under one minute", () => {
    expect(formatNetDurationPrecise(12_000)).toBe("12 秒");
  });
});

describe("computeOverlapLayout", () => {
  it("keeps left-aligned columns for overlaps", () => {
    const layout = computeOverlapLayout([
      { id: "a", start: 600, end: 700 },
      { id: "b", start: 650, end: 750 },
      { id: "c", start: 800, end: 900 },
    ]);
    expect(layout.cards.get("a")).toEqual({ column: 0, span: 1, columnCount: 2 });
    expect(layout.cards.get("b")).toEqual({ column: 1, span: 1, columnCount: 2 });
    expect(layout.cards.get("c")).toEqual({ column: 0, span: 1, columnCount: 1 });
    expect(layout.pills).toEqual([]);
    expect(layout.bands).toEqual([]);
  });
});

describe("unique item ids", () => {
  it("rejects duplicate ids in app config", () => {
    const r = safeParseAppConfig({
      version: 1,
      showHolidays: true,
      widgetVisible: true,
      items: [
        {
          id: "dup",
          start: "09:00",
          end: "10:00",
          title: "A",
          weekdays: [1],
          enabled: true,
        },
        {
          id: "dup",
          start: "11:00",
          end: "12:00",
          title: "B",
          weekdays: [1],
          enabled: true,
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});
