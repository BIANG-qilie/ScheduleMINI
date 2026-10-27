import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WIDGET_VISIBILITY_EVENT } from "@/lib/windows";

/**
 * 0.3.0 最小化后再也出不来：拉起在 unminimize 之前先 set_always_on_top。
 * Windows 改置顶会 SW_SHOW，把「已最小化」清掉但窗口不展开，后面的
 * unminimize 就跳过还原。设置和托盘走同一个函数，所以两个入口都没反应。
 */
describe("widget reveal after minimize", () => {
  const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
  const strategy = readFileSync("src-tauri/src/widget_window.rs", "utf8");

  it("显示路径先取消 skip_taskbar，再 unminimize/show，最后才置顶", () => {
    const reveal = lib.match(
      /fn reveal_widget_now\(widget: &WebviewWindow\)[\s\S]*?\n\}/,
    );
    expect(reveal?.[0]).toBeTruthy();
    const body = reveal![0];
    const skipFalse = body.indexOf("set_skip_taskbar(false)");
    const unminimize = body.indexOf(".unminimize()");
    const show = body.indexOf(".show()");
    const alwaysOnTop = body.indexOf("set_always_on_top(true)");
    const skipTrue = body.indexOf("set_skip_taskbar(true)");
    expect(skipFalse).toBeGreaterThanOrEqual(0);
    expect(unminimize).toBeGreaterThan(skipFalse);
    expect(show).toBeGreaterThan(unminimize);
    expect(alwaysOnTop).toBeGreaterThan(show);
    expect(skipTrue).toBeGreaterThan(alwaysOnTop);
    expect(lib).toContain("run_on_main_thread");
    expect(strategy).toContain("REVEAL_STEPS_BROKEN_0_3_0");
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
