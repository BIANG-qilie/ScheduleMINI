import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
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

export async function syncAutostart(enabled: boolean) {
  if (!isTauriRuntime()) return;
  const { enable, disable, isEnabled } = await import(
    "@tauri-apps/plugin-autostart"
  );
  const currently = await isEnabled();
  if (enabled && !currently) await enable();
  if (!enabled && currently) await disable();
}
