import { describe, expect, it } from "vitest";
import {
  isWidgetRectOnScreen,
  nearestWorkAreaOrigin,
  widgetIsPresented,
} from "@/lib/widget-placement";

/**
 * 外接矩形和每一块显示器的完整范围（位置 + 分辨率，不裁任务栏）
 * 都没有正面积重叠，才算不在屏幕上。边贴着、重叠面积为 0 不算。
 * (-32000, -32000) 没有单独开特例，它只是落在所有显示器外面。
 * 没有显示器数据时无法证明这一点，不当成屏幕外。
 */
const primary = { x: 0, y: 0, width: 1920, height: 1080 };
const secondary = { x: 1920, y: 0, width: 1920, height: 1080 };
const left = { x: -1920, y: 0, width: 1920, height: 1080 };

describe("isWidgetRectOnScreen", () => {
  it("停在 -32000 的窗口不在任何显示器上", () => {
    const parked = { x: -32000, y: -32000, width: 272, height: 91 };
    const minimizedParking = { x: -32000, y: -32000, width: 160, height: 28 };
    expect(isWidgetRectOnScreen(parked, [primary, secondary])).toBe(false);
    expect(isWidgetRectOnScreen(minimizedParking, [primary])).toBe(false);
    expect(isWidgetRectOnScreen(parked, [left, primary])).toBe(false);
  });

  it("和显示器有正面积重叠就算在屏幕上，只贴边不算", () => {
    expect(
      isWidgetRectOnScreen({ x: 100, y: 80, width: 272, height: 91 }, [primary]),
    ).toBe(true);
    expect(
      isWidgetRectOnScreen({ x: -10, y: 40, width: 272, height: 91 }, [primary]),
    ).toBe(true);
    expect(
      isWidgetRectOnScreen({ x: 1800, y: 40, width: 272, height: 91 }, [
        primary,
        secondary,
      ]),
    ).toBe(true);
    expect(
      isWidgetRectOnScreen({ x: -272, y: 40, width: 272, height: 91 }, [primary]),
    ).toBe(false);
  });

  it("没有显示器数据时不当成屏幕外", () => {
    expect(
      isWidgetRectOnScreen({ x: -32000, y: -32000, width: 272, height: 91 }, []),
    ).toBe(true);
  });
});

describe("widgetIsPresented", () => {
  it("只有可见、未最小化、并且在屏幕上才算悬浮窗开着", () => {
    expect(widgetIsPresented(true, false, true)).toBe(true);
    expect(widgetIsPresented(true, false, false)).toBe(false);
    expect(widgetIsPresented(true, true, false)).toBe(false);
    expect(widgetIsPresented(false, false, true)).toBe(false);
  });
});

describe("nearestWorkAreaOrigin", () => {
  const primaryWork = { x: 0, y: 0, width: 1920, height: 1040 };
  const secondaryWork = { x: 1920, y: 0, width: 1920, height: 1040 };

  it("已经在屏幕上时不给新位置", () => {
    expect(
      nearestWorkAreaOrigin(
        { x: 100, y: 80, width: 272, height: 91 },
        [{ bounds: primary, work: primaryWork }],
      ),
    ).toBeNull();
  });

  it("停在屏幕外时放到最近一块显示器的工作区左上角", () => {
    expect(
      nearestWorkAreaOrigin(
        { x: -32000, y: -32000, width: 272, height: 91 },
        [
          { bounds: primary, work: { x: 0, y: 40, width: 1920, height: 1040 } },
          { bounds: secondary, work: secondaryWork },
        ],
      ),
    ).toEqual({ x: 0, y: 40 });

    expect(
      nearestWorkAreaOrigin(
        { x: 4000, y: 100, width: 272, height: 91 },
        [
          { bounds: primary, work: primaryWork },
          { bounds: secondary, work: secondaryWork },
        ],
      ),
    ).toEqual({ x: 1920, y: 0 });
  });
});
