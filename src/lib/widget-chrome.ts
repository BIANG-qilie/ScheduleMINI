import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { availableMonitors, getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  isWidgetRectOnScreen,
  widgetIsPresented,
  type PxRect,
} from "@/lib/widget-placement";
import { isTauriRuntime } from "@/lib/utils";

const GEOMETRY_KEY = "xiaoricheng-widget-geometry";

type StoredGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function applyWidgetOpacity(opacity: number) {
  const clamped = Math.min(1, Math.max(0.4, opacity));
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty(
      "--widget-opacity",
      String(clamped),
    );
  }
}

async function getWidgetWindow() {
  if (!isTauriRuntime()) return null;
  try {
    const current = getCurrentWindow();
    if (current.label === "widget") return current;
  } catch {
    // ignore
  }
  try {
    return await WebviewWindow.getByLabel("widget");
  } catch {
    return null;
  }
}

export function loadWidgetGeometry(): StoredGeometry | null {
  try {
    const raw = localStorage.getItem(GEOMETRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredGeometry>;
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      typeof parsed.width === "number" &&
      typeof parsed.height === "number"
    ) {
      return parsed as StoredGeometry;
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveWidgetGeometry(geo: StoredGeometry) {
  try {
    localStorage.setItem(GEOMETRY_KEY, JSON.stringify(geo));
  } catch {
    // ignore
  }
}

export async function restoreWidgetGeometry() {
  if (!isTauriRuntime()) return;
  const geo = loadWidgetGeometry();
  if (!geo) return;
  const win = await getWidgetWindow();
  if (!win) return;
  try {
    await win.setSize(new LogicalSize(geo.width, geo.height));
    let applyPosition = true;
    try {
      const scale = await win.scaleFactor();
      const monitors = await monitorBounds();
      if (monitors) {
        applyPosition = isWidgetRectOnScreen(
          {
            x: geo.x * scale,
            y: geo.y * scale,
            width: geo.width * scale,
            height: geo.height * scale,
          },
          monitors,
        );
      }
    } catch {
      applyPosition = true;
    }
    if (!applyPosition) return;
    await win.setPosition(new LogicalPosition(geo.x, geo.y));
  } catch {
    // ignore
  }
}

export async function persistCurrentWidgetGeometry() {
  if (!isTauriRuntime()) return;
  try {
    const win = getCurrentWindow();
    if (win.label !== "widget") return;
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    const monitors = await monitorBounds();
    if (
      monitors &&
      !isWidgetRectOnScreen(
        {
          x: pos.x,
          y: pos.y,
          width: size.width,
          height: size.height,
        },
        monitors,
      )
    ) {
      return;
    }
    const scale = await win.scaleFactor();
    saveWidgetGeometry({
      x: pos.x / scale,
      y: pos.y / scale,
      width: size.width / scale,
      height: size.height / scale,
    });
  } catch {
    // ignore
  }
}

async function monitorBounds(): Promise<PxRect[] | null> {
  try {
    const monitors = await availableMonitors();
    return monitors.map((monitor) => ({
      x: monitor.position.x,
      y: monitor.position.y,
      width: monitor.size.width,
      height: monitor.size.height,
    }));
  } catch {
    return null;
  }
}

/** 悬浮窗是不是真的开在屏幕上。读不到窗口时返回 null，调用方不要改按钮。 */
export async function readWidgetPresented(): Promise<boolean | null> {
  const win = await getWidgetWindow();
  if (!win) return null;
  try {
    const [visible, minimized, pos, size, monitors] = await Promise.all([
      win.isVisible(),
      win.isMinimized(),
      win.outerPosition(),
      win.outerSize(),
      monitorBounds(),
    ]);
    if (!monitors) return null;
    const onScreen = isWidgetRectOnScreen(
      {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
      },
      monitors,
    );
    return widgetIsPresented(visible, minimized, onScreen);
  } catch {
    return null;
  }
}

export async function syncWidgetPresentedFlag(
  current: boolean,
  setFlag: (visible: boolean) => Promise<void>,
) {
  const presented = await readWidgetPresented();
  if (presented == null || presented === current) return;
  await setFlag(presented);
}

export async function syncAutostart(enabled: boolean) {
  if (!isTauriRuntime()) return;
  const { enable, disable, isEnabled } = await import(
    "@tauri-apps/plugin-autostart"
  );
  const currently = await isEnabled();
  if (enabled && !currently) await enable();
  if (!enabled && currently) await disable();
}
