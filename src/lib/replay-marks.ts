import type { KeyValueStore } from "@/lib/call-allowlist";
import {
  onceItemsToExistingSpans,
  PHONE_CALL_TITLE,
  type ExistingOnceSpan,
  type ReplayCue,
  type ReplayCueMark,
} from "@/lib/day-replay";

/** 本机补录记号。不进同步。 */
export const REPLAY_MARKS_KEY = "desktop-schedule-widget:replay-marks";

/** 较短一段里，重叠达到这个比例才算同一时段。 */
export const REPLAY_WINDOW_OVERLAP = 0.5;

export type ReplayMark = ReplayCueMark;

export type OnceMatchItem = {
  id?: string;
  title?: string;
  tag?: string;
  recurrence?: string;
  date?: string;
  start: string;
  end: string;
  endDate?: string;
  durationMinutes?: number;
  enabled?: boolean;
};

function browserStore(): KeyValueStore | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

function readMark(value: unknown): ReplayMark | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.kind !== "app" && row.kind !== "call") return null;
  if (typeof row.itemId !== "string" || row.itemId.trim() === "") return null;
  if (typeof row.start !== "number" || typeof row.end !== "number") return null;
  if (!(row.end > row.start)) return null;
  return {
    itemId: row.itemId,
    kind: row.kind,
    packageName: typeof row.packageName === "string" ? row.packageName : "",
    label: typeof row.label === "string" ? row.label : "",
    start: row.start,
    end: row.end,
  };
}

export function readReplayMarks(storage?: KeyValueStore): ReplayMark[] {
  const store = storage ?? browserStore();
  if (!store) return [];
  try {
    const raw = store.getItem(REPLAY_MARKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const mark = readMark(item);
      return mark ? [mark] : [];
    });
  } catch {
    return [];
  }
}

export function forgetReplayMarks(
  itemIds: readonly string[],
  storage?: KeyValueStore,
) {
  if (itemIds.length === 0) return;
  const store = storage ?? browserStore();
  if (!store) return;
  const drop = new Set(itemIds);
  const next = readReplayMarks(store).filter((mark) => !drop.has(mark.itemId));
  store.setItem(REPLAY_MARKS_KEY, JSON.stringify(next));
}

/** 写入成功之后才保留。同一条日程以后写的记号覆盖旧的。 */
export function rememberReplayMarks(
  marks: readonly ReplayMark[],
  storage?: KeyValueStore,
) {
  if (marks.length === 0) return;
  const store = storage ?? browserStore();
  if (!store) return;
  const byId = new Map(readReplayMarks(store).map((mark) => [mark.itemId, mark]));
  for (const mark of marks) {
    if (!mark.itemId.trim() || !(mark.end > mark.start)) continue;
    byId.set(mark.itemId, mark);
  }
  store.setItem(REPLAY_MARKS_KEY, JSON.stringify([...byId.values()]));
}

export function replayItemIds(
  marks: readonly ReplayMark[],
  liveIds: ReadonlySet<string>,
) {
  const ids = new Set<string>();
  for (const mark of marks) {
    if (liveIds.has(mark.itemId)) ids.add(mark.itemId);
  }
  return ids;
}

export function windowsBasicallyOverlap(
  start: number,
  end: number,
  otherStart: number,
  otherEnd: number,
  ratio = REPLAY_WINDOW_OVERLAP,
) {
  const overlap = Math.min(end, otherEnd) - Math.max(start, otherStart);
  if (!(overlap > 0)) return false;
  const shorter = Math.min(end - start, otherEnd - otherStart);
  if (!(shorter > 0)) return false;
  return overlap / shorter >= ratio;
}

function markMatchesCue(
  cue: ReplayCue,
  mark: ReplayMark,
  liveIds: ReadonlySet<string>,
) {
  if (!liveIds.has(mark.itemId)) return false;
  if (mark.kind !== cue.kind) return false;
  if (cue.kind === "app") {
    const pkg = mark.packageName.trim();
    if (!pkg || pkg !== cue.packageName) return false;
  }
  return windowsBasicallyOverlap(cue.start, cue.end, mark.start, mark.end);
}

function sameAppOnce(cue: ReplayCue, span: ExistingOnceSpan) {
  if (cue.kind === "call") {
    return span.tag === "call" || span.title?.trim() === PHONE_CALL_TITLE;
  }
  const title = span.title?.trim() ?? "";
  const label = cue.label.trim();
  return title.length > 0 && label.length > 0 && title === label;
}

function cueIsFilled(
  cue: ReplayCue,
  marks: readonly ReplayMark[],
  spans: readonly ExistingOnceSpan[],
  liveIds: ReadonlySet<string>,
) {
  if (marks.some((mark) => markMatchesCue(cue, mark, liveIds))) return true;
  return spans.some(
    (span) =>
      sameAppOnce(cue, span) &&
      windowsBasicallyOverlap(cue.start, cue.end, span.start, span.end),
  );
}

function fullyInside(cue: ReplayCue, span: ExistingOnceSpan) {
  return cue.start >= span.start && cue.end <= span.end && span.end > span.start;
}

export type AnnotatedCue = {
  cue: ReplayCue;
  filled: boolean;
};

/**
 * 还没记的在前，已补录在后。
 * 完全落在别的日程里、又对不上同一应用的时段仍不出现。
 */
export function annotateReplayCues(input: {
  cues: readonly ReplayCue[];
  marks: readonly ReplayMark[];
  onceItems?: readonly OnceMatchItem[];
  dateKey: string;
  /** 已经算好的当天区间；有则不再从 onceItems 换算。 */
  spans?: readonly ExistingOnceSpan[];
  liveIds?: ReadonlySet<string>;
}): AnnotatedCue[] {
  const onceItems = input.onceItems ?? [];
  const spans =
    input.spans ?? onceItemsToExistingSpans(onceItems, input.dateKey);
  const liveIds =
    input.liveIds ??
    new Set(onceItems.flatMap((item) => (item.id ? [item.id] : [])));
  const pending: ReplayCue[] = [];
  const filled: ReplayCue[] = [];
  for (const cue of input.cues) {
    const already = cueIsFilled(cue, input.marks, spans, liveIds);
    if (!already && spans.some((span) => fullyInside(cue, span))) continue;
    if (already) filled.push(cue);
    else pending.push(cue);
  }
  const byStart = (a: ReplayCue, b: ReplayCue) =>
    a.start - b.start || a.end - b.end;
  pending.sort(byStart);
  filled.sort(byStart);
  return [
    ...pending.map((cue) => ({ cue, filled: false })),
    ...filled.map((cue) => ({ cue, filled: true })),
  ];
}
