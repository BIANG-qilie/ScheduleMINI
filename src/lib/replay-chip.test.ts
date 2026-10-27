import { describe, expect, it } from "vitest";
import { REPLAY_CHIP_RAIL_LEFT, replayChipLayout } from "@/lib/replay-chip";

describe("replay chip layout", () => {
  it("puts every short mark on the hour rail", () => {
    const douyin = replayChipLayout({ title: "抖音", laneWidth: 280 });
    const tata = replayChipLayout({ title: "塔塔冒险队", laneWidth: 280 });
    expect(douyin.left).toBe(REPLAY_CHIP_RAIL_LEFT);
    expect(tata.left).toBe(REPLAY_CHIP_RAIL_LEFT);
    expect(douyin.label).toBe("抖音");
    expect(tata.label).toBe("塔塔冒险队");
  });

  it("drops the name instead of cutting it in half", () => {
    expect(
      replayChipLayout({
        title: "塔塔冒险队",
        laneWidth: 36,
      }).label,
    ).toBe("");
  });

  it("keeps the same rail when a class capsule fills the column", () => {
    const placed = replayChipLayout({
      title: "抖音",
      laneWidth: 180,
    });
    expect(placed.left).toBe(REPLAY_CHIP_RAIL_LEFT);
    expect(placed.label).toBe("抖音");
  });
});
