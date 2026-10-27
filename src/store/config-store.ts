import { create } from "zustand";
import { emit, listen } from "@tauri-apps/api/event";
import {
  CONFIG_CHANGED_EVENT,
  coexistenceIsPaused,
  buildCoexistenceSharedItemFields,
  DEFAULT_CALL_CHANNEL,
  DEFAULT_WORK_KIND,
  formatWorkDisplay,
  type AppConfig,
  type CallChannel,
  type CoupleIdentity,
  type DayOverride,
  type GamePlatform,
  type ItemOwner,
  type ScheduleItem,
  type ScheduleTag,
  type WorkKind,
  defaultConfig,
  emptyConfig,
  itemSkippedDates,
  occurrenceAnchorDate,
  parseAppConfig,
  normalizeAddress,
  partnerFacingName,
} from "@/lib/config";
import {
  applyDiskFailure,
  BOOT_CACHE_KEY,
  BOOT_RECOVERY_KEY,
  readCachedConfig,
  readRecoveryCount,
  serializeBootCache,
  shouldApplyDiskConfig,
} from "@/lib/boot-policy";
import { requestBootReload, requestBootRestart } from "@/lib/boot-native";
import {
  ConfigLoadError,
  ConfigLoadTimeoutError,
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
  addressStamp,
  mergeAddressLww,
  mergeCoexistenceLww,
  reconcileSyncResult,
  rekeyAuthoredItems,
  publishRoomRedirect,
  syncRoomOnce,
  type SyncedCoexistence,
} from "@/lib/sync/couple";
import {
  COUPLE_SYNC_FALLBACK_MS,
  COUPLE_SYNC_WAIT_MS,
  decideAfterRoomWait,
  waitForRoomChange,
} from "@/lib/sync/relay";
import { createId, isTauriRuntime } from "@/lib/utils";

type ConfigState = {
  config: AppConfig;
  loading: boolean;
  error: string | null;
  /** 磁盘还没回来时，若手里有上次的副本，用这句话说明，而不是说成空日程。 */
  bootWarning: string | null;
  hydrated: boolean;
  /** 磁盘读取已经结束（成功、超时或损坏）。同步要等它，避免用半份缓存去覆盖房间。 */
  diskSettled: boolean;
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
        | "selfName"
        | "selfColor"
        | "partnerName"
        | "partnerColor"
        | "addressForThem"
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
  syncNow: () => Promise<boolean>;
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

let syncInFlight: Promise<boolean> | null = null;
let syncQueued = false;
/** 最近一次中继房间代数，长轮询从此处接着等 */
let lastRoomRev = 0;

/** 日程写入串行。单次取消的保存若与删除重叠，后完成的那次会把整段写回来。 */
let configWrite: Promise<unknown> = Promise.resolve();

function syncedCoexistence(config: AppConfig): SyncedCoexistence | null {
  if (!config.coexistence.updatedAt) return null;
  return {
    current: config.coexistence.current,
    updatedAt: config.coexistence.updatedAt,
  };
}

async function leaveRedirect(fromCode: string, toCode: string) {
  const { config } = useConfigStore.getState();
  const from = normalizeInviteCode(fromCode);
  const to = normalizeInviteCode(toCode);
  if (!from || from === to) return;
  await publishRoomRedirect({
    fromCode: from,
    toCode: to,
    couple: config.couple,
    items: config.items,
    deletedItems: config.deletedItems,
    coexistence: syncedCoexistence(config),
    baseUrl: config.syncRelayUrl,
  });
}

function enqueueConfigWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = configWrite.then(task, task);
  configWrite = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function runSyncOnce(): Promise<boolean> {
  const { config } = useConfigStore.getState();
  const set = useConfigStore.setState;
  const code = config.couple.inviteCode;
  if (!code) {
    set({ syncStatus: null });
    return true;
  }
  set({ syncStatus: "同步中…" });

  const result = await syncRoomOnce({
    inviteCode: code,
    couple: config.couple,
    items: config.items,
    deletedItems: config.deletedItems,
    coexistence: config.coexistence.updatedAt
      ? {
          current: config.coexistence.current,
          updatedAt: config.coexistence.updatedAt,
        }
      : null,
    baseUrl: config.syncRelayUrl,
    latest: () => {
      const c = useConfigStore.getState().config;
      return {
        items: c.items,
        deletedItems: c.deletedItems,
        couple: c.couple,
        coexistence: c.coexistence.updatedAt
          ? {
              current: c.coexistence.current,
              updatedAt: c.coexistence.updatedAt,
            }
          : null,
      };
    },
  });

  if (result.partnerOnline || result.selfSliceMerged || !result.error) {
    await enqueueConfigWrite(async () => {
      const latest = useConfigStore.getState().config;
      if (latest.couple.inviteCode !== code) return;
      const reconciled = reconcileSyncResult(latest, result);
      const them = mergeAddressLww(
        addressStamp(latest.couple.addressForThem, latest.couple.addressForThemAt),
        addressStamp(result.couple.addressForThem, result.couple.addressForThemAt),
      );
      const me = mergeAddressLww(
        addressStamp(latest.couple.addressForMe, latest.couple.addressForMeAt),
        addressStamp(result.couple.addressForMe, result.couple.addressForMeAt),
      );
      const session = mergeCoexistenceLww(
        latest.coexistence.updatedAt
          ? {
              current: latest.coexistence.current,
              updatedAt: latest.coexistence.updatedAt,
            }
          : null,
        result.coexistence,
      );
      await useConfigStore.getState().setConfig({
        ...latest,
        couple: {
          ...latest.couple,
          inviteCode: result.couple.inviteCode || latest.couple.inviteCode,
          partnerMemberId: result.couple.partnerMemberId,
          partnerName: result.couple.partnerName,
          partnerColor: result.couple.partnerColor,
          pairedAt: result.couple.pairedAt,
          bindingUpdatedAt:
            result.couple.bindingUpdatedAt || latest.couple.bindingUpdatedAt,
          addressForThem: them?.text ?? latest.couple.addressForThem,
          addressForThemAt: them?.updatedAt ?? latest.couple.addressForThemAt,
          addressForMe: me?.text ?? "",
          addressForMeAt: me?.updatedAt ?? "",
        },
        coexistence: session
          ? {
              ...latest.coexistence,
              current: session.current,
              updatedAt: session.updatedAt,
            }
          : latest.coexistence,
        items: reconciled.items,
        deletedItems: reconciled.deletedItems,
      });
    });
  }

  if (typeof result.roomRev === "number") lastRoomRev = result.roomRev;

  if (result.error) {
    set({ syncStatus: `同步失败：${result.error}` });
    return false;
  }
  set({
    syncStatus: result.partnerOnline
      ? `已同步 · 与「${partnerFacingName(result.couple)}」互知`
      : result.selfSliceMerged
        ? "已同步 · 多端"
        : "已同步 · 等待对方加入",
  });
  return true;
}

function storageGet(storage: "localStorage" | "sessionStorage", key: string) {
  try {
    return globalThis[storage]?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(
  storage: "localStorage" | "sessionStorage",
  key: string,
  value: string,
) {
  try {
    globalThis[storage]?.setItem(key, value);
  } catch {
    // 无痕模式写不进去时，这次启动只是没有镜像
  }
}

function rememberBootCache(config: AppConfig) {
  storageSet("localStorage", BOOT_CACHE_KEY, serializeBootCache(config));
}

const cachedAtLaunch = readCachedConfig(
  storageGet("localStorage", BOOT_CACHE_KEY),
);

let bootEpoch = 0;
let initFlight: Promise<void> | null = null;

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: cachedAtLaunch ?? defaultConfig(),
  loading: cachedAtLaunch == null,
  error: null,
  bootWarning: null,
  hydrated: cachedAtLaunch != null,
  diskSettled: false,
  syncStatus: null,

  init: () => {
    if (initFlight) return initFlight;
    const startedEpoch = bootEpoch;
    const startedAt = Date.now();
    initFlight = (async () => {
      const hadCache = readCachedConfig(storageGet("localStorage", BOOT_CACHE_KEY)) != null;
      console.info(`[boot] start cache=${hadCache}`);
      if (!hadCache) {
        set({ loading: true, error: null, bootWarning: null });
      }
      try {
        const config = await loadConfig();
        rememberBootCache(config);
        console.info(`[boot] disk ok ${Date.now() - startedAt}ms`);
        if (!shouldApplyDiskConfig(startedEpoch, bootEpoch)) {
          set({ diskSettled: true, loading: false, hydrated: true });
          return;
        }
        set({
          config,
          loading: false,
          hydrated: true,
          error: null,
          bootWarning: null,
          diskSettled: true,
        });
        if (config.couple.inviteCode) {
          void get().syncNow();
        }
      } catch (error) {
        const timedOut = error instanceof ConfigLoadTimeoutError;
        const message =
          error instanceof ConfigLoadError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        const decision = applyDiskFailure({
          hadCache,
          timedOut,
          recoveries: readRecoveryCount(
            storageGet("sessionStorage", BOOT_RECOVERY_KEY),
          ),
        });
        console.info(
          `[boot] disk fail ${Date.now() - startedAt}ms timeout=${timedOut} recover=${decision.recover} restart=${decision.restart}`,
        );
        const edited = !shouldApplyDiskConfig(startedEpoch, bootEpoch);
        if (!edited && (decision.recover || decision.restart)) {
          storageSet(
            "sessionStorage",
            BOOT_RECOVERY_KEY,
            String(decision.recoveries),
          );
        }
        if (!edited && decision.keepCache) {
          set({
            diskSettled: true,
            loading: false,
            hydrated: true,
            error: null,
            bootWarning: timedOut
              ? "没能重新读取日程，先显示上次打开时的内容。"
              : `配置没能读出来：${message}。先显示上次打开时的内容。`,
          });
        } else if (!edited) {
          set({
            loading: false,
            hydrated: true,
            diskSettled: true,
            error: message,
            bootWarning: null,
            config: emptyConfig(),
          });
        } else {
          set({ diskSettled: true, loading: false, hydrated: true });
        }
        if (!edited && decision.recover) requestBootReload();
        else if (!edited && decision.restart) requestBootRestart();
      }
    })().finally(() => {
      initFlight = null;
    });
    return initFlight;
  },

  setConfig: async (config, persist = true) => {
    const validated = parseAppConfig(config);
    set({ config: validated, error: null, bootWarning: null });
    bootEpoch += 1;
    rememberBootCache(validated);
    if (persist) {
      await saveConfig(validated);
      await broadcastConfig(validated);
    }
  },

  upsertItem: async (item) => {
    let shouldSync = false;
    await enqueueConfigWrite(async () => {
      const { config, setConfig } = get();
      if (
        item.id &&
        config.deletedItems[item.id] &&
        !config.items.some((it) => it.id === item.id)
      ) {
        return;
      }
      const couple = config.couple;
      const recurrence = item.recurrence ?? "weekly";
      const owner = (item.owner ?? "self") as ItemOwner;
      const tag = item.tag ?? "work";
      const workKind =
        tag === "work"
          ? ((item.workKind ?? DEFAULT_WORK_KIND) as WorkKind)
          : undefined;
      const workPrimary =
        tag === "work" && workKind && workKind !== "other"
          ? item.workPrimary?.trim() || undefined
          : undefined;
      const workSecondary =
        tag === "work" && workKind && workKind !== "other"
          ? item.workSecondary?.trim() || undefined
          : undefined;
      const isCourseSwap =
        tag === "work" && workKind === "class" && !!item.isCourseSwap;
      const effectiveRecurrence = isCourseSwap ? "once" : recurrence;
      const title =
        tag === "work" && workKind && workKind !== "other"
          ? formatWorkDisplay({
              tag,
              workKind,
              workPrimary,
              workSecondary,
              title:
                item.title?.trim() ||
                workPrimary ||
                workSecondary ||
                "工作",
            })
          : item.title.trim();
      const nextItem: ScheduleItem = {
        ...item,
        id: item.id ?? createId(),
        note: item.note?.trim() ? item.note.trim() : undefined,
        title,
        recurrence: effectiveRecurrence,
        weekdays: effectiveRecurrence === "weekly" ? item.weekdays : [],
        date: effectiveRecurrence === "once" ? item.date : undefined,
        endDate:
          effectiveRecurrence === "once" && item.endDate
            ? item.endDate
            : undefined,
        durationMinutes:
          effectiveRecurrence === "once" && item.durationMinutes
            ? item.durationMinutes
            : undefined,
        tag,
        skippedDates:
          effectiveRecurrence === "weekly" ? [...(item.skippedDates ?? [])] : [],
        activeFrom:
          effectiveRecurrence === "weekly" && item.activeFrom
            ? item.activeFrom
            : undefined,
        activeUntil:
          effectiveRecurrence === "weekly" && item.activeUntil
            ? item.activeUntil
            : undefined,
        origin:
          tag === "commute" && item.origin?.trim()
            ? item.origin.trim()
            : undefined,
        destination:
          tag === "commute" && item.destination?.trim()
            ? item.destination.trim()
            : undefined,
        callChannel:
          tag === "call" ? (item.callChannel ?? DEFAULT_CALL_CHANNEL) : undefined,
        gamePlatform:
          tag === "entertainment" ? item.gamePlatform : undefined,
        workKind,
        workPrimary,
        workSecondary,
        isCourseSwap: isCourseSwap ? true : undefined,
        owner,
        ownerId: couple.memberId,
        updatedAt: new Date().toISOString(),
      };
      const exists = config.items.some((it) => it.id === nextItem.id);
      const items = exists
        ? config.items.map((it) => (it.id === nextItem.id ? nextItem : it))
        : [...config.items, nextItem];
      await setConfig({ ...config, items });
      shouldSync = Boolean(config.couple.inviteCode);
    });
    if (shouldSync) void get().syncNow();
  },

  deleteItem: async (id) => {
    await get().deleteItems([id]);
  },

  deleteItems: async (ids) => {
    if (ids.length === 0) return;
    let shouldSync = false;
    await enqueueConfigWrite(async () => {
      const { config, setConfig } = get();
      const drop = new Set(ids);
      const deletedAt = new Date().toISOString();
      const deletedItems = { ...config.deletedItems };
      for (const id of ids) deletedItems[id] = deletedAt;
      await setConfig({
        ...config,
        items: config.items.filter((it) => !drop.has(it.id)),
        deletedItems,
      });
      shouldSync = Boolean(config.couple.inviteCode);
    });
    if (shouldSync) void get().syncNow();
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
          next.workKind = undefined;
          next.workPrimary = undefined;
          next.workSecondary = undefined;
          next.isCourseSwap = undefined;
          next.origin = undefined;
          next.destination = undefined;
        } else if (tag === "entertainment") {
          next.gamePlatform = patch.gamePlatform ?? it.gamePlatform;
          next.callChannel = undefined;
          next.workKind = undefined;
          next.workPrimary = undefined;
          next.workSecondary = undefined;
          next.isCourseSwap = undefined;
          next.origin = undefined;
          next.destination = undefined;
        } else if (tag === "work") {
          next.workKind = it.workKind ?? DEFAULT_WORK_KIND;
          next.callChannel = undefined;
          next.gamePlatform = undefined;
          next.origin = undefined;
          next.destination = undefined;
          if (next.workKind !== "class") next.isCourseSwap = undefined;
        } else {
          next.callChannel = undefined;
          next.gamePlatform = undefined;
          next.workKind = undefined;
          next.workPrimary = undefined;
          next.workSecondary = undefined;
          next.isCourseSwap = undefined;
          if (tag !== "commute") {
            next.origin = undefined;
            next.destination = undefined;
          }
        }
      } else {
        if (patch.callChannel && tag === "call") {
          next.callChannel = patch.callChannel;
        }
        if (patch.gamePlatform && tag === "entertainment") {
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
    const couple = { ...config.couple, ...patch };
    if (patch.addressForThem !== undefined) {
      couple.addressForThem = normalizeAddress(patch.addressForThem);
      couple.addressForThemAt = new Date().toISOString();
    }
    await setConfig({ ...config, couple });
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
    const previous = config.couple.inviteCode
      ? normalizeInviteCode(config.couple.inviteCode)
      : "";
    const code = generateInviteCode(6);
    if (previous && previous !== code) {
      await publishRoomRedirect({
        fromCode: previous,
        toCode: code,
        couple: { ...config.couple, partnerMemberId: null, pairedAt: null },
        items: config.items,
        deletedItems: config.deletedItems,
        coexistence: syncedCoexistence(config),
        baseUrl: config.syncRelayUrl,
      });
    }
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
    if (previous && previous !== code) await leaveRedirect(previous, code);
    return code;
  },

  joinWithCode: async (raw) => {
    if (looksLikeDeviceSyncCode(raw)) {
      throw new Error("这是设备同步码，请用「同步到其他设备」");
    }
    const code = normalizeInviteCode(raw);
    if (code.length < 4) throw new Error("邀请码太短");
    const { config, setConfig, syncNow } = get();
    const previous = config.couple.inviteCode
      ? normalizeInviteCode(config.couple.inviteCode)
      : "";
    if (previous && previous !== code) {
      await publishRoomRedirect({
        fromCode: previous,
        toCode: code,
        couple: { ...config.couple, partnerMemberId: null, pairedAt: null },
        items: config.items,
        deletedItems: config.deletedItems,
        coexistence: syncedCoexistence(config),
        baseUrl: config.syncRelayUrl,
      });
    }
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
    if (previous && previous !== code) await leaveRedirect(previous, code);
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
        addressForMe: "",
        addressForMeAt: "",
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
    if (syncInFlight) {
      syncQueued = true;
      return syncInFlight;
    }
    syncInFlight = (async () => {
      let ok = true;
      do {
        syncQueued = false;
        ok = await runSyncOnce();
      } while (syncQueued);
      return ok;
    })().finally(() => {
      syncInFlight = null;
    });
    return syncInFlight;
  },

  startCoexistence: async () => {
    const { config, setConfig, syncNow } = get();
    if (config.coexistence.current) return;
    const startedAt = new Date().toISOString();
    await setConfig({
      ...config,
      coexistence: {
        ...config.coexistence,
        updatedAt: startedAt,
        current: {
          id: createId(),
          startedAt,
          pauses: [],
        },
      },
    });
    if (get().config.couple.inviteCode) void syncNow();
  },

  pauseCoexistence: async () => {
    const { config, setConfig, syncNow } = get();
    const cur = config.coexistence.current;
    if (!cur || coexistenceIsPaused(cur)) return;
    const pausedAt = new Date().toISOString();
    await setConfig({
      ...config,
      coexistence: {
        ...config.coexistence,
        updatedAt: pausedAt,
        current: {
          ...cur,
          pauses: [...cur.pauses, { pausedAt }],
        },
      },
    });
    if (get().config.couple.inviteCode) void syncNow();
  },

  resumeCoexistence: async () => {
    const { config, setConfig, syncNow } = get();
    const cur = config.coexistence.current;
    if (!cur || !coexistenceIsPaused(cur)) return;
    const resumedAt = new Date().toISOString();
    const pauses = cur.pauses.map((p, i) =>
      i === cur.pauses.length - 1 && !p.resumedAt ? { ...p, resumedAt } : p,
    );
    await setConfig({
      ...config,
      coexistence: {
        ...config.coexistence,
        updatedAt: resumedAt,
        current: { ...cur, pauses },
      },
    });
    if (get().config.couple.inviteCode) void syncNow();
  },

  stopCoexistence: async (opts) => {
    const { config, setConfig, upsertItem, syncNow } = get();
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
        updatedAt: endedAt,
        log: [finished, ...config.coexistence.log].slice(0, 40),
      },
    });
    if (get().config.couple.inviteCode) void syncNow();

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

/** 编辑后对方靠长轮询立刻醒来；连不上中继时改短间隔拉取。 */
export function startCoupleSyncLoop(getConfig: () => AppConfig) {
  let stopped = false;
  const abort = new AbortController();
  let timer = 0;
  let syncFirst = true;

  const schedule = (ms: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void step(), ms);
  };

  async function step() {
    if (stopped) return;
    const cfg = getConfig();
    if (!cfg.couple.inviteCode) {
      syncFirst = true;
      schedule(COUPLE_SYNC_FALLBACK_MS);
      return;
    }
    if (syncFirst) {
      const ok = await useConfigStore.getState().syncNow();
      if (stopped) return;
      if (!ok) {
        schedule(COUPLE_SYNC_FALLBACK_MS);
        return;
      }
    }
    const code = getConfig().couple.inviteCode;
    const baseUrl = getConfig().syncRelayUrl;
    if (!code) {
      syncFirst = true;
      schedule(COUPLE_SYNC_FALLBACK_MS);
      return;
    }
    const wait = await waitForRoomChange({
      inviteCode: code,
      sinceRev: lastRoomRev,
      timeoutMs: COUPLE_SYNC_WAIT_MS,
      baseUrl,
      signal: abort.signal,
    });
    if (stopped || abort.signal.aborted) return;
    const next = decideAfterRoomWait(wait);
    syncFirst = next.sync;
    schedule(next.delayMs);
  }

  // 手机切到后台时 WebView 计时器和长轮询会被冻结；回到前台先拉一次，
  // 对方的改动立刻落盘并刷新桌面小组件。
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    if (!getConfig().couple.inviteCode) return;
    void useConfigStore.getState().syncNow();
  };
  document.addEventListener("visibilitychange", onVisible);

  void step();
  return () => {
    stopped = true;
    abort.abort();
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
