import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Download,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  WEEKDAY_LABELS,
  type ScheduleItem,
  formatWeekdays,
} from "@/lib/config";
import { HOLIDAY_DATA_YEARS, getTodayLabel } from "@/lib/holidays";
import { setWidgetVisible } from "@/lib/windows";
import { subscribeConfigChanges, useConfigStore } from "@/store/config-store";

type Draft = {
  id?: string;
  start: string;
  end: string;
  title: string;
  note: string;
  weekdays: number[];
  enabled: boolean;
};

const emptyDraft = (): Draft => ({
  start: "09:00",
  end: "10:00",
  title: "",
  note: "",
  weekdays: [1, 2, 3, 4, 5],
  enabled: true,
});

function itemToDraft(item: ScheduleItem): Draft {
  return {
    id: item.id,
    start: item.start,
    end: item.end,
    title: item.title,
    note: item.note ?? "",
    weekdays: [...item.weekdays],
    enabled: item.enabled,
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
    setShowHolidays,
    setWidgetVisible: setWidgetVisibleFlag,
    setWidgetMode,
    exportConfig,
    importConfig,
    setConfig,
  } = useConfigStore();

  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

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

  const todayLabel = useMemo(() => getTodayLabel(new Date()), []);
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
    setFormError(null);
    setEditorOpen(true);
  };

  const openEdit = (item: ScheduleItem) => {
    setDraft(itemToDraft(item));
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
    if (!draft.title.trim()) {
      setFormError("请填写标题");
      return;
    }
    if (draft.weekdays.length === 0) {
      setFormError("请至少选择一个星期几");
      return;
    }
    if (draft.start >= draft.end) {
      setFormError("结束时间需晚于开始时间");
      return;
    }
    setBusy(true);
    try {
      await upsertItem({
        id: draft.id,
        start: draft.start,
        end: draft.end,
        title: draft.title,
        note: draft.note,
        weekdays: draft.weekdays,
        enabled: draft.enabled,
      });
      setEditorOpen(false);
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
        setStatus("配置已导入并替换");
        if (useConfigStore.getState().config.widgetVisible) {
          await setWidgetVisible(true);
        }
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
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
        <p className="text-sm text-[var(--color-ink-muted)]">正在加载本地配置…</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[linear-gradient(160deg,#f7f3ea_0%,#e9f3ef_45%,#efe8db_100%)]">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-6">
        <header className="space-y-2">
          <p className="text-xs font-medium tracking-[0.18em] text-[var(--color-accent)] uppercase">
            Desktop Schedule
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--color-ink)]">
            桌面日程小窗
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
            管理每周循环的日程条目，打开置顶悬浮窗查看今日安排。配置仅保存在本机。
          </p>
        </header>

        {error ? (
          <div className="rounded-lg border border-[color-mix(in_oklab,var(--color-danger)_35%,white)] bg-[color-mix(in_oklab,var(--color-danger)_8%,white)] px-4 py-3 text-sm text-[var(--color-danger)]">
            加载出错：{error}。已回退到默认样例配置。
          </div>
        ) : null}

        {status ? (
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-ink)]">
            {status}
          </div>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-surface)_88%,white)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">日程列表</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">
                共 {sortedItems.length} 条 · 按开始时间排序
              </p>
            </div>
            <Button type="button" onClick={openCreate} disabled={busy}>
              <Plus className="h-4 w-4" />
              新建日程
            </Button>
          </div>

          {sortedItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-line)] px-4 py-10 text-center">
              <p className="text-sm font-medium">还没有日程</p>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                点击「新建日程」添加第一条，或导入已有 JSON 配置。
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {sortedItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-[var(--color-accent)]">
                        {item.start}–{item.end}
                      </span>
                      {!item.enabled ? (
                        <span className="text-xs text-[var(--color-ink-muted)]">
                          已停用
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-base font-medium">{item.title}</p>
                    {item.note ? (
                      <p className="text-sm text-[var(--color-ink-muted)]">
                        {item.note}
                      </p>
                    ) : null}
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      {formatWeekdays(item.weekdays)}
                    </p>
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
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-surface)_88%,white)] p-5">
          <h2 className="text-base font-semibold">显示与悬浮窗</h2>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="show-holidays">显示中国大陆节假日</Label>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                数据来源 chinese-days，覆盖约 {HOLIDAY_DATA_YEARS}
                {todayLabel.kind !== "none"
                  ? ` · 今日：${todayLabel.name}`
                  : ""}
              </p>
            </div>
            <Switch
              id="show-holidays"
              checked={config.showHolidays}
              onCheckedChange={(v) => void setShowHolidays(v)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="widget-focus">悬浮窗仅显示当前时段</Label>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                开启后只展示进行中的日程，并显示距离下一程的时间；关闭则列出今日全部条目。
              </p>
            </div>
            <Switch
              id="widget-focus"
              checked={config.widgetMode === "current"}
              onCheckedChange={(v) =>
                void setWidgetMode(v ? "current" : "full")
              }
            />
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
            <p className="text-xs text-[var(--color-ink-muted)]">
              关闭设置窗口不会退出；请从系统托盘退出。
            </p>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-surface)_88%,white)] p-5">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 text-[var(--color-accent)]" />
            <div>
              <h2 className="text-base font-semibold">导入 / 导出</h2>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                导出当前完整 JSON 配置。导入会在确认后整份替换。
              </p>
            </div>
          </div>
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
        </section>
      </div>

      <Dialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={draft.id ? "编辑日程" : "新建日程"}
        description="时间按 24 小时制填写；星期可多选，按周循环生效。"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditorOpen(false)}
            >
              取消
            </Button>
            <Button type="button" disabled={busy} onClick={() => void saveDraft()}>
              保存
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="start">开始</Label>
            <Input
              id="start"
              type="time"
              value={draft.start}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, start: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end">结束</Label>
            <Input
              id="end"
              type="time"
              value={draft.end}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, end: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">标题 / 内容</Label>
          <Input
            id="title"
            value={draft.title}
            placeholder="例如：站会、深度工作"
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, title: e.target.value }))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="note">备注（可选）</Label>
          <Textarea
            id="note"
            value={draft.note}
            placeholder="补充说明"
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, note: e.target.value }))
            }
          />
        </div>

        <div className="space-y-2">
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
                      ? "h-9 min-w-9 rounded-md bg-[var(--color-accent)] px-3 text-sm text-white"
                      : "h-9 min-w-9 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm"
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="enabled">启用此日程</Label>
          <Switch
            id="enabled"
            checked={draft.enabled}
            onCheckedChange={(enabled) =>
              setDraft((prev) => ({ ...prev, enabled }))
            }
          />
        </div>

        {formError ? (
          <p className="text-sm text-[var(--color-danger)]">{formError}</p>
        ) : null}
      </Dialog>
    </div>
  );
}
