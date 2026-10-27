import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  Download,
  Eye,
  EyeOff,
  List,
  Pencil,
  Plus,
  Settings,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AboutSection } from "@/components/UpdatePrompt";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { WeekGrid } from "@/components/WeekGrid";
import { PhoneGlance } from "@/components/PhoneGlance";
import { CoexistenceBar } from "@/components/CoexistenceBar";
import { CreateActionSheet } from "@/components/CreateActionSheet";
import { CallAllowlistEditor } from "@/components/CallAllowlistEditor";
import { DayReplayEntry } from "@/components/DayReplayEntry";
import { hasDayReplayBridge } from "@/lib/day-replay-native";
import type { Draft } from "@/components/ScheduleEditor";
import {
  readTagLabelOverrides,
  setTagLabelOverride,
  type TagLabelOverrides,
} from "@/lib/tag-label-overrides";
import {
  callBackfillTitle,
  describeCallBackfill,
  isBackfillCallItem,
  isCallBackfillPreset,
  reconstructCallBackfill,
  toDatetimeLocalValue,
} from "@/lib/call-backfill";
import { markBootReady } from "@/lib/boot-native";

const ScheduleEditor = lazy(() =>
  import("@/components/ScheduleEditor").then((m) => ({ default: m.ScheduleEditor })),
);
import {
  ADDRESS_MAX,
  APP_DISPLAY_NAME,
  calledByPartner,
  DEFAULT_CALL_CHANNEL,
  DEFAULT_WORK_KIND,
  SCHEDULE_TAG_OPTIONS,
  WORK_KIND_META,
  formatDateKey,
  formatItemSpan,
  formatScheduleScope,
  formatTagLabel,
  pairBanner,
  itemCallChannel,
  itemDisplayTitle,
  itemGamePlatform,
  itemIsCourseSwap,
  itemSkippedDates,
  onceEndDate,
  resolveOnceSpan,
  itemWorkKind,
  ownerColor,
  ownerLabel,
  partnerFacingName,
  workKindRequiredField,
  type ItemOwner,
  type ReminderMinutes,
  type ScheduleItem,
  type ScheduleTag,
} from "@/lib/config";
import { ensureHolidayData, getTodayLabel, onHolidayData } from "@/lib/holidays";
import { startReminderLoop } from "@/lib/reminders";
import {
  TAG_BAR,
  formatItemSubline,
  itemHoverText,
  ownerChipStyle,
  ownerRailStyle,
  scheduleChipClass,
} from "@/lib/schedule-style";
import {
  DEFAULT_LIST_FILTERS,
  queryListItems,
  type ListFilters,
} from "@/lib/list-query";
import { resolveRelayBaseUrl } from "@/lib/sync/relay";
import { syncAutostart } from "@/lib/widget-chrome";
import {
  setWidgetVisible,
  subscribeWidgetVisibility,
} from "@/lib/windows";
import {
  startCoupleSyncLoop,
  subscribeConfigChanges,
  useConfigStore,
} from "@/store/config-store";
import { useNarrow } from "@/lib/use-narrow";
import { cn } from "@/lib/utils";

const emptyDraft = (): Draft => {
  const today = formatDateKey(new Date());
  return {
    start: "09:00",
    end: "10:00",
    title: "",
    note: "",
    weekdays: [1, 2, 3, 4, 5],
    enabled: true,
    recurrence: "weekly",
    date: today,
    endDate: today,
    activeFrom: "",
    activeUntil: "",
    tag: "work",
    origin: "",
    destination: "",
    callChannel: DEFAULT_CALL_CHANNEL,
    gamePlatform: "",
    workKind: DEFAULT_WORK_KIND,
    workPrimary: "",
    workSecondary: "",
    isCourseSwap: false,
    owner: "self",
    callEntry: "plan",
    backfillEnd: toDatetimeLocalValue(new Date()),
    backfillPreset: null,
    backfillCustom: "",
    backfillSeeded: false,
  };
};

function itemToDraft(item: ScheduleItem): Draft {
  const today = formatDateKey(new Date());
  const workKind = itemWorkKind(item) ?? DEFAULT_WORK_KIND;
  const backfill = isBackfillCallItem(item);
  const rebuilt =
    backfill && item.date
      ? reconstructCallBackfill({
          start: item.start,
          end: item.end,
          date: item.date,
          durationMinutes: item.durationMinutes,
        })
      : null;
  const preset =
    rebuilt && isCallBackfillPreset(rebuilt.durationMinutes)
      ? rebuilt.durationMinutes
      : null;
  return {
    id: item.id,
    start: item.start,
    end: item.end,
    title: item.title,
    note: item.note ?? "",
    weekdays: [...item.weekdays],
    enabled: item.enabled,
    recurrence: item.recurrence ?? "weekly",
    date: item.date ?? today,
    endDate: onceEndDate(item) || today,
    activeFrom: item.activeFrom ?? "",
    activeUntil: item.activeUntil ?? "",
    tag: item.tag ?? "work",
    origin: item.origin ?? "",
    destination: item.destination ?? "",
    callChannel: itemCallChannel(item) ?? DEFAULT_CALL_CHANNEL,
    gamePlatform: itemGamePlatform(item) ?? "",
    workKind,
    workPrimary: item.workPrimary ?? "",
    workSecondary: item.workSecondary ?? "",
    isCourseSwap: itemIsCourseSwap(item),
    owner: item.owner ?? "self",
    callEntry: backfill ? "backfill" : "plan",
    backfillEnd: rebuilt?.backfillEnd ?? toDatetimeLocalValue(new Date()),
    backfillPreset: preset,
    backfillCustom:
      rebuilt && preset == null ? String(rebuilt.durationMinutes) : "",
    backfillSeeded: backfill,
    durationMinutes: item.durationMinutes,
  };
}

export function SettingsPage() {
  const {
    config,
    loading,
    error,
    bootWarning,
    hydrated,
    diskSettled,
    init,
    upsertItem,
    deleteItem,
    deleteItems,
    patchItems,
    skipOccurrence,
    unskipOccurrence,
    setShowHolidays,
    setWidgetVisible: setWidgetVisibleFlag,
    setWidgetMode,
    setSettingsViewMode,
    setAutostart,
    setRemindersEnabled,
    setReminderMinutesBefore,
    setWidgetOpacity,
    setGridHours,
    setDayOverride,
    setCoupleIdentity,
    setSoloMode,
    setSyncRelayUrl,
    createInvite,
    joinWithCode,
    ensureDeviceSyncCode,
    joinWithDeviceCode,
    unpair,
    stopRoomSync,
    syncNow,
    syncStatus,
    exportConfig,
    importConfig,
    setConfig,
  } = useConfigStore();

  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [occurrenceDate, setOccurrenceDate] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [heartBurst, setHeartBurst] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [deviceJoinCode, setDeviceJoinCode] = useState("");
  const [deviceSyncCode, setDeviceSyncCode] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [tagLabelOverrides, setTagLabelOverrides] = useState<TagLabelOverrides>(
    {},
  );
  const [prefsTab, setPrefsTab] = useState<"couple" | "display" | "data">(
    "couple",
  );
  const narrow = useNarrow();
  const [phoneTab, setPhoneTab] = useState<"now" | "week" | "list">("now");
  const [listFilters, setListFilters] =
    useState<ListFilters>(DEFAULT_LIST_FILTERS);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const canReplay = narrow && hasDayReplayBridge();

  useEffect(() => {
    const openNow = () => setPhoneTab("now");
    window.__scheduleOpenNow = openNow;
    if (window.SmWidget?.consumeOpenNow?.()) openNow();
    return () => {
      if (window.__scheduleOpenNow === openNow) {
        window.__scheduleOpenNow = undefined;
      }
    };
  }, []);

  useEffect(() => {
    void init();
  }, [init]);

  const alertStatus =
    !!status &&
    (status.startsWith("导入失败") || status.startsWith("配置加载"));

  useEffect(() => {
    if (!narrow || !status || alertStatus) return;
    const id = window.setTimeout(() => setStatus(null), 2600);
    return () => window.clearTimeout(id);
  }, [narrow, status, alertStatus]);

  const [holidayTick, setHolidayTick] = useState(0);
  useEffect(() => onHolidayData(() => setHolidayTick((n) => n + 1)), []);

  // 首屏先画出来再拉节假日。提醒和同步要等磁盘读完，避免拿缓存去改房间。
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const start = () => {
      if (!cancelled) void ensureHolidayData();
    };
    const ric =
      "requestIdleCallback" in window ? window.requestIdleCallback : null;
    const handle = ric
      ? ric(start, { timeout: 700 })
      : window.setTimeout(start, 350);
    return () => {
      cancelled = true;
      if (ric) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [hydrated]);

  useEffect(() => {
    if (!diskSettled) return;
    const stops: Array<() => void> = [];
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      stops.push(startReminderLoop(() => useConfigStore.getState().config));
      stops.push(startCoupleSyncLoop(() => useConfigStore.getState().config));
    };
    const ric =
      "requestIdleCallback" in window ? window.requestIdleCallback : null;
    const handle = ric
      ? ric(start, { timeout: 700 })
      : window.setTimeout(start, 350);
    return () => {
      cancelled = true;
      if (ric) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      for (const stop of stops) stop();
    };
  }, [diskSettled]);

  useEffect(() => {
    if (!diskSettled) return;
    void syncAutostart(config.autostart);
  }, [diskSettled, config.autostart]);

  useEffect(() => {
    if (!hydrated || loading) return;
    markBootReady();
  }, [hydrated, loading]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void subscribeConfigChanges((next) => {
      void setConfig(next, false);
    }).then((fn) => {
      if (!active) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [setConfig]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void subscribeWidgetVisibility((visible) => {
      const current = useConfigStore.getState().config.widgetVisible;
      if (current === visible) return;
      void setWidgetVisibleFlag(visible);
    }).then((fn) => {
      if (!active) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [setWidgetVisibleFlag]);

  const todayLabel = useMemo(
    () => getTodayLabel(new Date(), config.dayOverrides),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.dayOverrides, holidayTick],
  );
  const sortedItems = useMemo(
    () =>
      [...config.items].sort((a, b) =>
        a.start === b.start
          ? a.title.localeCompare(b.title, "zh-CN")
          : a.start.localeCompare(b.start),
      ),
    [config.items],
  );
  const listItems = useMemo(
    () => queryListItems(config.items, listFilters),
    [config.items, listFilters],
  );
  const listShowingFilters =
    listFilters.tag !== "all" ||
    listFilters.owner !== "all" ||
    listFilters.recurrence !== "all";

  const openCreate = () => {
    setDraft(emptyDraft());
    setOccurrenceDate(null);
    setFormError(null);
    setEditorOpen(true);
  };

  const openCreateAt = (
    weekday: number,
    dateKey: string,
    start: string,
    end: string,
  ) => {
    setDraft({
      ...emptyDraft(),
      start,
      end,
      weekdays: [weekday],
      date: dateKey,
      endDate: dateKey,
      recurrence: "weekly",
      tag: "work",
    });
    setOccurrenceDate(null);
    setFormError(null);
    setEditorOpen(true);
  };

  const openEdit = (item: ScheduleItem, dateKey?: string) => {
    setDraft(itemToDraft(item));
    setOccurrenceDate(
      (item.recurrence ?? "weekly") === "weekly" ? (dateKey ?? null) : null,
    );
    setFormError(null);
    setEditorOpen(true);
  };

  const toggleWeekday = (day: number) => {
    setDraft((prev) => {
      const has = prev.weekdays.includes(day);
      const weekdays = has
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day].sort((a, b) => a - b);
      return { ...prev, weekdays };
    });
  };

  const saveDraft = async () => {
    setFormError(null);
    const structuredWork =
      draft.tag === "work" && draft.workKind !== "other";
    const courseSwap =
      draft.tag === "work" &&
      draft.workKind === "class" &&
      draft.isCourseSwap;
    const backfill = draft.tag === "call" && draft.callEntry === "backfill";
    const described = backfill
      ? describeCallBackfill({
          backfillEnd: draft.backfillEnd,
          preset: draft.backfillPreset,
          custom: draft.backfillCustom,
        })
      : null;
    if (described && described.state !== "ready") {
      setFormError(described.message);
      return;
    }
    const recurrence = courseSwap || backfill ? "once" : draft.recurrence;
    let start = draft.start;
    let end = draft.end;
    let date = draft.date;
    let endDate: string | undefined;
    let durationMinutes: number | undefined;
    if (described?.state === "ready") {
      start = described.resolved.start;
      end = described.resolved.end;
      date = described.resolved.date;
      durationMinutes = described.resolved.durationMinutes;
    } else if (recurrence === "once") {
      const span = resolveOnceSpan({
        date: draft.date,
        start: draft.start,
        endDate: draft.endDate || draft.date,
        end: draft.end,
      });
      if (!span.ok) {
        setFormError(span.message);
        return;
      }
      start = span.start;
      end = span.end;
      date = span.date;
      endDate = span.endDate;
      durationMinutes = span.durationMinutes;
    } else if (start === end) {
      setFormError("结束时间不能与开始时间相同");
      return;
    }
    const title =
      described?.state === "ready"
        ? callBackfillTitle(draft.callChannel || DEFAULT_CALL_CHANNEL)
        : draft.title;
    if (structuredWork) {
      const required = workKindRequiredField(draft.workKind);
      if (required === "primary" && !draft.workPrimary.trim()) {
        setFormError(`请填写${WORK_KIND_META[draft.workKind].primaryLabel}`);
        return;
      }
      if (required === "secondary" && !draft.workSecondary.trim()) {
        setFormError(`请填写${WORK_KIND_META[draft.workKind].secondaryLabel}`);
        return;
      }
    } else if (!title.trim()) {
      setFormError("请填写标题");
      return;
    }
    if (recurrence === "weekly" && draft.weekdays.length === 0) {
      setFormError("请至少选择一个星期几");
      return;
    }
    if (recurrence === "once" && !date) {
      setFormError("请选择日期");
      return;
    }
    if (
      recurrence === "weekly" &&
      draft.activeFrom &&
      draft.activeUntil &&
      draft.activeUntil < draft.activeFrom
    ) {
      setFormError("失效日不能早于生效日");
      return;
    }
    setBusy(true);
    try {
      const existing = draft.id
        ? config.items.find((it) => it.id === draft.id)
        : undefined;
      const workTitle = structuredWork
        ? draft.workPrimary.trim() ||
          draft.workSecondary.trim() ||
          title.trim()
        : title.trim();
      await upsertItem({
        id: draft.id,
        start,
        end,
        title: workTitle,
        note: draft.note,
        weekdays: recurrence === "weekly" ? draft.weekdays : [],
        enabled: draft.enabled,
        recurrence,
        date: recurrence === "once" ? date : undefined,
        endDate: recurrence === "once" ? endDate : undefined,
        tag: draft.tag,
        owner: config.soloMode ? "self" : draft.owner,
        activeFrom:
          recurrence === "weekly" && draft.activeFrom
            ? draft.activeFrom
            : undefined,
        activeUntil:
          recurrence === "weekly" && draft.activeUntil
            ? draft.activeUntil
            : undefined,
        skippedDates:
          recurrence === "weekly" && existing
            ? itemSkippedDates(existing)
            : [],
        origin: draft.tag === "commute" ? draft.origin : undefined,
        destination: draft.tag === "commute" ? draft.destination : undefined,
        callChannel:
          draft.tag === "call"
            ? draft.callChannel || DEFAULT_CALL_CHANNEL
            : undefined,
        gamePlatform:
          draft.tag === "game" && draft.gamePlatform
            ? draft.gamePlatform
            : undefined,
        workKind: draft.tag === "work" ? draft.workKind : undefined,
        workPrimary:
          draft.tag === "work" && draft.workKind !== "other"
            ? draft.workPrimary
            : undefined,
        workSecondary:
          draft.tag === "work" && draft.workKind !== "other"
            ? draft.workSecondary
            : undefined,
        isCourseSwap: courseSwap || undefined,
        durationMinutes,
      });
      setEditorOpen(false);
      setOccurrenceDate(null);
      setStatus(draft.id ? "已更新日程" : "已添加日程");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const ok = await importConfig();
      if (ok) {
        setPrefsOpen(false);
        setStatus("配置已导入并替换");
        if (useConfigStore.getState().config.widgetVisible) {
          await setWidgetVisible(true);
        }
      }
    } catch (err) {
      setPrefsOpen(false);
      setStatus(
        `导入失败：${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      await exportConfig();
      setStatus("配置已导出");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleWidget = async (visible: boolean) => {
    setBusy(true);
    try {
      // 先改原生窗；成功后再写配置。托盘路径靠 widget-visibility-changed 回写按钮。
      await setWidgetVisible(visible);
      await setWidgetVisibleFlag(visible);
      setStatus(visible ? "已打开悬浮窗" : "已关闭悬浮窗");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!hydrated || loading) {
    return (
      <div className="boot-screen" aria-busy="true">
        <p className="kicker">双人日程</p>
        <h1>{APP_DISPLAY_NAME}</h1>
        <span aria-hidden />
      </div>
    );
  }


  return (
    <div className={cn("flex h-full min-h-full flex-col", narrow && "phone-shell")}>
      {narrow ? (
        <header className="phone-top">
          <h1>{APP_DISPLAY_NAME}</h1>
          <p>
            {phoneTab === "now"
              ? config.soloMode
                ? "一个人"
                : `${config.couple.selfName} · ${partnerFacingName(config.couple)}`
              : `共 ${sortedItems.length} 条`}
          </p>
        </header>
      ) : null}
      {!narrow ? (
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-[var(--color-line)] px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="kicker">双人日程</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="font-display text-[2rem] font-medium leading-none tracking-tight text-[var(--color-ink)]">
              {APP_DISPLAY_NAME}
            </h1>
            <p className="text-sm text-[var(--color-ink-muted)]">
              共 {sortedItems.length} 条
              {todayLabel.kind !== "none" ? ` · ${todayLabel.name}` : ""}
            </p>
          </div>
          {!config.soloMode ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: config.couple.selfColor }}
                />
                {config.couple.selfName}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: config.couple.partnerColor }}
                />
                {partnerFacingName(config.couple)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: "#f3a6a0" }}
                />
                共同
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-surface)_80%,white)] p-1">
            <button
              type="button"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs tracking-wide",
                config.settingsViewMode === "week"
                  ? "bg-[var(--color-ink)] text-[var(--color-surface)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
              )}
              onClick={() => void setSettingsViewMode("week")}
            >
              <CalendarRange className="h-3.5 w-3.5" />
              周视图
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs tracking-wide",
                config.settingsViewMode === "list"
                  ? "bg-[var(--color-ink)] text-[var(--color-surface)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
              )}
              onClick={() => void setSettingsViewMode("list")}
            >
              <List className="h-3.5 w-3.5" />
              列表
            </button>
          </div>
          {syncStatus?.startsWith("同步失败") ? (
            <button
              type="button"
              role="status"
              className="max-w-72 whitespace-normal break-words text-left text-xs leading-snug text-red-700 underline-offset-2 hover:underline"
              onClick={() => {
                setPrefsTab("couple");
                setPrefsOpen(true);
              }}
            >
              {syncStatus}
            </button>
          ) : null}
          <CoexistenceBar />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPrefsOpen(true)}
          >
            <Settings className="h-4 w-4" />
            设置
          </Button>
          <Button type="button" onClick={openCreate} disabled={busy}>
            <Plus className="h-4 w-4" />
            新建日程
          </Button>
        </div>
      </header>
      ) : null}

      {bootWarning ? (
        <div
          role="status"
          className="mx-4 mt-3 rounded-2xl border border-[color-mix(in_oklab,var(--color-warn)_35%,white)] bg-[color-mix(in_oklab,var(--color-warn)_8%,white)] px-4 py-3 text-sm text-[var(--color-warn)] sm:mx-6"
        >
          {bootWarning}
        </div>
      ) : null}

      {error ? (
        <div className="mx-4 mt-3 rounded-2xl border border-[color-mix(in_oklab,var(--color-danger)_35%,white)] bg-[color-mix(in_oklab,var(--color-danger)_8%,white)] px-4 py-3 text-sm text-[var(--color-danger)] sm:mx-6">
          配置加载失败：{error}。已使用空日程，请修复配置文件或重新导入。
        </div>
      ) : null}

      {status ? (
        <div
          role={alertStatus ? "alert" : "status"}
          className={cn(
            "mx-4 mt-3 rounded-2xl border px-4 py-2.5 text-sm sm:mx-6",
            narrow && !alertStatus && "phone-toast",
            alertStatus
              ? "border-[color-mix(in_oklab,var(--color-danger)_35%,white)] bg-[color-mix(in_oklab,var(--color-danger)_8%,white)] text-[var(--color-danger)]"
              : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)]",
          )}
        >
          {status}
        </div>
      ) : null}

      <section
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-6",
          narrow &&
            "phone-main px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-2",
        )}
      >
          {narrow && phoneTab === "now" ? (
            <PhoneGlance
              couple={config.couple}
              soloMode={config.soloMode}
              showHolidays={config.showHolidays}
            />
          ) : null}

          {selectedIds.size > 0 && !(narrow && phoneTab === "now") ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-sm shadow-[0_8px_24px_-18px_rgba(28,22,18,0.45)]">
              <span className="tabular px-1 text-xs tracking-wide text-[var(--color-ink-muted)]">
                已选 {selectedIds.size}
              </span>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => {
                  if (window.confirm(`删除选中的 ${selectedIds.size} 条？`)) {
                    void deleteItems([...selectedIds]).then(clearSelection);
                  }
                }}
              >
                删除
              </Button>
              <select
                className="h-8 rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-3 text-xs"
                defaultValue=""
                onChange={(e) => {
                  const tag = e.target.value as ScheduleTag;
                  if (!tag) return;
                  void patchItems([...selectedIds], { tag }).then(clearSelection);
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  改标签
                </option>
                {SCHEDULE_TAG_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {formatTagLabel(o.id, tagLabelOverrides)}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-3 text-xs"
                defaultValue=""
                onChange={(e) => {
                  const owner = e.target.value as ItemOwner;
                  if (!owner) return;
                  void patchItems([...selectedIds], { owner }).then(
                    clearSelection,
                  );
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  改归属
                </option>
                <option value="self">自己</option>
                <option value="partner">对方</option>
                <option value="shared">共同</option>
              </select>
              <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                取消选择
              </Button>
            </div>
          ) : null}

          {(narrow ? phoneTab === "week" : config.settingsViewMode === "week") ? (
            <WeekGrid
              layout={narrow ? "day" : "board"}
              items={config.items}
              couple={config.couple}
              showHolidays={config.showHolidays}
              dayOverrides={config.dayOverrides}
              gridStartHour={config.gridStartHour}
              gridEndHour={config.gridEndHour}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onCreateAt={openCreateAt}
              onEditItem={openEdit}
              onSkipOccurrence={(item, dateKey) => {
                void skipOccurrence(item.id, dateKey).then(() => {
                  setStatus(`已取消「${item.title}」该次`);
                });
              }}
              onDeleteItem={(item) => {
                if (!window.confirm(`确定删除「${item.title}」？`)) return;
                void deleteItem(item.id).then(() => {
                  setSelectedIds((prev) => {
                    if (!prev.has(item.id)) return prev;
                    const next = new Set(prev);
                    next.delete(item.id);
                    return next;
                  });
                  if (draft.id === item.id) {
                    setEditorOpen(false);
                    setOccurrenceDate(null);
                  }
                });
              }}
              onSetDayOverride={(dateKey, value) =>
                void setDayOverride(dateKey, value)
              }
            />
          ) : narrow && phoneTab === "now" ? null : sortedItems.length === 0 ? (
            <div className={cn("flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--color-line)] px-6 py-16 text-center", narrow && "phone-list-empty")}>
              <p className="font-display text-2xl text-[var(--color-ink)]">
                还没有安排
              </p>
              {narrow ? (
                <Button type="button" className="mt-5" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  写下第一条
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div
                className={cn(
                  "flex shrink-0 flex-wrap items-end gap-2 border-b border-[var(--color-line)] pb-3",
                  narrow && "phone-list-filters px-0.5",
                )}
              >
                <label className="space-y-1 text-xs text-[var(--color-ink-muted)]">
                  <span>标签</span>
                  <select
                    className="block h-9 min-w-[6.5rem] rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-2 text-sm text-[var(--color-ink)]"
                    aria-label="按标签筛选"
                    value={listFilters.tag}
                    onChange={(e) =>
                      setListFilters((prev) => ({
                        ...prev,
                        tag: e.target.value as ListFilters["tag"],
                      }))
                    }
                  >
                    <option value="all">全部</option>
                    {SCHEDULE_TAG_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {formatTagLabel(opt.id)}
                      </option>
                    ))}
                  </select>
                </label>
                {!config.soloMode ? (
                  <label className="space-y-1 text-xs text-[var(--color-ink-muted)]">
                    <span>归属</span>
                    <select
                      className="block h-9 min-w-[5.5rem] rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-2 text-sm text-[var(--color-ink)]"
                      aria-label="按归属筛选"
                      value={listFilters.owner}
                      onChange={(e) =>
                        setListFilters((prev) => ({
                          ...prev,
                          owner: e.target.value as ListFilters["owner"],
                        }))
                      }
                    >
                      <option value="all">全部</option>
                      <option value="self">{config.couple.selfName}</option>
                      <option value="partner">
                        {partnerFacingName(config.couple)}
                      </option>
                      <option value="shared">共同</option>
                    </select>
                  </label>
                ) : null}
                <label className="space-y-1 text-xs text-[var(--color-ink-muted)]">
                  <span>重复</span>
                  <select
                    className="block h-9 min-w-[6.5rem] rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-2 text-sm text-[var(--color-ink)]"
                    aria-label="按仅一次或重复筛选"
                    value={listFilters.recurrence}
                    onChange={(e) =>
                      setListFilters((prev) => ({
                        ...prev,
                        recurrence: e.target.value as ListFilters["recurrence"],
                      }))
                    }
                  >
                    <option value="all">全部</option>
                    <option value="once">仅一次</option>
                    <option value="weekly">会重复</option>
                  </select>
                </label>
                {listShowingFilters ? (
                  <button
                    type="button"
                    className="mb-0.5 text-xs text-[var(--color-ink-muted)] underline-offset-2 hover:underline"
                    onClick={() => setListFilters(DEFAULT_LIST_FILTERS)}
                  >
                    清除筛选
                  </button>
                ) : null}
                <p className="ml-auto self-center text-xs text-[var(--color-ink-muted)]">
                  {listShowingFilters
                    ? `${listItems.length} / ${sortedItems.length} 条`
                    : `${listItems.length} 条`}
                </p>
              </div>
              {listItems.length === 0 ? (
                <div className={cn("flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--color-line)] px-6 py-12 text-center", narrow && "phone-list-empty")}>
                  <p className="font-display text-xl text-[var(--color-ink)]">
                    没有符合的安排
                  </p>
                  <button
                    type="button"
                    className="mt-3 text-sm text-[var(--color-ink-muted)] underline-offset-2 hover:underline"
                    onClick={() => setListFilters(DEFAULT_LIST_FILTERS)}
                  >
                    清除筛选
                  </button>
                </div>
              ) : (
            <ul className={cn("min-h-0 flex-1 space-y-2 overflow-auto pr-1", narrow && "phone-list")}>
              {listItems.map((item) => {
                const tag = item.tag ?? "work";
                const subline = formatItemSubline(item);
                const once = (item.recurrence ?? "weekly") === "once";
                const courseSwap = itemIsCourseSwap(item);
                const color = ownerColor(item, config.couple);
                return (
                  <li
                    key={item.id}
                    title={itemHoverText(item)}
                    className={cn(
                      narrow && "phone-card phone-list-row",
                      "group relative flex flex-col gap-3 rounded-2xl border p-4 transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-px hover:shadow-[0_14px_30px_-22px_rgba(28,22,18,0.55)] sm:flex-row sm:items-start sm:justify-between",
                      (once || courseSwap) && "border-dashed border-[#d7b15a]",
                      selectedIds.has(item.id) &&
                        "ring-2 ring-[var(--color-ink)] ring-offset-2 ring-offset-[var(--color-bg)]",
                    )}
                    style={ownerRailStyle(color)}
                  >
                    <label className="absolute left-2 top-4 flex items-center">
                      <input
                        type="checkbox"
                        className={cn("h-3.5 w-3.5", narrow && "h-6 w-6")}
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </label>
                    <div className="min-w-0 space-y-1 pl-7">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular font-mono text-sm tracking-tight text-[var(--color-ink)]">
                          {formatItemSpan(item)}
                        </span>
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide"
                          style={ownerChipStyle(color)}
                        >
                          {ownerLabel(item, config.couple)}
                        </span>
                        <span className={scheduleChipClass(tag)}>
                          {formatTagLabel(tag)}
                        </span>
                        {courseSwap ? (
                          <span className="rounded-full border border-[#e4c98a] bg-[#fbf6ea] px-2 py-0.5 text-[10px] text-[#7a5a22]">
                            换课
                          </span>
                        ) : once ? (
                          <span className="rounded-full border border-[#e4c98a] bg-[#fbf6ea] px-2 py-0.5 text-[10px] text-[#7a5a22]">
                            仅一次
                          </span>
                        ) : null}
                        {!item.enabled ? (
                          <span className="text-xs opacity-60">已停用</span>
                        ) : null}
                      </div>
                      <p
                        className={cn(
                          "font-display text-lg leading-snug",
                          narrow
                            ? "phone-list-title line-clamp-2 whitespace-normal break-words"
                            : "truncate",
                        )}
                      >
                        {itemDisplayTitle(item)}
                      </p>
                      {subline ? (
                        <p className="text-sm font-medium opacity-80">{subline}</p>
                      ) : null}
                      <p className="text-xs opacity-60">
                        {formatScheduleScope(item)}
                      </p>
                      {item.note?.trim() ? (
                        <p className="text-sm leading-snug text-[var(--color-ink-muted)]">
                          {item.note.trim()}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(`确定删除「${item.title}」？`)) {
                            void deleteItem(item.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
              )}
            </div>
          )}
        </section>

      {narrow ? (
        <nav className="phone-dock" aria-label="主导航">
          <div className="phone-dock-inner">
            {(
              [
                ["now", "此刻", Sun],
                ["week", "周", CalendarRange],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                aria-current={phoneTab === id ? "page" : undefined}
                className={cn("phone-tab", phoneTab === id && "phone-tab-on")}
                onClick={() => setPhoneTab(id)}
              >
                <Icon aria-hidden />
                {label}
              </button>
            ))}
            <button
              type="button"
              className="phone-create"
              onClick={() => setCreateSheetOpen(true)}
              disabled={busy}
            >
              <Plus aria-hidden />
              新建
            </button>
            <button
              type="button"
              aria-current={phoneTab === "list" ? "page" : undefined}
              className={cn("phone-tab", phoneTab === "list" && "phone-tab-on")}
              onClick={() => setPhoneTab("list")}
            >
              <List aria-hidden />
              列表
            </button>
            <button
              type="button"
              className="phone-tab"
              onClick={() => {
                setPrefsTab("couple");
                setPrefsOpen(true);
              }}
            >
              <Settings aria-hidden />
              设置
            </button>
          </div>
        </nav>
      ) : null}

      <Dialog
        open={prefsOpen}
        onOpenChange={(open) => {
          setPrefsOpen(open);
          if (open) {
            setPrefsTab("couple");
            setTagLabelOverrides(readTagLabelOverrides());
          }
        }}
        title="设置"
        eyebrow="偏好"
        className={cn("sm:max-w-3xl", narrow && "phone-sheet")}
      >
        <Tabs
          value={prefsTab}
          onValueChange={(v) =>
            setPrefsTab(v as "couple" | "display" | "data")
          }
          items={[
            { value: "couple", label: "我们" },
            { value: "display", label: "显示" },
            { value: "data", label: "数据" },
          ]}
        >
          <TabsContent value={prefsTab} when="couple">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="solo-mode">单人模式</Label>
              <Switch
                id="solo-mode"
                checked={config.soloMode}
                onCheckedChange={(v) => void setSoloMode(v)}
              />
            </div>

            {config.couple.inviteCode ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void syncNow()}
                >
                  立即同步
                </Button>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-2xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_30%,var(--color-surface))] p-3.5">
                <Label htmlFor="self-name">我的名字</Label>
                <div className="flex gap-2">
                  <Input
                    id="self-name"
                    value={config.couple.selfName}
                    onChange={(e) =>
                      void setCoupleIdentity({
                        selfName: e.target.value || "我",
                      })
                    }
                  />
                  <input
                    type="color"
                    aria-label="我的颜色"
                    value={config.couple.selfColor}
                    className="h-9 w-12 cursor-pointer rounded border border-[var(--color-line)] bg-transparent"
                    onChange={(e) =>
                      void setCoupleIdentity({ selfColor: e.target.value })
                    }
                  />
                </div>
                {calledByPartner(config.couple) ? (
                  <p className="truncate text-xs text-[var(--color-ink-muted)]">
                    称你 {calledByPartner(config.couple)}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2 rounded-2xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_30%,var(--color-surface))] p-3.5">
                <Label htmlFor="partner-name">称呼</Label>
                <div className="flex gap-2">
                  <Input
                    id="partner-name"
                    maxLength={ADDRESS_MAX}
                    value={config.couple.addressForThem}
                    placeholder={config.couple.partnerName}
                    onChange={(e) =>
                      void setCoupleIdentity({
                        addressForThem: e.target.value,
                      })
                    }
                  />
                  <input
                    type="color"
                    aria-label="对方颜色"
                    value={config.couple.partnerColor}
                    className="h-9 w-12 cursor-pointer rounded border border-[var(--color-line)] bg-transparent"
                    onChange={(e) =>
                      void setCoupleIdentity({ partnerColor: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sync-relay-url">同步中继</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <textarea
                  id="sync-relay-url"
                  rows={narrow ? 3 : 2}
                  className="min-h-10 w-full min-w-0 resize-y break-all rounded-xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_28%,var(--color-surface))] px-3 py-2 font-mono text-xs leading-relaxed placeholder:text-[color-mix(in_oklab,var(--color-ink-muted)_75%,white)] focus-visible:border-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--color-accent)_35%,transparent)]"
                  placeholder={resolveRelayBaseUrl(null)}
                  value={config.syncRelayUrl}
                  onChange={(e) => {
                    void setSyncRelayUrl(e.target.value);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void setSyncRelayUrl("")}
                >
                  恢复默认
                </Button>
              </div>
              <p className="break-all text-xs leading-relaxed text-[var(--color-ink-muted)]">
                {resolveRelayBaseUrl(config.syncRelayUrl)}
              </p>
            </div>

            <div className="space-y-3 rounded-2xl border border-[var(--color-line)] p-4">
              <h3 className="text-sm font-semibold">邀请对方</h3>
              {pairBanner(config.couple) ? (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <p>
                    {pairBanner(config.couple)}
                    {config.couple.inviteCode
                      ? ` · ${config.couple.inviteCode}`
                      : ""}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (window.confirm("解除后将移除对方日程，多端同步保留。确定？")) {
                        void unpair();
                      }
                    }}
                  >
                    解除配对
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {config.couple.inviteCode ? (
                    <p className="text-sm">
                      邀请码{" "}
                      <span className="font-mono tracking-widest">
                        {config.couple.inviteCode}
                      </span>
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void (async () => {
                          setBusy(true);
                          try {
                            await createInvite();
                          } catch (err) {
                            setStatus(
                              err instanceof Error ? err.message : String(err),
                            );
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      {config.couple.inviteCode ? "重新生成邀请码" : "生成邀请码"}
                    </Button>
                    <div className="flex min-w-0 flex-1 gap-2">
                      <Input
                        placeholder="输入对方的邀请码"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy || !joinCode.trim()}
                        onClick={() => {
                          void (async () => {
                            setBusy(true);
                            try {
                              await joinWithCode(joinCode);
                              setJoinCode("");
                              setStatus("已加入对方房间");
                            } catch (err) {
                              setStatus(
                                err instanceof Error
                                  ? err.message
                                  : String(err),
                              );
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        加入
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-[var(--color-line)] p-4">
              <h3 className="text-sm font-semibold">多端同步</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      try {
                        const code = await ensureDeviceSyncCode();
                        setDeviceSyncCode(code);
                        try {
                          await navigator.clipboard.writeText(code);
                          setStatus("设备同步码已复制");
                        } catch {
                          setStatus("已生成设备同步码");
                        }
                      } catch (err) {
                        setStatus(
                          err instanceof Error ? err.message : String(err),
                        );
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  复制设备同步码
                </Button>
                {config.couple.inviteCode ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "将停止多端与对方同步，本机日程保留。确定？",
                        )
                      ) {
                        void stopRoomSync().then(() => {
                          setDeviceSyncCode(null);
                        });
                      }
                    }}
                  >
                    停止同步
                  </Button>
                ) : null}
              </div>
              {deviceSyncCode ? (
                <p className="break-all font-mono text-xs text-[var(--color-ink-muted)]">
                  {deviceSyncCode}
                </p>
              ) : null}
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <Input
                  className="font-mono text-xs"
                  placeholder="粘贴设备同步码"
                  value={deviceJoinCode}
                  onChange={(e) => setDeviceJoinCode(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={busy || !deviceJoinCode.trim()}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      try {
                        await joinWithDeviceCode(deviceJoinCode);
                        setDeviceJoinCode("");
                        setStatus("已接入多端同步");
                      } catch (err) {
                        setStatus(
                          err instanceof Error ? err.message : String(err),
                        );
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  在此设备接入
                </Button>
              </div>
            </div>

            {syncStatus ? (
              <p
                role="status"
                className={
                  syncStatus.startsWith("同步失败")
                    ? "text-xs text-red-700"
                    : "text-xs text-[var(--color-ink-muted)]"
                }
              >
                {syncStatus}
              </p>
            ) : null}
          </TabsContent>

          <TabsContent value={prefsTab} when="display">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="show-holidays">显示中国大陆节假日</Label>
                {todayLabel.kind !== "none" ? (
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    今日：{todayLabel.name}
                  </p>
                ) : null}
              </div>
              <Switch
                id="show-holidays"
                checked={config.showHolidays}
                onCheckedChange={(v) => void setShowHolidays(v)}
              />
            </div>

            {!narrow ? (
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="widget-focus">悬浮窗聚焦当前</Label>
                <Switch
                  id="widget-focus"
                  checked={config.widgetMode === "current"}
                  onCheckedChange={(v) =>
                    void setWidgetMode(v ? "current" : "full")
                  }
                />
              </div>
            ) : null}

            {!narrow ? (
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="autostart">开机自启</Label>
                <Switch
                  id="autostart"
                  checked={config.autostart}
                  onCheckedChange={(v) => void setAutostart(v)}
                />
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="reminders">开始前提醒</Label>
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                  提前 {config.reminderMinutesBefore} 分钟
                </p>
              </div>
              <Switch
                id="reminders"
                checked={config.remindersEnabled}
                onCheckedChange={(v) => void setRemindersEnabled(v)}
              />
            </div>

            {config.remindersEnabled ? (
              <div className="flex flex-wrap items-center gap-2">
                {([5, 10, 15] as ReminderMinutes[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={cn(
                      "inline-flex h-8 items-center rounded-md border px-2.5 text-xs",
                      config.reminderMinutesBefore === m
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                        : "border-[var(--color-line)] text-[var(--color-ink-muted)]",
                    )}
                    onClick={() => void setReminderMinutesBefore(m)}
                  >
                    {m} 分钟
                  </button>
                ))}
              </div>
            ) : null}

            {!narrow ? (
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor="widget-opacity">悬浮窗透明度</Label>
              <input
                id="widget-opacity"
                type="range"
                min={40}
                max={100}
                step={1}
                value={Math.round(config.widgetOpacity * 100)}
                className="h-2 w-48 max-w-full accent-[var(--color-accent)]"
                onChange={(e) =>
                  void setWidgetOpacity(Number(e.target.value) / 100)
                }
              />
              <span className="font-mono text-xs text-[var(--color-ink-muted)]">
                {Math.round(config.widgetOpacity * 100)}%
              </span>
            </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Label>周视图时段</Label>
              <select
                className="h-8 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-sm"
                value={config.gridStartHour}
                onChange={(e) => {
                  void setGridHours(Number(e.target.value), config.gridEndHour);
                }}
              >
                {Array.from({ length: 13 }, (_, i) => i).map((h) => (
                  <option key={`s-${h}`} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              <span className="text-sm text-[var(--color-ink-muted)]">至</span>
              <select
                className="h-8 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-sm"
                value={config.gridEndHour}
                onChange={(e) => {
                  void setGridHours(config.gridStartHour, Number(e.target.value));
                }}
              >
                {Array.from({ length: 24 }, (_, i) => i).map((h) => {
                  const nextDay = h <= config.gridStartHour;
                  return (
                    <option key={`e-${h}`} value={h}>
                      {nextDay ? "次日 " : ""}
                      {String(h).padStart(2, "0")}:00
                    </option>
                  );
                })}
              </select>
            </div>

            {!narrow ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={config.widgetVisible ? "secondary" : "default"}
                disabled={busy}
                onClick={() => void handleToggleWidget(!config.widgetVisible)}
              >
                {config.widgetVisible ? (
                  <>
                    <EyeOff className="h-4 w-4" />
                    关闭悬浮窗
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    打开悬浮窗
                  </>
                )}
              </Button>
            </div>
            ) : null}

            <div className="space-y-3 rounded-2xl border border-[var(--color-line)] p-4">
              <h3 className="text-sm font-semibold">日程标签</h3>
              <ul className="space-y-2">
                {SCHEDULE_TAG_OPTIONS.map((opt) => (
                  <li
                    key={opt.id}
                    className="flex items-center gap-3"
                  >
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full"
                      style={{ backgroundColor: TAG_BAR[opt.id] }}
                      aria-hidden
                    />
                    <Input
                      value={
                        tagLabelOverrides[opt.id] ??
                        formatTagLabel(opt.id, {})
                      }
                      aria-label={`${formatTagLabel(opt.id, {})}显示名`}
                      onChange={(e) => {
                        const next = e.target.value;
                        setTagLabelOverrides((prev) => ({
                          ...prev,
                          [opt.id]: next,
                        }));
                        setTagLabelOverride(opt.id, next);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>

          <TabsContent value={prefsTab} when="data">
            <CallAllowlistEditor refreshKey={prefsOpen && prefsTab === "data"} />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void handleExport()}
              >
                <Download className="h-4 w-4" />
                导出 JSON
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void handleImport()}
              >
                <Upload className="h-4 w-4" />
                导入 JSON
              </Button>
            </div>
            <AboutSection />
          </TabsContent>
        </Tabs>
      </Dialog>

      <CreateActionSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        onCreate={openCreate}
        onReplay={
          canReplay
            ? () => {
                setReplayOpen(true);
              }
            : undefined
        }
      />
      <DayReplayEntry
        open={replayOpen}
        onOpenChange={setReplayOpen}
        trigger={null}
        scheduleItems={config.items}
        onCommit={async (drafts) => {
          for (const draft of drafts) await upsertItem(draft);
          setStatus(`已记下 ${drafts.length} 条`);
        }}
      />

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setOccurrenceDate(null);
        }}
        panel
        className={narrow ? "phone-sheet" : undefined}
        eyebrow="安排"
        title={draft.id ? "编辑日程" : "新建日程"}
        footer={
          <>
            <div className="mr-auto flex flex-wrap gap-2">
            {draft.id &&
            draft.recurrence === "weekly" &&
            !draft.isCourseSwap &&
            occurrenceDate ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    try {
                      await skipOccurrence(draft.id!, occurrenceDate);
                      setEditorOpen(false);
                      setOccurrenceDate(null);
                      setStatus("已取消本次");
                    } catch (err) {
                      setFormError(
                        err instanceof Error ? err.message : String(err),
                      );
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                取消本次
              </Button>
            ) : null}
            {draft.id ? (
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() => {
                  const title = draft.title.trim() || "此日程";
                  if (!window.confirm(`确定删除「${title}」？`)) return;
                  void deleteItem(draft.id!).then(() => {
                    setEditorOpen(false);
                    setOccurrenceDate(null);
                    setSelectedIds((prev) => {
                      if (!draft.id || !prev.has(draft.id)) return prev;
                      const next = new Set(prev);
                      next.delete(draft.id);
                      return next;
                    });
                  });
                }}
              >
                删除
              </Button>
            ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditorOpen(false);
                setOccurrenceDate(null);
              }}
            >
              关闭
            </Button>
            <Button type="button" disabled={busy} onClick={() => void saveDraft()}>
              保存
            </Button>
          </>
        }
      >
        <Suspense fallback={<p className="editor-loading">正在打开…</p>}>
        <ScheduleEditor
            draft={draft}
            setDraft={setDraft}
            soloMode={config.soloMode}
            couple={config.couple}
            items={config.items}
            heartBurst={heartBurst}
            onHeart={() => setHeartBurst((n) => n + 1)}
            formError={formError}
            onToggleWeekday={toggleWeekday}
            onUnskip={(id, date) => void unskipOccurrence(id, date)}
          />
        </Suspense>
      </Dialog>
    </div>
  );

}
