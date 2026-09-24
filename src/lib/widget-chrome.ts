import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { WIDGET_SIZE_PX, type WidgetSize } from "@/lib/config";
import { isTauriRuntime } from "@/lib/utils";

const POSITION_KEY = "xiaoricheng-widget-position";

type StoredPosition = { x: number; y: number };

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

export async function applyWidgetSize(size: WidgetSize) {
  const dim = WIDGET_SIZE_PX[size];
  if (!isTauriRuntime()) {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty(
        "--widget-width",
        `${dim.width}px`,
      );
      document.documentElement.style.setProperty(
        "--widget-height",
        `${dim.height}px`,
      );
    }
    return;
  }
  const win = await getWidgetWindow();
  if (!win) return;
  try {
    await win.setSize(new LogicalSize(dim.width, dim.height));
  } catch {
    // ignore when window API unavailable
  }
}

export function loadWidgetPosition(): StoredPosition | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPosition;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveWidgetPosition(pos: StoredPosition) {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

export async function restoreWidgetPosition() {
  if (!isTauriRuntime()) return;
  const pos = loadWidgetPosition();
  if (!pos) return;
  const win = await getWidgetWindow();
  if (!win) return;
  try {
    await win.setPosition(new LogicalPosition(pos.x, pos.y));
  } catch {
    // ignore
  }
}

export async function persistCurrentWidgetPosition() {
  if (!isTauriRuntime()) return;
  try {
    const win = getCurrentWindow();
    if (win.label !== "widget") return;
    const pos = await win.outerPosition();
    const scale = await win.scaleFactor();
    saveWidgetPosition({
      x: pos.x / scale,
      y: pos.y / scale,
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
