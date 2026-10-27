import { describe, expect, it } from "vitest";
import {
  REPLAY_CHIP_HEIGHT,
  REPLAY_CHIP_RAIL_LEFT,
  placeReplayLabel,
  replayCapsuleInset,
  replayCardRect,
  replayChipSpan,
} from "@/lib/replay-chip";

describe("replay chip layout", () => {
  it("keeps every dot on the hour rail and the names in one column", () => {
    const douyin = replayChipSpan("抖音");
    const tata = replayChipSpan("塔塔冒险队");
    expect(REPLAY_CHIP_RAIL_LEFT).toBe(-5);
    expect(douyin.labelLeft).toBe(tata.labelLeft);
    expect(douyin.labelLeft).toBeGreaterThan(REPLAY_CHIP_RAIL_LEFT);
  });

  it("shifts the class capsule aside when the name column fits", () => {
    const inset = replayCapsuleInset({
      titles: ["抖音", "塔塔冒险队"],
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
    const name = replayChipSpan("塔塔冒险队");
    expect(inset).toBeGreaterThan(0);
    expect(card.left - name.right).toBeGreaterThanOrEqual(8);
    expect(card.right - card.left).toBeGreaterThanOrEqual(120);
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
