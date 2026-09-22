import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "@/lib/utils";

export type AppView = "settings" | "widget";

export function resolveView(): AppView {
  if (typeof window === "undefined") return "settings";
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "widget") return "widget";

  if (isTauriRuntime()) {
    try {
      const label = getCurrentWindow().label;
      if (label === "widget") return "widget";
    } catch {
      // ignore when window API unavailable
    }
  }
  return "settings";
}

export async function showSettingsWindow() {
  if (!isTauriRuntime()) {
    window.location.search = "";
    return;
  }
  await invoke("show_settings");
}

export async function setWidgetVisible(visible: boolean) {
  if (!isTauriRuntime()) {
    if (visible) {
      window.open(`${window.location.origin}/?view=widget`, "schedule-widget");
    }
    return;
  }
  await invoke("set_widget_visible", { visible });
}

export async function toggleWidgetWindow() {
  if (!isTauriRuntime()) {
    window.open(`${window.location.origin}/?view=widget`, "schedule-widget");
    return;
  }
  await invoke("toggle_widget");
}

export async function quitApp() {
  if (!isTauriRuntime()) {
    window.close();
    return;
  }
  await invoke("quit_app");
}
