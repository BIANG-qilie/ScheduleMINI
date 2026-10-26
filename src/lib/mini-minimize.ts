import type { AppView } from "@/lib/windows";

export type ShellPlatform = "desktop" | "android" | "web";

/** 最小化只出现在桌面悬浮小窗。手机、浏览器和大窗口沿用各自原有窗口。 */
export function showDesktopMiniMinimize(view: AppView, platform: ShellPlatform) {
  return view === "widget" && platform === "desktop";
}

let minimizeInFlight = false;

export type MiniWindowShell = {
  label: string;
  minimize: () => Promise<void>;
  setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
  setSkipTaskbar: (skip: boolean) => Promise<void>;
  isMinimized: () => Promise<boolean>;
};

/**
 * 小窗没有系统标题栏。先退出置顶并回到任务栏，再最小化，
 * 这样用户能从任务栏点回来。
 */
export async function minimizeDesktopMiniWindow(
  getWindow: () => Promise<MiniWindowShell | null> = defaultWidgetWindow,
) {
  const win = await getWindow();
  if (!win || win.label !== "widget") return;
  minimizeInFlight = true;
  try {
    await win.setAlwaysOnTop(false);
    await win.setSkipTaskbar(false);
    await win.minimize();
  } finally {
    minimizeInFlight = false;
  }
}

/** 从小窗还原后，继续浮在最前，并且不占着任务栏。 */
export async function restoreDesktopMiniChrome(win: MiniWindowShell | null) {
  if (minimizeInFlight) return;
  if (!win || win.label !== "widget") return;
  if (await win.isMinimized()) return;
  await win.setAlwaysOnTop(true);
  await win.setSkipTaskbar(true);
}

async function defaultWidgetWindow(): Promise<MiniWindowShell | null> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    return {
      label: win.label,
      minimize: () => win.minimize(),
      setAlwaysOnTop: (alwaysOnTop) => win.setAlwaysOnTop(alwaysOnTop),
      setSkipTaskbar: (skip) => win.setSkipTaskbar(skip),
      isMinimized: () => win.isMinimized(),
    };
  } catch {
    return null;
  }
}
