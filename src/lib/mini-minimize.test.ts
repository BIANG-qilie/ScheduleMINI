import { describe, expect, it, vi } from "vitest";
import {
  minimizeDesktopMiniWindow,
  restoreDesktopMiniChrome,
  showDesktopMiniMinimize,
  type MiniWindowShell,
} from "@/lib/mini-minimize";

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
});
