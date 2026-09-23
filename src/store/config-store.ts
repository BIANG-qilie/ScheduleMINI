import { create } from "zustand";
import { emit, listen } from "@tauri-apps/api/event";
import {
  CONFIG_CHANGED_EVENT,
  type AppConfig,
  type ScheduleItem,
  defaultConfig,
  parseAppConfig,
} from "@/lib/config";
import {
  exportConfigToFile,
  importConfigFromFile,
  loadConfig,
  saveConfig,
} from "@/lib/persistence";
import { createId, isTauriRuntime } from "@/lib/utils";

type ConfigState = {
  config: AppConfig;
  loading: boolean;
  error: string | null;
  hydrated: boolean;
  init: () => Promise<void>;
  setConfig: (config: AppConfig, persist?: boolean) => Promise<void>;
  upsertItem: (item: Omit<ScheduleItem, "id"> & { id?: string }) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  setShowHolidays: (value: boolean) => Promise<void>;
  setWidgetVisible: (value: boolean) => Promise<void>;
  setWidgetMode: (value: AppConfig["widgetMode"]) => Promise<void>;
  setSettingsViewMode: (value: AppConfig["settingsViewMode"]) => Promise<void>;
  exportConfig: () => Promise<void>;
  importConfig: () => Promise<boolean>;
};

async function broadcastConfig(config: AppConfig) {
  if (isTauriRuntime()) {
    await emit(CONFIG_CHANGED_EVENT, config);
  } else if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CONFIG_CHANGED_EVENT, { detail: config }),
    );
  }
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: defaultConfig(),
  loading: true,
  error: null,
  hydrated: false,

  init: async () => {
    set({ loading: true, error: null });
    try {
      const config = await loadConfig();
      set({ config, loading: false, hydrated: true });
    } catch (error) {
      set({
        loading: false,
        hydrated: true,
        error: error instanceof Error ? error.message : String(error),
        config: defaultConfig(),
      });
    }
  },

  setConfig: async (config, persist = true) => {
    const validated = parseAppConfig(config);
    set({ config: validated, error: null });
    if (persist) {
      await saveConfig(validated);
      await broadcastConfig(validated);
    }
  },

  upsertItem: async (item) => {
    const { config, setConfig } = get();
    const nextItem: ScheduleItem = {
      ...item,
      id: item.id ?? createId(),
      note: item.note?.trim() ? item.note.trim() : undefined,
      title: item.title.trim(),
    };
    const exists = config.items.some((it) => it.id === nextItem.id);
    const items = exists
      ? config.items.map((it) => (it.id === nextItem.id ? nextItem : it))
      : [...config.items, nextItem];
    await setConfig({ ...config, items });
  },

  deleteItem: async (id) => {
    const { config, setConfig } = get();
    await setConfig({
      ...config,
      items: config.items.filter((it) => it.id !== id),
    });
  },

  setShowHolidays: async (value) => {
    const { config, setConfig } = get();
    await setConfig({ ...config, showHolidays: value });
  },

  setWidgetVisible: async (value) => {
    const { config, setConfig } = get();
    await setConfig({ ...config, widgetVisible: value });
  },

  setWidgetMode: async (value) => {
    const { config, setConfig } = get();
    await setConfig({ ...config, widgetMode: value });
  },

  setSettingsViewMode: async (value) => {
    const { config, setConfig } = get();
    await setConfig({ ...config, settingsViewMode: value });
  },

  exportConfig: async () => {
    await exportConfigToFile(get().config);
  },

  importConfig: async () => {
    const imported = await importConfigFromFile();
    if (!imported) return false;
    const confirmed = window.confirm(
      "导入将完整替换当前全部配置（日程、节假日开关、悬浮窗状态）。确定继续？",
    );
    if (!confirmed) return false;
    await get().setConfig(imported);
    return true;
  },
}));

export async function subscribeConfigChanges(
  onChange: (config: AppConfig) => void,
): Promise<() => void> {
  if (isTauriRuntime()) {
    return listen<AppConfig>(CONFIG_CHANGED_EVENT, (event) => {
      onChange(event.payload);
    });
  }
  const handler = (event: Event) => {
    const custom = event as CustomEvent<AppConfig>;
    if (custom.detail) onChange(custom.detail);
  };
  window.addEventListener(CONFIG_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CONFIG_CHANGED_EVENT, handler);
}
