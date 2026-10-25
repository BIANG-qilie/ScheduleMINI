import { describe, expect, it } from "vitest";
import {
  DAY_MIN_CARD_PX,
  WEEK_MIN_CARD_PX,
  columnCycleRanges,
  computeOverlapLayout,
  isOverlapBand,
  itemSpanMinutes,
  resolveOnceSpan,
} from "@/lib/config";

describe("isOverlapBand", () => {
  it("marks calls, overnight, cross-day, and spans of 4 hours", () => {
    expect(isOverlapBand({ startMin: 0, endMin: 30, call: true })).toBe(true);
    expect(
      isOverlapBand({
        startMin: 0,
        endMin: 40,
        overnight: true,
        durationMin: 40,
      }),
    ).toBe(true);
    expect(isOverlapBand({ startMin: 0, endMin: 30, spanned: true })).toBe(true);
    expect(isOverlapBand({ startMin: 0, endMin: 4 * 60 })).toBe(true);
    expect(isOverlapBand({ startMin: 0, endMin: 4 * 60 - 1 })).toBe(false);
    expect(
      isOverlapBand({ startMin: 0, endMin: 90, durationMin: 5 * 60 }),
    ).toBe(true);
  });

  it("counts overnight and stored duration toward the 4 hour rule", () => {
    expect(itemSpanMinutes({ start: "09:00", end: "13:00" })).toBe(240);
    expect(itemSpanMinutes({ start: "22:00", end: "06:00" })).toBe(8 * 60);
    expect(
      itemSpanMinutes({
        start: "13:40",
        end: "20:00",
        durationMinutes: 3260,
      }),
    ).toBe(3260);
  });
});

describe("computeOverlapLayout bands", () => {
  it("keeps a long background item out of the columns", () => {
    const layout = computeOverlapLayout([
      { id: "call", start: 0, end: 600, band: true },
      { id: "meet", start: 120, end: 180 },
      { id: "science", start: 150, end: 210 },
    ]);
    expect(layout.bands).toEqual(["call"]);
    expect(layout.cards.has("call")).toBe(false);
    expect(layout.cards.get("meet")).toEqual({
      column: 0,
      span: 1,
      columnCount: 2,
    });
    expect(layout.cards.get("science")).toEqual({
      column: 1,
      span: 1,
      columnCount: 2,
    });
    expect(layout.pills).toEqual([]);
  });
});

describe("computeOverlapLayout expand-right", () => {
  it("stretches a card into free columns on its right", () => {
    const layout = computeOverlapLayout([
      { id: "a", start: 0, end: 180 },
      { id: "d", start: 10, end: 40 },
      { id: "b", start: 10, end: 70 },
      { id: "c", start: 120, end: 180 },
    ]);
    expect(layout.cards.get("a")).toEqual({ column: 0, span: 1, columnCount: 3 });
    expect(layout.cards.get("d")).toEqual({ column: 1, span: 1, columnCount: 3 });
    expect(layout.cards.get("b")).toEqual({ column: 2, span: 1, columnCount: 3 });
    expect(layout.cards.get("c")).toEqual({ column: 1, span: 2, columnCount: 3 });
  });
});

describe("computeOverlapLayout +N", () => {
  const afternoon = [
    { id: "math", start: 15 * 60, end: 16 * 60 + 10 },
    { id: "piano", start: 15 * 60 + 5, end: 16 * 60 },
    { id: "meet", start: 15 * 60 + 10, end: 16 * 60 + 20 },
    { id: "science", start: 15 * 60 + 20, end: 16 * 60 + 40 },
  ];

  it("shows the first k-1 cards and a +N pill on a narrow week column", () => {
    expect(WEEK_MIN_CARD_PX).toBe(64);
    const layout = computeOverlapLayout(afternoon, {
      laneWidth: 224,
      minCardWidth: WEEK_MIN_CARD_PX,
    });
    expect([...layout.cards.keys()]).toEqual(["math", "piano"]);
    expect(layout.cards.get("math")?.columnCount).toBe(3);
    expect(layout.cards.get("math")?.span).toBe(1);
    expect(layout.pills).toHaveLength(1);
    expect(layout.pills[0]?.hiddenIds).toEqual(["meet", "science"]);
    expect(layout.pills[0]).toMatchObject({ column: 2, span: 1, columnCount: 3 });
    expect(layout.hiddenIds).toEqual(["meet", "science"]);
  });

  it("keeps every card when the phone column is wide enough", () => {
    expect(DAY_MIN_CARD_PX).toBe(40);
    const layout = computeOverlapLayout(afternoon, {
      laneWidth: 311,
      minCardWidth: DAY_MIN_CARD_PX,
    });
    expect(layout.pills).toEqual([]);
    expect(layout.cards.size).toBe(4);
  });

  it("collapses to a single +N when only one minimum slot fits", () => {
    const layout = computeOverlapLayout(
      [
        { id: "a", start: 0, end: 60 },
        { id: "b", start: 0, end: 60 },
      ],
      { laneWidth: 50, minCardWidth: WEEK_MIN_CARD_PX },
    );
    expect(layout.cards.size).toBe(0);
    expect(layout.pills[0]?.hiddenIds).toEqual(["a", "b"]);
    expect(layout.pills[0]).toMatchObject({ column: 0, columnCount: 1 });
  });
});

describe("overnight column", () => {
  const night = {
    id: "night",
    start: "22:00",
    end: "06:00",
    title: "值夜",
    weekdays: [1],
    enabled: true,
    recurrence: "weekly" as const,
    tag: "rest" as const,
    skippedDates: [] as string[],
  };

  it("keeps 22:00–06:00 on the start day and paints it as a band", () => {
    expect(columnCycleRanges(night, "2026-09-21")).toEqual([
      { startMin: 15 * 60, endMin: 17 * 60, overnight: true },
      { startMin: 17 * 60, endMin: 23 * 60, overnight: true },
    ]);
    expect(columnCycleRanges(night, "2026-09-22")).toEqual([]);

    const ranges = columnCycleRanges(night, "2026-09-21");
    const layout = computeOverlapLayout([
      ...ranges.map((range) => ({
        id: `night@${range.startMin}`,
        start: range.startMin,
        end: range.endMin,
        band: isOverlapBand({
          startMin: range.startMin,
          endMin: range.endMin,
          overnight: range.overnight,
          durationMin: itemSpanMinutes(night),
        }),
      })),
      { id: "late", start: 16 * 60, end: 16 * 60 + 30 },
    ]);
    expect(layout.bands).toEqual(["night@900", "night@1020"]);
    expect(layout.cards.get("late")).toEqual({
      column: 0,
      span: 1,
      columnCount: 1,
    });
  });
});

describe("16日 13:40 → 18日 20:00", () => {
  it("stays visible on each day as a band and does not take a column", () => {
    const span = resolveOnceSpan({
      date: "2026-10-16",
      start: "13:40",
      endDate: "2026-10-18",
      end: "20:00",
    });
    expect(span.ok).toBe(true);
    if (!span.ok) return;
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

    for (const dateKey of ["2026-10-16", "2026-10-17", "2026-10-18"]) {
      const range = columnCycleRanges(item, dateKey)[0];
      expect(range).toBeDefined();
      if (!range) continue;
      expect(
        isOverlapBand({
          startMin: range.startMin,
          endMin: range.endMin,
          overnight: range.overnight,
          spanned: true,
          durationMin: item.durationMinutes,
        }),
      ).toBe(true);
    }

    const day17 = columnCycleRanges(item, "2026-10-17")[0];
    const layout = computeOverlapLayout([
      {
        id: "span@17",
        start: day17.startMin,
        end: day17.endMin,
        band: true,
      },
      { id: "class", start: 8 * 60, end: 9 * 60 },
    ]);
    expect(layout.bands).toEqual(["span@17"]);
    expect(layout.cards.has("span@17")).toBe(false);
    expect(layout.cards.get("class")).toEqual({
      column: 0,
      span: 1,
      columnCount: 1,
    });
  });
});
