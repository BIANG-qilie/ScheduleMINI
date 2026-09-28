import { create } from "zustand";
import { emit, listen } from "@tauri-apps/api/event";
import {
  CONFIG_CHANGED_EVENT,
  coexistenceIsPaused,
  buildCoexistenceSharedItemFields,
  DEFAULT_CALL_CHANNEL,
  type AppConfig,
  type CallChannel,
  type CoupleIdentity,
  type DayOverride,
  type GamePlatform,
  type ItemOwner,
  type ScheduleItem,
  type ScheduleTag,
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
  upsertItem: (
    item: Omit<ScheduleItem, "id" | "skippedDates"> & {
      id?: string;
      skippedDates?: string[];
      callChannel?: CallChannel;
      gamePlatform?: GamePlatform;
    },
  ) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  deleteItems: (ids: string[]) => Promise<void>;
  patchItems: (
    ids: string[],
    patch: Partial<
      Pick<ScheduleItem, "tag" | "owner" | "callChannel" | "gamePlatform">
    >,
  ) => Promise<void>;
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
  ensureDeviceSyncCode: () => Promise<string>;
  joinWithDeviceCode: (raw: string) => Promise<void>;
  unpair: () => Promise<void>;
  stopRoomSync: () => Promise<void>;
  syncNow: () => Promise<void>;
  startCoexistence: () => Promise<void>;
  pauseCoexistence: () => Promise<void>;
  resumeCoexistence: () => Promise<void>;
  /** 结束共处；createSharedItem 时写入壁钟 once 共同日程 */
  stopCoexistence: (opts?: {
    createSharedItem?: boolean;
  }) => Promise<{ createdItemId?: string } | null>;
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
    const recurrence = item.recurrence ?? "weekly";
    const owner = (item.owner ?? "self") as ItemOwner;
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
      callChannel:
        (item.tag ?? "work") === "call"
          ? (item.callChannel ?? DEFAULT_CALL_CHANNEL)
          : undefined,
      gamePlatform:
        (item.tag ?? "work") === "game" ? item.gamePlatform : undefined,
      owner,
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
    await get().deleteItems([id]);
  },

  deleteItems: async (ids) => {
    if (ids.length === 0) return;
    const { config, setConfig, syncNow } = get();
    const drop = new Set(ids);
    await setConfig({
      ...config,
      items: config.items.filter((it) => !drop.has(it.id)),
    });
    if (config.couple.inviteCode) void syncNow();
  },

  patchItems: async (ids, patch) => {
    if (ids.length === 0) return;
    const { config, setConfig, syncNow } = get();
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const items = config.items.map((it) => {
      if (!idSet.has(it.id)) return it;
      const tag = (patch.tag ?? it.tag ?? "work") as ScheduleTag;
      const next: ScheduleItem = {
        ...it,
        ...(patch.tag ? { tag } : {}),
        ...(patch.owner ? { owner: patch.owner as ItemOwner } : {}),
        ownerId: config.couple.memberId,
        updatedAt: now,
      };
      if (patch.tag) {
        if (tag === "call") {
          next.callChannel =
            patch.callChannel ?? it.callChannel ?? DEFAULT_CALL_CHANNEL;
          next.gamePlatform = undefined;
          next.origin = undefined;
          next.destination = undefined;
        } else if (tag === "game") {
          next.gamePlatform = patch.gamePlatform ?? it.gamePlatform;
          next.callChannel = undefined;
          next.origin = undefined;
          next.destination = undefined;
        } else {
          next.callChannel = undefined;
          next.gamePlatform = undefined;
          if (tag !== "commute") {
            next.origin = undefined;
            next.destination = undefined;
          }
        }
      } else {
        if (patch.callChannel && tag === "call") {
          next.callChannel = patch.callChannel;
        }
        if (patch.gamePlatform && tag === "game") {
          next.gamePlatform = patch.gamePlatform;
        }
      }
      return next;
    });
    await setConfig({ ...config, items });
    if (config.couple.inviteCode) void syncNow();
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
        partnerMemberId: config.couple.partnerMemberId,
        pairedAt: config.couple.pairedAt,
      },
      items,
    });
    await syncNow();
  },

  unpair: async () => {
    const { config, setConfig } = get();
    await setConfig({
      ...config,
      couple: {
        ...config.couple,
        partnerMemberId: null,
        pairedAt: null,
      },
    });
    set({ syncStatus: "已解除对方配对" });
  },

  stopRoomSync: async () => {
    const { config, setConfig } = get();
    await setConfig({
      ...config,
      couple: {
        ...config.couple,
        inviteCode: null,
        partnerMemberId: null,
        pairedAt: null,
      },
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

  startCoexistence: async () => {
    const { config, setConfig } = get();
    if (config.coexistence.current) return;
    await setConfig({
      ...config,
      coexistence: {
        ...config.coexistence,
        current: {
          id: createId(),
          startedAt: new Date().toISOString(),
          pauses: [],
        },
      },
    });
  },

  pauseCoexistence: async () => {
    const { config, setConfig } = get();
    const cur = config.coexistence.current;
    if (!cur || coexistenceIsPaused(cur)) return;
    await setConfig({
      ...config,
      coexistence: {
        ...config.coexistence,
        current: {
          ...cur,
          pauses: [
            ...cur.pauses,
            { pausedAt: new Date().toISOString() },
          ],
        },
      },
    });
  },

  resumeCoexistence: async () => {
    const { config, setConfig } = get();
    const cur = config.coexistence.current;
    if (!cur || !coexistenceIsPaused(cur)) return;
    const pauses = cur.pauses.map((p, i) =>
      i === cur.pauses.length - 1 && !p.resumedAt
        ? { ...p, resumedAt: new Date().toISOString() }
        : p,
    );
    await setConfig({
      ...config,
      coexistence: {
        ...config.coexistence,
        current: { ...cur, pauses },
      },
    });
  },

  stopCoexistence: async (opts) => {
    const { config, setConfig, upsertItem } = get();
    const cur = config.coexistence.current;
    if (!cur) return null;
    const endedAt = new Date().toISOString();
    const pauses = cur.pauses.map((p, i) =>
      i === cur.pauses.length - 1 && !p.resumedAt
        ? { ...p, resumedAt: endedAt }
        : p,
    );
    const finished = {
      id: cur.id,
      startedAt: cur.startedAt,
      endedAt,
      pauses,
    };
    await setConfig({
      ...config,
      coexistence: {
        current: null,
        log: [finished, ...config.coexistence.log].slice(0, 40),
      },
    });

    if (!opts?.createSharedItem) return {};

    const fields = buildCoexistenceSharedItemFields(finished);
    const id = createId();
    await upsertItem({
      id,
      ...fields,
    });
    return { createdItemId: id };
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
