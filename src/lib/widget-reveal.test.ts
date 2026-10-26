import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 最小化后「打开悬浮窗」起不来：`set_widget_visible(true)` / `toggle_widget`
 * 以前只调 `show()`。最小化窗在系统里仍算可见，show 是空操作；hide 后再 show
 * 在 Windows 上也可能仍以最小化状态出现。显示路径必须 unminimize，并恢复置顶 +
 * 跳过任务栏。
 */
describe("widget reveal after minimize", () => {
  const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
  const strategy = readFileSync("src-tauri/src/widget_window.rs", "utf8");

  it("显示路径会 unminimize，并恢复小窗置顶/任务栏样式", () => {
    const reveal = lib.match(/fn reveal_widget[\s\S]*?\n\}/);
    expect(reveal?.[0]).toMatch(/\.unminimize\(\)/);
    expect(reveal?.[0]).toMatch(/set_always_on_top\(true\)/);
    expect(reveal?.[0]).toMatch(/set_skip_taskbar\(true\)/);
    expect(reveal?.[0]).toMatch(/set_focus\(\)/);
    expect(lib).toContain("reveal_widget(&widget)");
  });

  it("托盘切换在最小化时拉回前台，而不是当成已显示去隐藏", () => {
    expect(strategy).toContain("visible && !minimized");
    expect(lib).toContain("should_hide_widget(visible, minimized)");
  });
});

describe("shouldHideWidget", () => {
  // 与 src-tauri/src/widget_window.rs 保持一致，便于在无 GTK 的 CI 里锁住策略。
  function shouldHideWidget(visible: boolean, minimized: boolean) {
    return visible && !minimized;
  }

  it("已显示且未最小化才隐藏", () => {
    expect(shouldHideWidget(true, false)).toBe(true);
    expect(shouldHideWidget(true, true)).toBe(false);
    expect(shouldHideWidget(false, false)).toBe(false);
    expect(shouldHideWidget(false, true)).toBe(false);
  });
});
