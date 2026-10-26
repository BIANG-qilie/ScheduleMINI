import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WIDGET_VISIBILITY_EVENT } from "@/lib/windows";

/**
 * 0.3.0-2 仍无效的根因：
 * 1) 托盘 `toggle_widget` 从不通知前端 → `widgetVisible`/按钮不变；
 * 2) Windows 上对小窗 `hide()` 后再 show/unminimize 经常起不来，收起应走
 *    minimize+skip_taskbar；拉起须先 skip_taskbar(false)。
 */
describe("widget reveal after minimize (0.3.0-3)", () => {
  const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
  const strategy = readFileSync("src-tauri/src/widget_window.rs", "utf8");

  it("显示路径先取消 skip_taskbar，再 unminimize/show，最后恢复浮窗样式", () => {
    const reveal = lib.match(
      /fn reveal_widget\(widget: &WebviewWindow\)[\s\S]*?\n\}/,
    );
    expect(reveal?.[0]).toBeTruthy();
    const body = reveal![0];
    const skipFalse = body.indexOf("set_skip_taskbar(false)");
    const unminimize = body.indexOf(".unminimize()");
    const show = body.indexOf(".show()");
    const skipTrue = body.indexOf("set_skip_taskbar(true)");
    expect(skipFalse).toBeGreaterThanOrEqual(0);
    expect(unminimize).toBeGreaterThan(skipFalse);
    expect(show).toBeGreaterThan(unminimize);
    expect(skipTrue).toBeGreaterThan(show);
  });

  it("Windows 收起路径用 minimize，不用 hide", () => {
    const conceal = lib.match(
      /fn conceal_widget\(widget: &WebviewWindow\)[\s\S]*?\n\}/,
    );
    expect(conceal?.[0]).toBeTruthy();
    const body = conceal![0];
    expect(body).toMatch(/\.minimize\(\)/);
    // 函数里 Windows 分支不应调用 hide
    expect(body).toMatch(/target_os = "windows"/);
    const windowsArm = body.split('target_os = "windows"')[1] ?? "";
    expect(windowsArm).not.toMatch(/\.hide\(\)/);
  });

  it("托盘/命令切换后会发出显隐事件，供设置页按钮同步", () => {
    expect(strategy).toContain(`"${WIDGET_VISIBILITY_EVENT}"`);
    expect(lib).toContain("notify_widget_visibility");
    expect(lib).toContain("WIDGET_VISIBILITY_EVENT");
    // set + toggle 两条命令路径都要通知
    const notifyCount = (lib.match(/notify_widget_visibility\(&app/g) ?? [])
      .length;
    expect(notifyCount).toBeGreaterThanOrEqual(2);
  });

  it("最小化或已隐藏时托盘应拉起，而不是再 hide", () => {
    expect(strategy).toContain("visible && !minimized");
    expect(lib).toContain("should_conceal_widget(visible, minimized)");
  });
});

describe("shouldConcealWidget", () => {
  function shouldConcealWidget(visible: boolean, minimized: boolean) {
    return visible && !minimized;
  }

  it("已显示且未最小化才收起", () => {
    expect(shouldConcealWidget(true, false)).toBe(true);
    expect(shouldConcealWidget(true, true)).toBe(false);
    expect(shouldConcealWidget(false, false)).toBe(false);
    expect(shouldConcealWidget(false, true)).toBe(false);
  });
});
