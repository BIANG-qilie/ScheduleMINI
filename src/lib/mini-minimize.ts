import type { AppView } from "@/lib/windows";

export type ShellPlatform = "desktop" | "android" | "web";

/** 最小化只出现在桌面悬浮小窗。手机、浏览器和大窗口沿用各自原有窗口。 */
export function showDesktopMiniMinimize(view: AppView, platform: ShellPlatform) {
  return view === "widget" && platform === "desktop";
}

let minimizeInFlight = false;
/**
 * 用户点了最小化之后，在窗口真正缩下去又再展开之前，
 * 不要把置顶和跳过任务栏设回去。否则一次提前的 resize
 * 会在窗口还没缩下去时删掉任务栏按钮，紧接着的最小化
 * 就变成既看不见、任务栏也点不回来。
 */
let suppressChromeRestore = false;
let sawIconic = false;

/** 测试之间清掉模块状态。 */
export function resetDesktopMiniChromeForTests() {
  minimizeInFlight = false;
  suppressChromeRestore = false;
  sawIconic = false;
}

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
 *
 * 任一步失败时回滚置顶/任务栏状态，避免半截调用把小窗弄成既没最小化、又丢了置顶。
 */
export async function minimizeDesktopMiniWindow(
  getWindow: () => Promise<MiniWindowShell | null> = defaultWidgetWindow,
) {
  const win = await getWindow();
  if (!win || win.label !== "widget") return;
  minimizeInFlight = true;
  suppressChromeRestore = true;
  sawIconic = false;
  let chromeChanged = false;
  try {
    await win.setAlwaysOnTop(false);
    chromeChanged = true;
    await win.setSkipTaskbar(false);
    await win.minimize();
  } catch (error) {
    suppressChromeRestore = false;
    sawIconic = false;
    if (chromeChanged) {
      try {
        await win.setAlwaysOnTop(true);
        await win.setSkipTaskbar(true);
      } catch {
        // 回滚失败就留给下次获得焦点时的 restoreDesktopMiniChrome
      }
    }
    throw error;
  } finally {
    minimizeInFlight = false;
  }
}

/** 从小窗还原后，继续浮在最前，并且不占着任务栏。 */
export async function restoreDesktopMiniChrome(win: MiniWindowShell | null) {
  if (minimizeInFlight) return;
  if (!win || win.label !== "widget") return;
  const minimized = await win.isMinimized();
  if (suppressChromeRestore) {
    if (minimized) {
      sawIconic = true;
      return;
    }
    // 最小化指令已经返回，但窗口线程可能还没把它缩下去。
    if (!sawIconic) return;
    suppressChromeRestore = false;
    sawIconic = false;
  } else if (minimized) {
    return;
  }
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
