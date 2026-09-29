import { useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  Download,
  Eye,
  EyeOff,
  List,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { WeekGrid } from "@/components/WeekGrid";
import { CoexistenceBar } from "@/components/CoexistenceBar";
import {
  APP_DISPLAY_NAME,
  CALL_CHANNEL_OPTIONS,
  DEFAULT_CALL_CHANNEL,
  DEFAULT_WORK_KIND,
  GAME_PLATFORM_OPTIONS,
  SCHEDULE_TAG_OPTIONS,
  WEEKDAY_LABELS,
  WORK_KIND_META,
  WORK_KIND_OPTIONS,
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
  tagRespectsHolidays,
  workKindRequiredField,
  type CallChannel,
  type GamePlatform,
  type ItemOwner,
  type Recurrence,
  type ReminderMinutes,
  type ScheduleItem,
  type ScheduleTag,
  type WorkKind,
} from "@/lib/config";
import { getTodayLabel } from "@/lib/holidays";
import { startReminderLoop } from "@/lib/reminders";
import {
  formatItemSubline,
  itemHoverText,
  ownerChipStyle,
  ownerSurfaceStyle,
  scheduleChipClass,
  TAG_SURFACE,
} from "@/lib/schedule-style";
import { resolveRelayBaseUrl } from "@/lib/sync/relay";
import { syncAutostart } from "@/lib/widget-chrome";
import { setWidgetVisible } from "@/lib/windows";
import {
  startCoupleSyncLoop,
  subscribeConfigChanges,
  useConfigStore,
} from "@/store/config-store";
import { cn } from "@/lib/utils";

type Draft = {
  id?: string;
  start: string;
  end: string;
  title: string;
  note: string;
  weekdays: number[];
  enabled: boolean;
  recurrence: Recurrence;
  date: string;
  /** 周循环生效日起（含） */
  activeFrom: string;
  /** 周循环失效日（含）；空=不限 */
  activeUntil: string;
  tag: ScheduleTag;
  origin: string;
  destination: string;
  callChannel: CallChannel;
  gamePlatform: GamePlatform | "";
  workKind: WorkKind;
  workPrimary: string;
  workSecondary: string;
  isCourseSwap: boolean;
  owner: ItemOwner;
};

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

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!hydrated) return;
    return startReminderLoop(() => useConfigStore.getState().config);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    return startCoupleSyncLoop(() => useConfigStore.getState().config);
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
    [config.dayOverrides],
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
      <div className="flex h-full items-center justify-center bg-[linear-gradient(160deg,#f7f3ea_0%,#e9f3ef_55%,#efe8db_100%)]">
        <p className="text-sm text-[var(--color-ink-muted)]">正在加载…</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[linear-gradient(160deg,#f7f3ea_0%,#e9f3ef_45%,#efe8db_100%)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--color-ink)]">
            {APP_DISPLAY_NAME}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-[color-mix(in_oklab,var(--color-danger)_35%,white)] bg-[color-mix(in_oklab,var(--color-danger)_8%,white)] px-4 py-3 text-sm text-[var(--color-danger)]">
            配置加载失败：{error}。已使用空日程，请修复配置文件或重新导入。
          </div>
        ) : null}

        {status ? (
          <div
            role={
              status.startsWith("导入失败") || status.startsWith("配置加载")
                ? "alert"
                : undefined
            }
            className={cn(
              "rounded-lg border px-4 py-3 text-sm",
              status.startsWith("导入失败") || status.startsWith("配置加载")
                ? "border-[color-mix(in_oklab,var(--color-danger)_35%,white)] bg-[color-mix(in_oklab,var(--color-danger)_8%,white)] text-[var(--color-danger)]"
                : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)]",
            )}
          >
            {status}
          </div>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-surface)_88%,white)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">日程</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">
                共 {sortedItems.length} 条
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-0.5">
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-8 items-center gap-1 rounded-[5px] px-2.5 text-xs",
                    config.settingsViewMode === "week"
                      ? "bg-[var(--color-accent)] text-white"
                      : "text-[var(--color-ink-muted)]",
                  )}
                  onClick={() => void setSettingsViewMode("week")}
                >
                  <CalendarRange className="h-3.5 w-3.5" />
                  周视图
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-8 items-center gap-1 rounded-[5px] px-2.5 text-xs",
                    config.settingsViewMode === "list"
                      ? "bg-[var(--color-accent)] text-white"
                      : "text-[var(--color-ink-muted)]",
                  )}
                  onClick={() => void setSettingsViewMode("list")}
                >
                  <List className="h-3.5 w-3.5" />
                  列表
                </button>
              </div>
              <Button type="button" onClick={openCreate} disabled={busy}>
                <Plus className="h-4 w-4" />
                新建日程
              </Button>
            </div>
          </div>

          {selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-deep)] px-3 py-2 text-sm">
              <span>已选 {selectedIds.size}</span>
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
                className="h-8 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-xs"
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
                className="h-8 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-xs"
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

          {config.settingsViewMode === "week" ? (
            <WeekGrid
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
          ) : sortedItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-10 text-center">
              <p className="text-sm font-medium text-[var(--color-ink)]">
                还没有安排
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
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
                      "group relative flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between",
                      (once || courseSwap) && "border-dashed border-amber-400/55",
                      selectedIds.has(item.id) && "ring-2 ring-[var(--color-accent)]",
                    )}
                    style={ownerSurfaceStyle(color)}
                  >
                    <label className="absolute left-2 top-4 flex items-center">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </label>
                    <div className="min-w-0 space-y-1 pl-7">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm opacity-80">
                          {item.start}–{item.end}
                        </span>
                        <span
                          className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium"
                          style={ownerChipStyle(color)}
                        >
                          {ownerLabel(item, config.couple)}
                        </span>
                        <span className={scheduleChipClass(tag)}>
                          {SCHEDULE_TAG_OPTIONS.find((o) => o.id === tag)?.label}
                        </span>
                        {courseSwap ? (
                          <span className="rounded border border-amber-400/50 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
                            换课
                          </span>
                        ) : once ? (
                          <span className="rounded border border-amber-400/50 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
                            仅一次
                          </span>
                        ) : null}
                        {!item.enabled ? (
                          <span className="text-xs opacity-60">已停用</span>
                        ) : null}
                      </div>
                      <p className="truncate text-base font-medium">
                        {itemDisplayTitle(item)}
                      </p>
                      {subline ? (
                        <p className="text-sm font-medium opacity-80">{subline}</p>
                      ) : null}
                      <p className="text-xs opacity-60">
                        {formatScheduleScope(item)}
                      </p>
                      {item.note?.trim() ? (
                        <p className="hidden text-sm opacity-70 group-hover:block">
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
      </div>

      <Dialog
        open={prefsOpen}
        onOpenChange={(open) => {
          setPrefsOpen(open);
          if (open) setPrefsTab("couple");
        }}
        title="设置"
        className="max-w-2xl"
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
              <div className="space-y-2 rounded-xl border border-[var(--color-line)] p-3">
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
              <div className="space-y-2 rounded-xl border border-[var(--color-line)] p-3">
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

            <div className="space-y-3 rounded-xl border border-[var(--color-line)] p-4">
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

            <div className="space-y-3 rounded-xl border border-[var(--color-line)] p-4">
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
              <p className="text-xs text-[var(--color-ink-muted)]">
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

            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="autostart">开机自启</Label>
              <Switch
                id="autostart"
                checked={config.autostart}
                onCheckedChange={(v) => void setAutostart(v)}
              />
            </div>

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
        dense
        title={draft.id ? "编辑日程" : "新建日程"}
        description="一栏填完，保存即生效"
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
        {!config.soloMode ? (
          <section className="flex flex-col gap-2">
            <Label>归属</Label>
            <div className="relative inline-flex self-start rounded-lg border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_55%,var(--color-surface))] p-0.5">
              {(
                [
                  ["self", "自己", config.couple.selfColor] as const,
                  ["partner", "对方", config.couple.partnerColor] as const,
                  ["shared", "共同", "#f3a6a0"] as const,
                ] as const
              ).map(([value, label, color]) => {
                const active = draft.owner === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      "relative h-8 overflow-visible rounded-md px-3 text-xs transition-colors",
                      !active &&
                        "text-[var(--color-ink-muted)] hover:bg-black/[0.03]",
                    )}
                    style={
                      active
                        ? {
                            backgroundColor: color,
                            color: "#fff",
                            boxShadow:
                              value === "shared"
                                ? "0 2px 10px -2px rgba(243,166,160,0.55)"
                                : undefined,
                          }
                        : undefined
                    }
                    onClick={() => {
                      setDraft((prev) => ({ ...prev, owner: value }));
                      if (value === "shared") {
                        setHeartBurst((n) => n + 1);
                      }
                    }}
                  >
                    {label}
                    {value === "shared" && heartBurst > 0 ? (
                      <span
                        key={heartBurst}
                        className="owner-heart-burst pointer-events-none absolute inset-0"
                        aria-hidden
                      >
                        <span className="owner-heart owner-heart-a">♥</span>
                        <span className="owner-heart owner-heart-b">♥</span>
                        <span className="owner-heart owner-heart-c">♥</span>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <Label>标签</Label>
          <div className="flex flex-wrap gap-1.5">
            {SCHEDULE_TAG_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={cn(
                  "h-8 rounded-lg border px-2.5 text-xs",
                  draft.tag === opt.id
                    ? cn(TAG_SURFACE[opt.id].chip, "ring-1 ring-[var(--color-accent)]/35")
                    : "border-[var(--color-line)] text-[var(--color-ink-muted)]",
                )}
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    tag: opt.id,
                    callChannel:
                      opt.id === "call"
                        ? prev.callChannel || DEFAULT_CALL_CHANNEL
                        : prev.callChannel,
                    workKind:
                      opt.id === "work"
                        ? prev.workKind || DEFAULT_WORK_KIND
                        : prev.workKind,
                    isCourseSwap:
                      opt.id === "work" ? prev.isCourseSwap : false,
                    owner:
                      opt.id === "game" && prev.tag !== "game"
                        ? "shared"
                        : prev.owner,
                  }))
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          {tagRespectsHolidays(draft.tag) &&
          draft.recurrence === "weekly" &&
          !draft.isCourseSwap ? (
            <p className="text-xs leading-normal text-[var(--color-ink-muted)]">
              放假日不出现
            </p>
          ) : null}
        </section>

        {draft.tag === "work" ? (
          <section className="flex flex-col gap-2">
            <Label>工作类型</Label>
            <div className="flex flex-wrap gap-1.5">
              {WORK_KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={cn(
                    "h-8 rounded-lg border px-2.5 text-xs",
                    draft.workKind === opt.id
                      ? cn(
                          TAG_SURFACE.work.chip,
                          "ring-1 ring-[var(--color-accent)]/35",
                        )
                      : "border-[var(--color-line)] text-[var(--color-ink-muted)]",
                  )}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      workKind: opt.id,
                      isCourseSwap:
                        opt.id === "class" ? prev.isCourseSwap : false,
                      recurrence:
                        opt.id === "class" && prev.isCourseSwap
                          ? "once"
                          : prev.recurrence,
                    }))
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {draft.workKind === "class" ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/50 bg-amber-50/70 px-3 py-2.5">
                <div className="min-w-0">
                  <Label htmlFor="course-swap" className="text-sm">
                    换课
                  </Label>
                  <p className="mt-0.5 text-[11px] leading-normal text-amber-900/70">
                    开启后固定为仅一次，周循环不可用
                  </p>
                </div>
                <Switch
                  id="course-swap"
                  checked={draft.isCourseSwap}
                  onCheckedChange={(on) =>
                    setDraft((prev) => ({
                      ...prev,
                      isCourseSwap: on,
                      recurrence: on ? "once" : prev.recurrence,
                      date: on && !prev.date ? formatDateKey(new Date()) : prev.date,
                    }))
                  }
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {draft.tag === "call" ? (
          <section className="flex flex-col gap-2">
            <Label>通话渠道</Label>
            <div className="flex flex-wrap gap-1.5">
              {CALL_CHANNEL_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={cn(
                    "h-8 rounded-lg border px-2.5 text-xs",
                    draft.callChannel === opt.id
                      ? cn(
                          TAG_SURFACE.call.chip,
                          "ring-1 ring-[var(--color-accent)]/35",
                        )
                      : "border-[var(--color-line)] text-[var(--color-ink-muted)]",
                  )}
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, callChannel: opt.id }))
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {draft.tag === "game" ? (
          <section className="flex flex-col gap-2">
            <Label>平台</Label>
            <div className="flex flex-wrap gap-1.5">
              {GAME_PLATFORM_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={cn(
                    "h-8 rounded-lg border px-2.5 text-xs",
                    draft.gamePlatform === opt.id
                      ? cn(
                          TAG_SURFACE.game.chip,
                          "ring-1 ring-[var(--color-accent)]/35",
                        )
                      : "border-[var(--color-line)] text-[var(--color-ink-muted)]",
                  )}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      gamePlatform:
                        prev.gamePlatform === opt.id ? "" : opt.id,
                    }))
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {draft.tag === "commute" ? (
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="origin">出发地</Label>
              <Input
                id="origin"
                value={draft.origin}
                placeholder="例如：大旺"
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, origin: e.target.value }))
                }
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="destination">目的地</Label>
              <Input
                id="destination"
                value={draft.destination}
                placeholder="例如：学校"
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    destination: e.target.value,
                  }))
                }
              />
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <Label>时间</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="start" className="text-xs text-[var(--color-ink-muted)]">
                开始
              </Label>
              <Input
                id="start"
                type="time"
                step={60}
                value={draft.start}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, start: e.target.value }))
                }
              />
              <p className="text-[11px] leading-normal text-[var(--color-ink-muted)]">
                24 小时制
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="end" className="text-xs text-[var(--color-ink-muted)]">
                结束
              </Label>
              <Input
                id="end"
                type="time"
                step={60}
                value={draft.end}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, end: e.target.value }))
                }
              />
              <p className="text-[11px] leading-normal text-[var(--color-ink-muted)]">
                早于开始即跨日
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <Label>重复方式</Label>
          <div className="inline-flex self-start rounded-lg border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-bg)_55%,var(--color-surface))] p-0.5">
            <button
              type="button"
              disabled={draft.isCourseSwap}
              className={cn(
                "h-8 rounded-md px-3 text-xs",
                draft.recurrence === "weekly" && !draft.isCourseSwap
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-ink-muted)]",
                draft.isCourseSwap && "cursor-not-allowed opacity-40",
              )}
              onClick={() =>
                setDraft((prev) => ({ ...prev, recurrence: "weekly" }))
              }
            >
              每周重复
            </button>
            <button
              type="button"
              className={cn(
                "h-8 rounded-md px-3 text-xs",
                draft.recurrence === "once" || draft.isCourseSwap
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-ink-muted)]",
              )}
              onClick={() =>
                setDraft((prev) => ({ ...prev, recurrence: "once" }))
              }
            >
              仅一次
            </button>
          </div>
          {draft.isCourseSwap ? (
            <p className="text-xs leading-normal text-amber-800/80">
              换课中：已锁定为仅一次
            </p>
          ) : null}

          {draft.recurrence === "once" || draft.isCourseSwap ? (
            <div className="flex min-w-0 flex-col gap-1.5 pt-1">
              <Label htmlFor="once-date">日期</Label>
              <Input
                id="once-date"
                type="date"
                value={draft.date}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-1">
              <Label>每周重复</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_LABELS.map((label, day) => {
                  const active = draft.weekdays.includes(day);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleWeekday(day)}
                      className={
                        active
                          ? "h-9 min-w-9 rounded-lg bg-[var(--color-accent)] px-3 text-sm text-white"
                          : "h-9 min-w-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm"
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="active-from">生效</Label>
                  <Input
                    id="active-from"
                    type="date"
                    value={draft.activeFrom}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        activeFrom: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="active-until">失效</Label>
                  <Input
                    id="active-until"
                    type="date"
                    value={draft.activeUntil}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        activeUntil: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {draft.tag === "work" && draft.workKind !== "other" ? (
          <section className="flex flex-col gap-3">
            <Label>内容</Label>
            {(() => {
              const meta = WORK_KIND_META[draft.workKind];
              const required = workKindRequiredField(draft.workKind);
              const primaryOptional = required !== "primary";
              const secondaryOptional = required !== "secondary";
              const primaryFirst = required !== "secondary";
              const primaryField = (
                <div className="flex min-w-0 flex-col gap-1.5" key="primary">
                  <Label htmlFor="work-primary">
                    {meta.primaryLabel}
                    {primaryOptional ? (
                      <span className="ml-1 font-normal text-[var(--color-ink-muted)]">
                        选填
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    id="work-primary"
                    value={draft.workPrimary}
                    placeholder={meta.primaryPlaceholder}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        workPrimary: e.target.value,
                      }))
                    }
                  />
                </div>
              );
              const secondaryField = (
                <div className="flex min-w-0 flex-col gap-1.5" key="secondary">
                  <Label htmlFor="work-secondary">
                    {meta.secondaryLabel}
                    {secondaryOptional ? (
                      <span className="ml-1 font-normal text-[var(--color-ink-muted)]">
                        选填
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    id="work-secondary"
                    value={draft.workSecondary}
                    placeholder={meta.secondaryPlaceholder}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        workSecondary: e.target.value,
                      }))
                    }
                  />
                </div>
              );
              return (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {primaryFirst ? (
                    <>
                      {primaryField}
                      {secondaryField}
                    </>
                  ) : (
                    <>
                      {secondaryField}
                      {primaryField}
                    </>
                  )}
                </div>
              );
            })()}
          </section>
        ) : (
          <section className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="title">
              {draft.tag === "work"
                ? WORK_KIND_META.other.primaryLabel
                : "标题"}
            </Label>
            <Input
              id="title"
              value={draft.title}
              placeholder={
                draft.tag === "work"
                  ? WORK_KIND_META.other.primaryPlaceholder
                  : "例如：站会、深度工作、约谈"
              }
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, title: e.target.value }))
              }
            />
          </section>
        )}

        <section className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="note">
            备注
            <span className="ml-1 font-normal text-[var(--color-ink-muted)]">
              选填
            </span>
          </Label>
          <Textarea
            id="note"
            value={draft.note}
            placeholder="补充说明"
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, note: e.target.value }))
            }
          />
        </section>

        <section className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)]/80 px-3 py-2.5">
          <Label htmlFor="enabled">启用此日程</Label>
          <Switch
            id="enabled"
            checked={draft.enabled}
            onCheckedChange={(enabled) =>
              setDraft((prev) => ({ ...prev, enabled }))
            }
          />
        </section>

        {draft.id && draft.recurrence === "weekly" && !draft.isCourseSwap
          ? (() => {
              const existing = config.items.find((it) => it.id === draft.id);
              const skipped = existing ? itemSkippedDates(existing) : [];
              if (skipped.length === 0) return null;
              return (
                <section className="flex flex-col gap-2">
                  <Label>已取消的日期</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {skipped.map((d) => (
                      <button
                        key={d}
                        type="button"
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--color-line)] px-2 font-mono text-xs text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                        title="恢复该次"
                        onClick={() => void unskipOccurrence(draft.id!, d)}
                      >
                        {d}
                        <span aria-hidden>×</span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })()
          : null}

        {formError ? (
          <p className="text-sm text-[var(--color-danger)]">{formError}</p>
        ) : null}
      </Dialog>
    </div>
  );

}
