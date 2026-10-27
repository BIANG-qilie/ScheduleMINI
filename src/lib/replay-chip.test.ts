import { describe, expect, it } from "vitest";
import {
  REPLAY_CHIP_HEIGHT,
  REPLAY_CHIP_RAIL_LEFT,
  REPLAY_OVERLAP_RESERVE_PX,
  isRailMark,
  placeReplayLabel,
  placeReplayBand,
  replayCapsuleInset,
  replayCardRect,
  replayChipSpan,
} from "@/lib/replay-chip";

describe("replay chip layout", () => {
  it("puts a short one-off on the phone rail even without a saved mark", () => {
    expect(
      isRailMark({
        dayLayout: true,
        once: true,
        minutes: 18,
        marked: false,
        band: false,
      }),
    ).toBe(true);
    expect(
      isRailMark({
        dayLayout: true,
        once: false,
        minutes: 50,
        marked: false,
        band: false,
      }),
    ).toBe(false);
    expect(
      isRailMark({
        dayLayout: false,
        once: true,
        minutes: 18,
        marked: false,
        band: false,
      }),
    ).toBe(false);
  });

  it("keeps every dot on the hour rail and the names in one column", () => {
    const douyin = replayChipSpan("抖音");
    const tata = replayChipSpan("塔塔冒险队");
    expect(REPLAY_CHIP_RAIL_LEFT).toBe(6);
    expect(douyin.labelLeft).toBe(tata.labelLeft);
    expect(douyin.labelLeft).toBeGreaterThan(REPLAY_CHIP_RAIL_LEFT);
  });

  it("keeps the class capsule full width and parks the name clear of it", () => {
    const inset = replayCapsuleInset({
      titles: ["抖音", "塔塔冒险队", "芯核智算 肖总开会"],
      laneWidth: 300,
      minCapsule: 120,
    });
    const card = replayCardRect({
      column: 0,
      span: 1,
      columnCount: 1,
      top: 104,
      height: 51,
      laneWidth: 300,
      inset,
    });
    const placed = placeReplayLabel({
      title: "塔塔冒险队",
      top: 120,
      laneWidth: 300,
      obstacles: [card],
      taken: [],
    });
    const span = replayChipSpan(placed.label);
    const box = {
      top: placed.top,
      bottom: placed.top + REPLAY_CHIP_HEIGHT,
      left: span.labelLeft,
      right: span.right,
    };
    expect(inset).toBe(0);
    expect(card.left).toBe(4);
    expect(card.right - card.left).toBe(300 - 8);
    expect(placed.label).toBe("塔塔冒险队");
    expect(placed.labelLeft).toBe(replayChipSpan("抖音").labelLeft);
    const separated =
      box.bottom + 8 <= card.top || card.bottom + 8 <= box.top;
    expect(separated).toBe(true);
  });

  it("does not crush a narrow column, and parks the name outside the capsule", () => {
    const inset = replayCapsuleInset({
      titles: ["塔塔冒险队"],
      laneWidth: 100,
      minCapsule: 120,
    });
    expect(inset).toBe(0);
    const card = replayCardRect({
      column: 0,
      span: 1,
      columnCount: 1,
      top: 104,
      height: 51,
      laneWidth: 100,
      inset,
    });
    const placed = placeReplayLabel({
      title: "塔塔冒险队",
      top: 120,
      laneWidth: 100,
      obstacles: [card],
      taken: [],
    });
    const span = replayChipSpan(placed.label);
    const box = {
      top: placed.top,
      bottom: placed.top + REPLAY_CHIP_HEIGHT,
      left: span.labelLeft,
      right: span.right,
    };
    expect(placed.label).toBe("塔塔冒险队");
    const separated =
      box.right + 8 <= card.left ||
      card.right + 8 <= box.left ||
      box.bottom + 8 <= card.top ||
      card.bottom + 8 <= box.top;
    expect(separated).toBe(true);
  });

  it("stacks two names from the same hour with a gap", () => {
    const laneWidth = 300;
    const inset = replayCapsuleInset({
      titles: ["抖音", "塔塔冒险队"],
      laneWidth,
      minCapsule: 120,
    });
    const card = replayCardRect({
      column: 0,
      span: 1,
      columnCount: 1,
      top: 104,
      height: 51,
      laneWidth,
      inset,
    });
    const first = placeReplayLabel({
      title: "抖音",
      top: 114,
      laneWidth,
      obstacles: [card],
      taken: [],
    });
    const firstSpan = replayChipSpan(first.label);
    const taken = [
      {
        top: first.top,
        bottom: first.top + REPLAY_CHIP_HEIGHT,
        left: firstSpan.labelLeft,
        right: firstSpan.right,
      },
    ];
    const second = placeReplayLabel({
      title: "塔塔冒险队",
      top: 132,
      laneWidth,
      obstacles: [card],
      taken,
    });
    expect(first.label).toBe("抖音");
    expect(second.label).toBe("塔塔冒险队");
    expect(second.top).toBeGreaterThanOrEqual(first.top + REPLAY_CHIP_HEIGHT + 8);
    expect(first.labelLeft).toBe(second.labelLeft);
  });

  it("drops a name that has nowhere clear of the capsule", () => {
    expect(
      placeReplayLabel({
        title: "抖音",
        top: 40,
        laneWidth: 300,
        obstacles: [{ top: 0, bottom: 800, left: 0, right: 300 }],
        taken: [],
      }).label,
    ).toBe("");
  });

  it("centers the short name on its wash when the span overlaps a class", () => {
    const spanTop = (6 * 60 + 52) / 60 * 52;
    const spanHeight = (16 / 60) * 52;
    const readTop = 7 * 52;
    const readHeight = (20 / 60) * 52 - 1;
    const placed = placeReplayBand({
      top: spanTop,
      height: spanHeight,
      labelHeight: REPLAY_CHIP_HEIGHT,
      obstacles: [{ top: readTop, bottom: readTop + readHeight, left: 4, right: 300 }],
    });
    expect(placed.washTop).toBe(spanTop);
    expect(placed.washHeight).toBe(spanHeight);
    expect(placed.besideClass).toBe(true);
    expect(placed.labelTop + REPLAY_CHIP_HEIGHT / 2).toBeCloseTo(spanTop + spanHeight / 2, 5);
    expect(REPLAY_OVERLAP_RESERVE_PX).toBeGreaterThan(0);
  });

  it("drops the name instead of cutting it in half", () => {
    expect(
      placeReplayLabel({
        title: "塔塔冒险队",
        top: 10,
        laneWidth: 36,
        obstacles: [],
        taken: [],
      }).label,
    ).toBe("");
  });
});
