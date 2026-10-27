import { describe, expect, it } from "vitest";
import { replayChipLayout } from "@/lib/replay-chip";

describe("replay chip layout", () => {
  it("shows the full app name when the lane has room", () => {
    expect(
      replayChipLayout({
        title: "抖音",
        top: 40,
        laneWidth: 220,
        obstacles: [],
      }),
    ).toEqual({ left: 4, label: "抖音" });
  });

  it("drops the name instead of cutting it in half", () => {
    expect(
      replayChipLayout({
        title: "塔塔冒险队",
        top: 40,
        laneWidth: 36,
        obstacles: [],
      }).label,
    ).toBe("");
  });

  it("yields to a class title and still shows a short name in the leftover space", () => {
    const placed = replayChipLayout({
      title: "抖音",
      top: 48,
      laneWidth: 280,
      obstacles: [
        {
          top: 40,
          bottom: 120,
          left: 4,
          right: 272,
          titleWidth: 70,
        },
      ],
    });
    expect(placed.left).toBeGreaterThan(70);
    expect(placed.label).toBe("抖音");
  });

  it("keeps only a dot when the class title already fills the column", () => {
    const placed = replayChipLayout({
      title: "塔塔冒险队",
      top: 48,
      laneWidth: 180,
      obstacles: [
        {
          top: 40,
          bottom: 120,
          left: 4,
          right: 172,
          titleWidth: 172,
        },
      ],
    });
    expect(placed.label).toBe("");
  });
});
