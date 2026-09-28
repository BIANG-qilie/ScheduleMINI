import { create } from "zustand";
import { emit, listen } from "@tauri-apps/api/event";
import {
  CONFIG_CHANGED_EVENT,
  type AppConfig,
  type CoupleIdentity,
  type DayOverride,
  type ScheduleItem,
  defaultConfig,
  emptyConfig,
  itemSkippedDates,
  occurrenceAnchorDate,
  ownerIsSelf,
  parseAppConfig,
} from "@/lib/config";
import {
  ConfigLoadError,
  exportConfigToFile,
  importConfigFromFile,
  loadConfig,
  saveConfig,
} from "@/lib/persistence";
import {
  encodeDeviceSyncCode,
  generateInviteCode,
  looksLikeDeviceSyncCode,
  normalizeInviteCode,
  parseDeviceSyncCode,
} from "@/lib/sync/crypto";
import {
  pullAndMergePartner,
  pushSelfSlice,
  rekeyAuthoredItems,
} from "@/lib/sync/couple";
import { createId, isTauriRuntime } from "@/lib/utils";

type ConfigState = {
  config: AppConfig;
  loading: boolean;
  error: string | null;
  hydrated: boolean;
  syncStatus: string | null;
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
  setCoupleIdentity: (
    patch: Partial<
      Pick<
        CoupleIdentity,
        "selfName" | "selfColor" | "partnerName" | "partnerColor"
      >
    >,
  ) => Promise<void>;
  setSoloMode: (value: boolean) => Promise<void>;
  setSyncRelayUrl: (url: string) => Promise<void>;
  createInvite: () => Promise<string>;
  joinWithCode: (code: string) => Promise<void>;
  /** 确保有同步房间并返回设备同步码（同一人多端） */
  ensureDeviceSyncCode: () => Promise<string>;
  joinWithDeviceCode: (raw: string) => Promise<void>;
  /** 解除对方配对；保留房间供多端同步 */
  unpair: () => Promise<void>;
  /** 停止房间同步（多端 + 对方） */
  stopRoomSync: () => Promise<void>;
  syncNow: () => Promise<void>;
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
  syncStatus: null,

  init: async () => {
    set({ loading: true, error: null });
    try {
      const config = await loadConfig();
      set({ config, loading: false, hydrated: true, error: null });
      if (config.couple.inviteCode) {
        void get().syncNow();
      }
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
    const { config, setConfig, syncNow } = get();
    const couple = config.couple;
    if (item.id) {
      const existing = config.items.find((it) => it.id === item.id);
      if (existing && !ownerIsSelf(existing, couple)) {
        throw new Error("只能改自己的日程");
      }
    }
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
      activeFrom:
        recurrence === "weekly" && item.activeFrom
          ? item.activeFrom
          : undefined,
      activeUntil:
        recurrence === "weekly" && item.activeUntil
          ? item.activeUntil
          : undefined,
      origin:
        (item.tag ?? "work") === "commute" && item.origin?.trim()
          ? item.origin.trim()
          : undefined,
      destination:
        (item.tag ?? "work") === "commute" && item.destination?.trim()
          ? item.destination.trim()
          : undefined,
      owner: config.soloMode ? "self" : (item.owner ?? "self"),
      ownerId: couple.memberId,
      updatedAt: new Date().toISOString(),
    };
    const exists = config.items.some((it) => it.id === nextItem.id);
    const items = exists
      ? config.items.map((it) => (it.id === nextItem.id ? nextItem : it))
      : [...config.items, nextItem];
    await setConfig({ ...config, items });
    if (config.couple.inviteCode) void syncNow();
  },

  deleteItem: async (id) => {
    const { config, setConfig, syncNow } = get();
    const item = config.items.find((it) => it.id === id);
    if (item && !ownerIsSelf(item, config.couple)) {
      throw new Error("只能删自己的日程");
    }
    await setConfig({
      ...config,
      items: config.items.filter((it) => it.id !== id),
    });
    if (config.couple.inviteCode) void syncNow();
  },

  skipOccurrence: async (id, dateKey) => {
    const { config, upsertItem } = get();
    const item = config.items.find((it) => it.id === id);
    if (!item || (item.recurrence ?? "weekly") !== "weekly") return;
    if (!ownerIsSelf(item, config.couple)) return;
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
    if (!item || !ownerIsSelf(item, config.couple)) return;
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

  setCoupleIdentity: async (patch) => {
    const { config, setConfig, syncNow } = get();
    await setConfig({
      ...config,
      couple: { ...config.couple, ...patch },
    });
    if (get().config.couple.inviteCode) void syncNow();
  },

  setSoloMode: async (value) => {
    const { config, setConfig } = get();
    await setConfig({ ...config, soloMode: value });
  },

  setSyncRelayUrl: async (url) => {
    const { config, setConfig, syncNow } = get();
    await setConfig({
      ...config,
      syncRelayUrl: url.trim(),
    });
    if (get().config.couple.inviteCode) void syncNow();
  },

  createInvite: async () => {
    const { config, setConfig, syncNow } = get();
    const code = generateInviteCode(6);
    await setConfig({
      ...config,
      couple: {
        ...config.couple,
        inviteCode: code,
        partnerMemberId: null,
        pairedAt: null,
      },
    });
    await syncNow();
    return code;
  },

  joinWithCode: async (raw) => {
    if (looksLikeDeviceSyncCode(raw)) {
      throw new Error("这是设备同步码，请用「同步到其他设备」");
    }
    const code = normalizeInviteCode(raw);
    if (code.length < 4) throw new Error("邀请码太短");
    const { config, setConfig, syncNow } = get();
    await setConfig({
      ...config,
      couple: {
        ...config.couple,
        inviteCode: code,
        partnerMemberId: null,
        pairedAt: null,
      },
    });
    await syncNow();
  },

  ensureDeviceSyncCode: async () => {
    const { config, setConfig, syncNow } = get();
    let code = config.couple.inviteCode;
    if (!code) {
      code = generateInviteCode(6);
      await setConfig({
        ...config,
        couple: {
          ...config.couple,
          inviteCode: code,
        },
      });
    }
    await syncNow();
    const next = get().config;
    if (!next.couple.inviteCode) throw new Error("无法建立同步房间");
    return encodeDeviceSyncCode(
      next.couple.inviteCode,
      next.couple.memberId,
    );
  },

  joinWithDeviceCode: async (raw) => {
    const parsed = parseDeviceSyncCode(raw);
    if (!parsed) throw new Error("设备同步码无效");
    const { config, setConfig, syncNow } = get();
    const fromId = config.couple.memberId;
    const toId = parsed.personId;
    const items = rekeyAuthoredItems(config.items, fromId, toId);
    await setConfig({
      ...config,
      couple: {
        ...config.couple,
        memberId: toId,
        inviteCode: parsed.inviteCode,
        // 多端接入不假装成对方；对方信息由后续拉取填充
        partnerMemberId: config.couple.partnerMemberId,
        pairedAt: config.couple.pairedAt,
      },
      items,
    });
    await syncNow();
  },

  unpair: async () => {
    const { config, setConfig } = get();
    const selfId = config.couple.memberId;
    await setConfig({
      ...config,
      couple: {
        ...config.couple,
        partnerMemberId: null,
        pairedAt: null,
        // 保留 inviteCode，多端同步继续
      },
      items: config.items.filter(
        (it) => (it.ownerId || selfId) === selfId,
      ),
    });
    set({ syncStatus: "已解除对方配对" });
  },

  stopRoomSync: async () => {
    const { config, setConfig } = get();
    const selfId = config.couple.memberId;
    await setConfig({
      ...config,
      couple: {
        ...config.couple,
        inviteCode: null,
        partnerMemberId: null,
        pairedAt: null,
      },
      items: config.items.filter(
        (it) => (it.ownerId || selfId) === selfId,
      ),
    });
    set({ syncStatus: "已停止同步" });
  },

  syncNow: async () => {
    const { config, setConfig } = get();
    const code = config.couple.inviteCode;
    if (!code) {
      set({ syncStatus: null });
      return;
    }
    set({ syncStatus: "同步中…" });

    // 先拉合并再推，避免他端较新切片被本机旧数据盖掉
    const pulled = await pullAndMergePartner({
      inviteCode: code,
      couple: config.couple,
      items: config.items,
      baseUrl: config.syncRelayUrl,
    });
    if (pulled.error && !pulled.selfSliceMerged && !pulled.partnerOnline) {
      set({ syncStatus: pulled.error });
      return;
    }

    await setConfig({
      ...get().config,
      couple: pulled.couple,
      items: pulled.items,
    });

    const pushed = await pushSelfSlice({
      inviteCode: code,
      couple: get().config.couple,
      items: get().config.items,
      baseUrl: get().config.syncRelayUrl,
    });
    if (!pushed.ok) {
      set({ syncStatus: pushed.error });
      return;
    }

    if (pulled.error) {
      set({ syncStatus: pulled.error });
      return;
    }

    set({
      syncStatus: pulled.partnerOnline
        ? `已同步 · 与「${pulled.couple.partnerName}」互知`
        : pulled.selfSliceMerged
          ? "已同步 · 多端"
          : "已同步",
    });
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
      "导入将完整替换当前全部配置（日程、配对、悬浮窗）。确定继续？",
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

/** Poll relay while paired / waiting. */
export function startCoupleSyncLoop(getConfig: () => AppConfig) {
  const tick = () => {
    const cfg = getConfig();
    if (!cfg.couple.inviteCode) return;
    void useConfigStore.getState().syncNow();
  };
  tick();
  const id = window.setInterval(tick, 20_000);
  return () => window.clearInterval(id);
}
