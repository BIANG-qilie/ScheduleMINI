import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  minimizeDesktopMiniWindow,
  resetDesktopMiniChromeForTests,
  restoreDesktopMiniChrome,
  showDesktopMiniMinimize,
  type MiniWindowShell,
} from "@/lib/mini-minimize";

beforeEach(() => {
  resetDesktopMiniChromeForTests();
});

function shell(label: string): MiniWindowShell & {
  minimize: ReturnType<typeof vi.fn>;
  setAlwaysOnTop: ReturnType<typeof vi.fn>;
  setSkipTaskbar: ReturnType<typeof vi.fn>;
  isMinimized: ReturnType<typeof vi.fn>;
} {
  return {
    label,
    minimize: vi.fn(async () => {}),
    setAlwaysOnTop: vi.fn(async () => {}),
    setSkipTaskbar: vi.fn(async () => {}),
    isMinimized: vi.fn(async () => false),
  };
}

describe("showDesktopMiniMinimize", () => {
  it("只在桌面小窗显示最小化", () => {
    expect(showDesktopMiniMinimize("widget", "desktop")).toBe(true);
    expect(showDesktopMiniMinimize("widget", "android")).toBe(false);
    expect(showDesktopMiniMinimize("widget", "web")).toBe(false);
    expect(showDesktopMiniMinimize("settings", "desktop")).toBe(false);
  });
});

describe("minimizeDesktopMiniWindow", () => {
  it("点最小化会收起小窗，并让任务栏能把它还原", async () => {
    const win = shell("widget");
    await minimizeDesktopMiniWindow(async () => win);

    expect(win.setAlwaysOnTop.mock.invocationCallOrder[0]).toBeLessThan(
      win.minimize.mock.invocationCallOrder[0],
    );
    expect(win.setSkipTaskbar.mock.invocationCallOrder[0]).toBeLessThan(
      win.minimize.mock.invocationCallOrder[0],
    );
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(win.setSkipTaskbar).toHaveBeenCalledWith(false);
    expect(win.minimize).toHaveBeenCalledOnce();
  });

  it("大窗口不走这条最小化", async () => {
    const win = shell("settings");
    await minimizeDesktopMiniWindow(async () => win);
    expect(win.minimize).not.toHaveBeenCalled();
  });

  it("取消 skip-taskbar 被拒时不会假装已经最小化，并回滚置顶", async () => {
    const win = shell("widget");
    win.setSkipTaskbar.mockRejectedValueOnce(
      new Error("not allowed: window.set_skip_taskbar"),
    );
    await expect(minimizeDesktopMiniWindow(async () => win)).rejects.toThrow(
      /set_skip_taskbar/,
    );
    expect(win.minimize).not.toHaveBeenCalled();
    expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(true);
    expect(win.setSkipTaskbar).toHaveBeenLastCalledWith(true);
  });

  it("最小化还没完成时，不会把窗口又置顶回去", async () => {
    const win = shell("widget");
    let release: () => void = () => {};
    win.minimize.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = minimizeDesktopMiniWindow(async () => win);
    await vi.waitFor(() => expect(win.minimize).toHaveBeenCalled());
    await restoreDesktopMiniChrome(win);
    expect(win.setAlwaysOnTop).not.toHaveBeenCalledWith(true);
    expect(win.setSkipTaskbar).not.toHaveBeenCalledWith(true);
    release();
    await pending;
  });
});

describe("restoreDesktopMiniChrome", () => {
  it("还原后仍浮在最前，且不占任务栏", async () => {
    const win = shell("widget");
    await restoreDesktopMiniChrome(win);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(win.setSkipTaskbar).toHaveBeenCalledWith(true);
  });

  it("还最小化着时不改窗口样式", async () => {
    const win = shell("widget");
    win.isMinimized.mockResolvedValue(true);
    await restoreDesktopMiniChrome(win);
    expect(win.setAlwaysOnTop).not.toHaveBeenCalled();
    expect(win.setSkipTaskbar).not.toHaveBeenCalled();
  });

  it("窗口还没真正缩下去时，不会把任务栏按钮删掉", async () => {
    const win = shell("widget");
    let iconic = false;
    win.isMinimized.mockImplementation(async () => iconic);
    await minimizeDesktopMiniWindow(async () => win);

    await restoreDesktopMiniChrome(win);
    expect(win.setSkipTaskbar).not.toHaveBeenCalledWith(true);
    expect(win.setAlwaysOnTop).not.toHaveBeenCalledWith(true);

    iconic = true;
    await restoreDesktopMiniChrome(win);
    expect(win.setSkipTaskbar).not.toHaveBeenCalledWith(true);

    iconic = false;
    await restoreDesktopMiniChrome(win);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(win.setSkipTaskbar).toHaveBeenCalledWith(true);
  });
});
