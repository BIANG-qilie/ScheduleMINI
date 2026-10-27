import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  readCallAllowlist,
  writeCallAllowlist,
  type KeyValueStore,
} from "@/lib/call-allowlist";
import { formatDateKey, SCHEDULE_TAG_OPTIONS, type ScheduleTag } from "@/lib/config";
import {
  buildShortReplayCues,
  confirmReplayDrafts,
  formatCueRange,
  onceItemsToExistingSpans,
  parseDayReplayRead,
  replayDayChoices,
  type DayReplayRead,
  type ExistingOnceSpan,
  type ReplayCue,
  type ReplayScheduleDraft,
  type ReplaySelection,
} from "@/lib/day-replay";
import {
  dayReplayBridge,
  readDayReplay,
  type DayReplayBridge,
} from "@/lib/day-replay-native";
import { createId } from "@/lib/utils";

type RowState = ReplaySelection;

function rowsFromCues(cues: ReplayCue[]): RowState[] {
  return cues.map((cue) =>
    cue.kind === "call"
      ? { cue, checked: false, title: cue.title, tag: "call" }
      : { cue, checked: false, title: cue.label, tag: "" },
  );
}

type ScheduleOnceSource = {
  recurrence?: string;
  date?: string;
  start: string;
  end: string;
  endDate?: string;
  durationMinutes?: number;
  enabled?: boolean;
};

type Props = {
  onCommit: (drafts: ReplayScheduleDraft[]) => Promise<void> | void;
  bridge?: DayReplayBridge | null;
  storage?: KeyValueStore;
  /** 若传入日程列表，会按所选日重算已有仅一次区间 */
  scheduleItems?: readonly ScheduleOnceSource[];
  existingOnce?: readonly ExistingOnceSpan[];
  /** 默认：问候下的一行字。传 null 时不画触发器（仅测 Dialog 时少用）。 */
  trigger?: "text" | null;
};

export function DayReplayEntry({
  onCommit,
  bridge,
  storage,
  scheduleItems,
  existingOnce,
  trigger = "text",
}: Props) {
  const resolved = bridge === undefined ? dayReplayBridge() : bridge;
  const [open, setOpen] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Extract<DayReplayRead, { ok: true }> | null>(
    null,
  );
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [draftNumber, setDraftNumber] = useState("");
  const [rows, setRows] = useState<RowState[]>([]);
  const [busy, setBusy] = useState(false);

  const dayChoices = useMemo(() => replayDayChoices(new Date()), [open]);
  const selectedDay = dayChoices[dayOffset] ?? dayChoices[0];

  const canRead =
    typeof resolved?.readDay === "function" ||
    typeof resolved?.readToday === "function";

  if (!canRead) return null;

  const onceForDay = (dateKey: string): readonly ExistingOnceSpan[] => {
    if (scheduleItems) {
      return onceItemsToExistingSpans(scheduleItems, dateKey);
    }
    return existingOnce ?? [];
  };

  const fillRows = (
    nextPayload: Extract<DayReplayRead, { ok: true }>,
    numbers: string[],
    dateKey: string,
  ) => {
    setRows(
      rowsFromCues(
        buildShortReplayCues({
          events: nextPayload.events,
          calls: nextPayload.calls,
          allowlist: numbers,
          queryTime: nextPayload.queryTime,
          existingOnce: onceForDay(dateKey),
        }),
      ),
    );
  };

  const load = (offset: number) => {
    setLoading(true);
    setError(null);
    setFormError(null);
    const numbers = readCallAllowlist(storage);
    setAllowlist(numbers);
    const dateKey = replayDayChoices(new Date())[offset]?.dateKey ?? formatDateKey();
    try {
      const raw = resolved ? readDayReplay(resolved, offset) : undefined;
      if (typeof raw !== "string") {
        setPayload(null);
        setRows([]);
        setError(
          offset === 0
            ? "读不到今天的记录，已停住。"
            : "读不到这一天的记录，已停住。",
        );
        return;
      }
      const parsed = parseDayReplayRead(raw);
      if (!parsed.ok) {
        setPayload(null);
        setRows([]);
        setError(
          parsed.reason === "permission"
            ? "读不到使用情况或通话记录。先在系统里允许，再试一次。"
            : offset === 0
              ? "读不到今天的记录，已停住。"
              : "读不到这一天的记录，已停住。",
        );
        return;
      }
      setPayload(parsed);
      fillRows(parsed, numbers, dateKey);
    } catch {
      setPayload(null);
      setRows([]);
      setError(
        offset === 0
          ? "读不到今天的记录，已停住。"
          : "读不到这一天的记录，已停住。",
      );
    } finally {
      setLoading(false);
    }
  };

  const saveAllowlist = (numbers: string[]) => {
    writeCallAllowlist(numbers, storage);
    setAllowlist(numbers);
    if (payload && selectedDay) fillRows(payload, numbers, selectedDay.dateKey);
  };

  const commit = async () => {
    const { drafts, rejected } = confirmReplayDrafts(rows, createId);
    if (rejected > 0) {
      setFormError("先选好标签。勾上的条需要有标题和标签。");
      return;
    }
    if (drafts.length === 0) {
      setFormError("先勾上要记下的几条。");
      return;
    }
    setBusy(true);
    try {
      await onCommit(drafts);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const openDialog = () => {
    setDayOffset(0);
    setOpen(true);
    load(0);
  };

  const switchDay = (offset: number) => {
    if (offset === dayOffset) return;
    setDayOffset(offset);
    load(offset);
  };

  let triggerNode: ReactNode = null;
  if (trigger === "text") {
    triggerNode = (
      <button type="button" className="now-replay-link" onClick={openDialog}>
        根据手机记录补日程
      </button>
    );
  }

  return (
    <>
      {triggerNode}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="根据手机记录补日程"
        eyebrow="只在这台手机"
        description="选近三天里的一天，核对前台时段和名单通话。标题默认用应用名，你仍可改；线索行仍标出是哪个应用。"
        className="sm:max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => void commit()} disabled={busy || loading}>
              记下勾选的
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div
            className="flex flex-wrap gap-1.5"
            role="tablist"
            aria-label="补哪一天"
          >
            {dayChoices.map((day) => (
              <button
                key={day.offset}
                type="button"
                role="tab"
                aria-selected={day.offset === dayOffset}
                className={
                  day.offset === dayOffset
                    ? "rounded-full border border-[var(--color-ink)] bg-[var(--color-ink)] px-3 py-1 text-xs text-[var(--color-surface)]"
                    : "rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1 text-xs text-[var(--color-ink-muted)]"
                }
                onClick={() => switchDay(day.offset)}
              >
                {day.label}
                <span className="ml-1 tabular opacity-70">
                  {day.dateKey.slice(5)}
                </span>
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              正在读{selectedDay?.label ?? "这一天"}的记录。
            </p>
          ) : null}
          {error ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--color-danger)]">{error}</p>
              {resolved?.requestAccess ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => resolved.requestAccess?.()}
                >
                  去系统里允许
                </Button>
              ) : null}
            </div>
          ) : null}
          {formError ? (
            <p className="text-sm text-[var(--color-danger)]">{formError}</p>
          ) : null}
          {!loading && !error && rows.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              {selectedDay?.label ?? "这一天"}没有名单里的已接通通话，也没有可核对的前台时段。
            </p>
          ) : null}

          <ul className="space-y-3">
            {rows.map((row, index) => (
              <li
                key={`${row.cue.kind}-${row.cue.start}-${index}`}
                className="rounded-2xl border border-[var(--color-line)] p-3"
              >
                {row.cue.kind === "call" ? (
                  <>
                    <p className="text-sm font-medium text-[var(--color-ink)]">手机通话</p>
                    <p className="mt-1 text-sm tabular text-[var(--color-ink-muted)]">
                      {formatCueRange(row.cue.start, row.cue.end)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-[var(--color-ink-muted)]">线索 · {row.cue.label}</p>
                    <p className="mt-1 text-sm tabular text-[var(--color-ink)]">
                      {formatCueRange(row.cue.start, row.cue.end)}
                    </p>
                    <Input
                      className="mt-3"
                      value={row.title}
                      placeholder={row.cue.label}
                      aria-label={`${row.cue.label}的标题`}
                      onChange={(event) => {
                        const title = event.target.value;
                        setRows((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, title } : item,
                          ),
                        );
                      }}
                    />
                    <select
                      className="mt-2 h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-3 text-sm"
                      aria-label={`${row.cue.label}的标签`}
                      value={row.tag}
                      onChange={(event) => {
                        const tag = event.target.value as ScheduleTag | "";
                        setRows((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, tag } : item,
                          ),
                        );
                      }}
                    >
                      <option value="">选择标签</option>
                      {SCHEDULE_TAG_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <label className="mt-3 flex items-center gap-2 text-sm text-[var(--color-ink)]">
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setRows((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, checked } : item,
                        ),
                      );
                    }}
                  />
                  记下这一条
                </label>
              </li>
            ))}
          </ul>

          <details className="rounded-2xl border border-[var(--color-line)] p-3">
            <summary className="cursor-pointer text-sm text-[var(--color-ink)]">
              本机号码名单
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-muted)]">
              只留在这台手机上，不进同步。填写已经整理好的 E.164。
            </p>
            {allowlist.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-ink-muted)]">名单是空的，通话不会出现。</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {allowlist.map((number) => (
                  <li key={number} className="flex items-center justify-between gap-2 text-sm">
                    <span className="tabular">{number}</span>
                    <button
                      type="button"
                      className="text-xs text-[var(--color-ink-muted)] underline-offset-2 hover:underline"
                      onClick={() =>
                        saveAllowlist(allowlist.filter((item) => item !== number))
                      }
                    >
                      移除
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const next = draftNumber.trim();
                if (!next || allowlist.includes(next)) return;
                saveAllowlist([...allowlist, next]);
                setDraftNumber("");
              }}
            >
              <Input
                value={draftNumber}
                onChange={(event) => setDraftNumber(event.target.value)}
                placeholder="+8613800138000"
                aria-label="名单号码"
                inputMode="tel"
              />
              <Button type="submit" variant="secondary" size="sm">
                加入
              </Button>
            </form>
          </details>
        </div>
      </Dialog>
    </>
  );
}
