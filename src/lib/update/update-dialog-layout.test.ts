import { describe, expect, it } from "vitest";
import { updateDialogLift } from "@/lib/update/update-dialog-layout";

describe("updateDialogLift", () => {
  it("常规手机高度把按钮抬离底边，并留出手势条空隙", () => {
    const lift = updateDialogLift(844, 34);
    expect(lift).toBeGreaterThanOrEqual(34 + 16);
    expect(lift).toBeGreaterThanOrEqual(80);
    expect(lift).toBeLessThan(844 * 0.3);
  });

  it("没有安全区时仍留出最小底边空隙", () => {
    expect(updateDialogLift(844, 0)).toBeGreaterThanOrEqual(72);
    expect(updateDialogLift(568, 0)).toBeGreaterThanOrEqual(28);
  });

  it("较矮屏幕只留手势条空隙，不把弹窗顶出拇指区", () => {
    for (const height of [640, 568]) {
      const lift = updateDialogLift(height, 34);
      expect(lift).toBeGreaterThanOrEqual(34 + 16);
      expect(lift).toBeLessThanOrEqual(Math.round(height * 0.22));
      expect(height - lift).toBeGreaterThan(420);
    }
  });
});
