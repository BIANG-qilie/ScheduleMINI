import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  readCallAllowlist,
  writeCallAllowlist,
  type KeyValueStore,
} from "@/lib/call-allowlist";
import { SCHEDULE_TAG_OPTIONS, type ScheduleTag } from "@/lib/config";
import {
  buildReplayCues,
  confirmReplayDrafts,
  formatCueRange,
  parseDayReplayRead,
  type DayReplayRead,
  type ReplayCue,
  type ReplayScheduleDraft,
  type ReplaySelection,
} from "@/lib/day-replay";
import {
  dayReplayBridge,
  type DayReplayBridge,
} from "@/lib/day-replay-native";
import { createId } from "@/lib/utils";

type RowState = ReplaySelection;

function rowsFromCues(cues: ReplayCue[]): RowState[] {
  return cues.map((cue) =>
    cue.kind === "call"
      ? { cue, checked: false, title: cue.title, tag: "call" }
      : { cue, checked: false, title: "", tag: "" },
  );
}

type Props = {
  onCommit: (drafts: ReplayScheduleDraft[]) => Promise<void> | void;
  bridge?: DayReplayBridge | null;
  storage?: KeyValueStore;
};

export function DayReplayEntry({ onCommit, bridge, storage }: Props) {
  const resolved = bridge === undefined ? dayReplayBridge() : bridge;
  const [open, setOpen] = useState(false);
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

  if (!resolved?.readToday) return null;

  const fillRows = (
    nextPayload: Extract<DayReplayRead, { ok: true }>,
    numbers: string[],
  ) => {
    setRows(
      rowsFromCues(
        buildReplayCues({
          events: nextPayload.events,
          calls: nextPayload.calls,
          allowlist: numbers,
          queryTime: nextPayload.queryTime,
        }),
      ),
    );
  };

  const load = () => {
    setLoading(true);
    setError(null);
    setFormError(null);
    const numbers = readCallAllowlist(storage);
    setAllowlist(numbers);
    try {
      const raw = resolved.readToday?.();
      if (typeof raw !== "string") {
        setPayload(null);
        setRows([]);
        setError("读不到今天的记录，已停住。");
        return;
      }
      const parsed = parseDayReplayRead(raw);
      if (!parsed.ok) {
        setPayload(null);
        setRows([]);
        setError(
          parsed.reason === "permission"
            ? "读不到使用情况或通话记录。先在系统里允许，再试一次。"
            : "读不到今天的记录，已停住。",
        );
        return;
      }
      setPayload(parsed);
      fillRows(parsed, numbers);
    } catch {
      setPayload(null);
      setRows([]);
      setError("读不到今天的记录，已停住。");
    } finally {
      setLoading(false);
    }
  };

  const saveAllowlist = (numbers: string[]) => {
    writeCallAllowlist(numbers, storage);
    setAllowlist(numbers);
    if (payload) fillRows(payload, numbers);
  };

  const commit = async () => {
    const { drafts, rejected } = confirmReplayDrafts(rows, createId);
    if (rejected > 0) {
      setFormError("先改标题和标签。应用名不能当作做了什么。");
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

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          load();
        }}
      >
        补今天
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="补今天"
        eyebrow="只在这台手机"
        description="前台时段只带来应用名和时间。改好标题和标签，勾上之后，才记成你的仅一次日程。名单里的已接通来电和去电写成手机通话。"
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
          <div className="rounded-2xl border border-[var(--color-line)] p-3">
            <p className="text-sm text-[var(--color-ink)]">本机号码名单</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-muted)]">
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
          </div>

          {loading ? (
            <p className="text-sm text-[var(--color-ink-muted)]">正在读今天的记录。</p>
          ) : null}
          {error ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--color-danger)]">{error}</p>
              {resolved.requestAccess ? (
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
              今天没有名单里的已接通通话，也没有可核对的前台时段。
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
                      placeholder="当时在做什么"
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
        </div>
      </Dialog>
    </>
  );
}
