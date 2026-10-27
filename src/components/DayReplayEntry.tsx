import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  readCallAllowlist,
  writeCallAllowlist,
  type KeyValueStore,
} from "@/lib/call-allowlist";
import {
  defaultTagForApp,
  rememberAppTags,
} from "@/lib/app-tag-memory";
import {
  formatDateKey,
  SCHEDULE_TAG_OPTIONS,
  type ScheduleTag,
} from "@/lib/config";
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
  hasDayReplayBridge,
  readDayReplay,
  type DayReplayBridge,
} from "@/lib/day-replay-native";
import { createId } from "@/lib/utils";

type RowState = ReplaySelection;

function rowsFromCues(
  cues: ReplayCue[],
  storage?: KeyValueStore,
): RowState[] {
  return cues.map((cue) =>
    cue.kind === "call"
      ? { cue, checked: false, title: cue.title, tag: "call" }
      : {
          cue,
          checked: false,
          title: cue.label,
          tag: defaultTagForApp(cue.packageName, storage),
        },
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
  scheduleItems?: readonly ScheduleOnceSource[];
  existingOnce?: readonly ExistingOnceSpan[];
  /** 受控打开；与 trigger 二选一即可 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 默认：问候下的一行字。传 null 时不画触发器。 */
  trigger?: "text" | null;
};

export function DayReplayEntry({
  onCommit,
  bridge,
  storage,
  scheduleItems,
  existingOnce,
  open: openProp,
  onOpenChange,
  trigger = "text",
}: Props) {
  const resolved = bridge === undefined ? dayReplayBridge() : bridge;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const [dayOffset, setDayOffset] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
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
  const [swipeX, setSwipeX] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const dayChoices = useMemo(() => replayDayChoices(new Date()), [open]);
  const selectedDay = dayChoices[dayOffset] ?? dayChoices[0];

  const canRead =
    typeof resolved?.readDay === "function" ||
    typeof resolved?.readToday === "function";

  useEffect(() => {
    if (!open || !canRead) return;
    load(dayOffset);
    // 仅在打开时读一次当天；切日走 switchDay。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    const nextRows = rowsFromCues(
      buildShortReplayCues({
        events: nextPayload.events,
        calls: nextPayload.calls,
        allowlist: numbers,
        queryTime: nextPayload.queryTime,
        existingOnce: onceForDay(dateKey),
      }),
      storage,
    );
    setRows(nextRows);
    setCardIndex(0);
  };

  const load = (offset: number) => {
    setLoading(true);
    setError(null);
    setFormError(null);
    const numbers = readCallAllowlist(storage);
    setAllowlist(numbers);
    const dateKey =
      replayDayChoices(new Date())[offset]?.dateKey ?? formatDateKey();
    try {
      const raw = resolved ? readDayReplay(resolved, offset) : undefined;
      if (typeof raw !== "string") {
        setPayload(null);
        setRows([]);
        setError("读不到这一天的记录。");
        return;
      }
      const parsed = parseDayReplayRead(raw);
      if (!parsed.ok) {
        setPayload(null);
        setRows([]);
        setError(
          parsed.reason === "permission"
            ? "需要使用情况与通话权限。"
            : "读不到这一天的记录。",
        );
        return;
      }
      setPayload(parsed);
      fillRows(parsed, numbers, dateKey);
    } catch {
      setPayload(null);
      setRows([]);
      setError("读不到这一天的记录。");
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
      setFormError("勾选的条目需要有标签。");
      return;
    }
    if (drafts.length === 0) {
      setFormError("先勾上要记下的几条。");
      return;
    }
    setBusy(true);
    try {
      await onCommit(drafts);
      rememberAppTags(
        rows.flatMap((row) => {
          if (!row.checked || row.cue.kind !== "app") return [];
          if (!row.tag) return [];
          return [{ packageName: row.cue.packageName, tag: row.tag }];
        }),
        storage,
      );
      setOpen(false);
    } catch {
      setFormError("没写进去，本机分类没改。");
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

  const goCard = (next: number) => {
    if (rows.length === 0) return;
    setCardIndex(Math.min(Math.max(0, next), rows.length - 1));
    setSwipeX(0);
  };

  let triggerNode: ReactNode = null;
  if (trigger === "text") {
    triggerNode = (
      <button type="button" className="now-replay-link" onClick={openDialog}>
        根据手机记录补日程
      </button>
    );
  }

  const active = rows[cardIndex];

  return (
    <>
      {triggerNode}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) load(dayOffset);
        }}
        title="补录日程"
        description="对照手机记录，勾选要留下的时段。"
        className="phone-sheet sm:max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void commit()}
              disabled={busy || loading}
            >
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
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-[var(--color-ink-muted)]">正在读取…</p>
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
              这一天没有可核对的时段。
            </p>
          ) : null}

          {active ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--color-ink-muted)]">
                {cardIndex + 1} / {rows.length} · 左右滑切换，勾选可多选
              </p>
              <div
                className="touch-pan-y overflow-hidden"
                onTouchStart={(event) => {
                  setTouchStart(event.changedTouches[0]?.clientX ?? null);
                }}
                onTouchMove={(event) => {
                  if (touchStart == null) return;
                  const x = event.changedTouches[0]?.clientX ?? touchStart;
                  setSwipeX(x - touchStart);
                }}
                onTouchEnd={() => {
                  if (Math.abs(swipeX) > 48) {
                    goCard(cardIndex + (swipeX < 0 ? 1 : -1));
                  } else {
                    setSwipeX(0);
                  }
                  setTouchStart(null);
                }}
              >
                <div
                  className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 transition-transform"
                  style={{ transform: `translateX(${swipeX * 0.35}px)` }}
                  data-testid="replay-cue-card"
                >
                  {active.cue.kind === "call" ? (
                    <>
                      <p className="text-sm font-medium text-[var(--color-ink)]">
                        手机通话
                      </p>
                      <p className="mt-1 text-sm tabular text-[var(--color-ink-muted)]">
                        {formatCueRange(active.cue.start, active.cue.end)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        线索 · {active.cue.label}
                      </p>
                      <p className="mt-1 text-sm tabular text-[var(--color-ink)]">
                        {formatCueRange(active.cue.start, active.cue.end)}
                      </p>
                      <Input
                        className="mt-3"
                        value={active.title}
                        placeholder={active.cue.label}
                        aria-label={`${active.cue.label}的标题`}
                        onChange={(event) => {
                          const title = event.target.value;
                          setRows((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === cardIndex ? { ...item, title } : item,
                            ),
                          );
                        }}
                      />
                      <select
                        className="mt-2 h-10 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-3 text-sm"
                        aria-label={`${active.cue.label}的标签`}
                        value={active.tag}
                        onChange={(event) => {
                          const tag = event.target.value as ScheduleTag | "";
                          setRows((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === cardIndex ? { ...item, tag } : item,
                            ),
                          );
                        }}
                      >
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
                      checked={active.checked}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setRows((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === cardIndex ? { ...item, checked } : item,
                          ),
                        );
                      }}
                    />
                    记下这一条
                  </label>
                </div>
              </div>
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={cardIndex <= 0}
                  onClick={() => goCard(cardIndex - 1)}
                >
                  上一条
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={cardIndex >= rows.length - 1}
                  onClick={() => goCard(cardIndex + 1)}
                >
                  下一条
                </Button>
              </div>
            </div>
          ) : null}

          <details className="rounded-2xl border border-[var(--color-line)] p-3">
            <summary className="cursor-pointer text-sm text-[var(--color-ink)]">
              本机号码名单
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-muted)]">
              只留在这台手机上。
            </p>
            {allowlist.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                名单是空的，通话不会出现。
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {allowlist.map((number) => (
                  <li
                    key={number}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
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

export { hasDayReplayBridge };
