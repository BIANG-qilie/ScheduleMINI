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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { WeekGrid } from "@/components/WeekGrid";
import { PhoneGlance } from "@/components/PhoneGlance";
import { CoexistenceBar } from "@/components/CoexistenceBar";
import type { Draft } from "@/components/ScheduleEditor";

const ScheduleEditor = lazy(() =>
  import("@/components/ScheduleEditor").then((m) => ({ default: m.ScheduleEditor })),
);
import {
  APP_DISPLAY_NAME,
  DEFAULT_CALL_CHANNEL,
  DEFAULT_WORK_KIND,
  SCHEDULE_TAG_OPTIONS,
  WORK_KIND_META,
  formatDateKey,
  formatScheduleScope,
  isPaired,
  itemCallChannel,
  itemDisplayTitle,
  itemGamePlatform,
  itemIsCourseSwap,
  itemSkippedDates,
  itemWorkKind,
  ownerColor,
  ownerLabel,
  workKindRequiredField,
  type ItemOwner,
  type ReminderMinutes,
  type ScheduleItem,
  type ScheduleTag,
} from "@/lib/config";
import { ensureHolidayData, getTodayLabel, onHolidayData } from "@/lib/holidays";
import { startReminderLoop } from "@/lib/reminders";
import {
  formatItemSubline,
  itemHoverText,
  ownerChipStyle,
  ownerRailStyle,
  scheduleChipClass,
} from "@/lib/schedule-style";
import { resolveRelayBaseUrl } from "@/lib/sync/relay";
import { syncAutostart } from "@/lib/widget-chrome";
import { setWidgetVisible } from "@/lib/windows";
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
  };
};

function itemToDraft(item: ScheduleItem): Draft {
  const today = formatDateKey(new Date());
  const workKind = itemWorkKind(item) ?? DEFAULT_WORK_KIND;
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
  };
}

export function SettingsPage() {
  const {
    config,
    loading,
    error,
    hydrated,
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
  const [prefsTab, setPrefsTab] = useState<"couple" | "display" | "data">(
    "couple",
  );
  const narrow = useNarrow();
  const [phoneTab, setPhoneTab] = useState<"now" | "week" | "list">("now");

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

  // 首屏先画出来，再拉节假日、提醒和同步
  useEffect(() => {
    if (!hydrated) return;
    const stops: Array<() => void> = [];
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      void ensureHolidayData();
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
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void syncAutostart(config.autostart);
  }, [hydrated, config.autostart]);

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
    const recurrence = courseSwap ? "once" : draft.recurrence;
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
    } else if (!draft.title.trim()) {
      setFormError("请填写标题");
      return;
    }
    if (recurrence === "weekly" && draft.weekdays.length === 0) {
      setFormError("请至少选择一个星期几");
      return;
    }
    if (recurrence === "once" && !draft.date) {
      setFormError("请选择日期");
      return;
    }
    if (draft.start === draft.end) {
      setFormError("结束时间不能与开始时间相同");
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
          draft.title.trim()
        : draft.title.trim();
      await upsertItem({
        id: draft.id,
        start: draft.start,
        end: draft.end,
        title: workTitle,
        note: draft.note,
        weekdays: recurrence === "weekly" ? draft.weekdays : [],
        enabled: draft.enabled,
        recurrence,
        date: recurrence === "once" ? draft.date : undefined,
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
      await setWidgetVisibleFlag(visible);
      await setWidgetVisible(visible);
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
                : `${config.couple.selfName} · ${config.couple.partnerName}`
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
                {config.couple.partnerName}
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
                    {o.label}
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
              onSetDayOverride={(dateKey, value) =>
                void setDayOverride(dateKey, value)
              }
            />
          ) : narrow && phoneTab === "now" ? null : sortedItems.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--color-line)] px-6 py-16 text-center">
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
            <ul className={cn("min-h-0 flex-1 space-y-2 overflow-auto pr-1", narrow && "phone-list")}>
              {sortedItems.map((item) => {
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
                      narrow && "phone-card",
                      "group relative flex flex-col gap-3 rounded-2xl border p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_14px_30px_-22px_rgba(28,22,18,0.55)] sm:flex-row sm:items-start sm:justify-between",
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
                          {item.start}–{item.end}
                        </span>
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide"
                          style={ownerChipStyle(color)}
                        >
                          {ownerLabel(item, config.couple)}
                        </span>
                        <span className={scheduleChipClass(tag)}>
                          {SCHEDULE_TAG_OPTIONS.find((o) => o.id === tag)?.label}
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
                      <p className="truncate font-display text-lg leading-snug">
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
              onClick={openCreate}
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
          if (open) setPrefsTab("couple");
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
              </div>
              <div className="space-y-2 rounded-2xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_30%,var(--color-surface))] p-3.5">
                <Label htmlFor="partner-name">对方怎么称呼</Label>
                <div className="flex gap-2">
                  <Input
                    id="partner-name"
                    value={config.couple.partnerName}
                    onChange={(e) =>
                      void setCoupleIdentity({
                        partnerName: e.target.value || "对方",
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
                <Input
                  id="sync-relay-url"
                  className="font-mono text-xs"
                  placeholder={resolveRelayBaseUrl(null)}
                  value={
                    config.syncRelayUrl ||
                    resolveRelayBaseUrl(config.syncRelayUrl)
                  }
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
              <p className="text-xs text-[var(--color-ink-muted)]">
                {resolveRelayBaseUrl(config.syncRelayUrl)}
              </p>
            </div>

            <div className="space-y-3 rounded-2xl border border-[var(--color-line)] p-4">
              <h3 className="text-sm font-semibold">邀请对方</h3>
              {isPaired(config.couple) ? (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <p>
                    已与「{config.couple.partnerName}」配对
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
          </TabsContent>

          <TabsContent value={prefsTab} when="data">
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
          </TabsContent>
        </Tabs>
      </Dialog>

      <Dialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        panel
        className={narrow ? "phone-sheet" : undefined}
        eyebrow="安排"
        title={draft.id ? "编辑日程" : "新建日程"}
        footer={
          <>
            {draft.id &&
            draft.recurrence === "weekly" &&
            !draft.isCourseSwap &&
            occurrenceDate ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="mr-auto"
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
