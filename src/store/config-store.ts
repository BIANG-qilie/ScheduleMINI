import { create } from "zustand";
import { emit, listen } from "@tauri-apps/api/event";
import {
  CONFIG_CHANGED_EVENT,
  type AppConfig,
  type DayOverride,
  type ScheduleItem,
  defaultConfig,
  emptyConfig,
  itemSkippedDates,
  occurrenceAnchorDate,
  parseAppConfig,
} from "@/lib/config";
import {
  ConfigLoadError,
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
  skipOccurrence: (id: string, dateKey: string) => Promise<void>;
  unskipOccurrence: (id: string, dateKey: string) => Promise<void>;
  setShowHolidays: (value: boolean) => Promise<void>;
  setWidgetVisible: (value: boolean) => Promise<void>;
  setWidgetMode: (value: AppConfig["widgetMode"]) => Promise<void>;
  setSettingsViewMode: (value: AppConfig["settingsViewMode"]) => Promise<void>;
  setAutostart: (value: boolean) => Promise<void>;
  setRemindersEnabled: (value: boolean) => Promise<void>;
  setReminderMinutesBefore: (
    value: AppConfig["reminderMinutesBefore"],
  ) => Promise<void>;
  setWidgetOpacity: (value: number) => Promise<void>;
  setGridHours: (start: number, end: number) => Promise<void>;
  setDayOverride: (
    dateKey: string,
    value: DayOverride | null,
  ) => Promise<void>;
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
      set({ config, loading: false, hydrated: true, error: null });
    } catch (error) {
      const message =
        error instanceof ConfigLoadError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      set({
        loading: false,
        hydrated: true,
        error: message,
        config: emptyConfig(),
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
    const recurrence = item.recurrence ?? "weekly";
    const nextItem: ScheduleItem = {
      ...item,
      id: item.id ?? createId(),
      note: item.note?.trim() ? item.note.trim() : undefined,
      title: item.title.trim(),
      recurrence,
      weekdays: recurrence === "weekly" ? item.weekdays : [],
      date: recurrence === "once" ? item.date : undefined,
      tag: item.tag ?? "work",
      skippedDates:
        recurrence === "weekly" ? [...(item.skippedDates ?? [])] : [],
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

  skipOccurrence: async (id, dateKey) => {
    const { config, upsertItem } = get();
    const item = config.items.find((it) => it.id === id);
    if (!item || (item.recurrence ?? "weekly") !== "weekly") return;
    const anchor = occurrenceAnchorDate(item, dateKey);
    const skipped = itemSkippedDates(item);
    if (skipped.includes(anchor)) return;
    await upsertItem({
      ...item,
      skippedDates: [...skipped, anchor].sort(),
    });
  },

  unskipOccurrence: async (id, dateKey) => {
    const { config, upsertItem } = get();
    const item = config.items.find((it) => it.id === id);
    if (!item) return;
    const skipped = itemSkippedDates(item);
    if (!skipped.includes(dateKey)) return;
    await upsertItem({
      ...item,
      skippedDates: skipped.filter((d) => d !== dateKey),
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

  setAutostart: async (value) => {
    const { config, setConfig } = get();
    await setConfig({ ...config, autostart: value });
  },

  setRemindersEnabled: async (value) => {
    const { config, setConfig } = get();
    await setConfig({ ...config, remindersEnabled: value });
  },

  setReminderMinutesBefore: async (value) => {
    const { config, setConfig } = get();
    await setConfig({ ...config, reminderMinutesBefore: value });
  },

  setWidgetOpacity: async (value) => {
    const { config, setConfig } = get();
    await setConfig({ ...config, widgetOpacity: value });
  },

  setGridHours: async (start, end) => {
    const { config, setConfig } = get();
    await setConfig({ ...config, gridStartHour: start, gridEndHour: end });
  },

  setDayOverride: async (dateKey, value) => {
    const { config, setConfig } = get();
    const dayOverrides = { ...config.dayOverrides };
    if (value == null) {
      delete dayOverrides[dateKey];
    } else {
      dayOverrides[dateKey] = value;
    }
    await setConfig({ ...config, dayOverrides });
  },

  exportConfig: async () => {
    await exportConfigToFile(get().config);
  },

  importConfig: async () => {
    const result = await importConfigFromFile();
    if (!result.ok) {
      if (result.cancelled) return false;
      throw new Error(result.error);
    }
    const confirmed = window.confirm(
      "导入将完整替换当前全部配置（日程、节假日开关、悬浮窗状态）。确定继续？",
    );
    if (!confirmed) return false;
    await get().setConfig(result.config);
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
