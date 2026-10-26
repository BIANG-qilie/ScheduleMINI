import {
  ScheduleItemSchema,
  formatDateKey,
  toHhmm,
  type ScheduleTag,
} from "@/lib/config";

/** MOVE_TO_FOREGROUND and ACTIVITY_RESUMED are both 1. */
export const USAGE_FOREGROUND = 1;
/** MOVE_TO_BACKGROUND and ACTIVITY_PAUSED are both 2. */
export const USAGE_BACKGROUND = 2;
export const USAGE_SCREEN_ON = 15;
export const USAGE_SCREEN_OFF = 16;
export const USAGE_KEYGUARD_SHOWN = 17;
export const USAGE_SHUTDOWN = 26;
/** DEVICE_STARTUP does not resume the previous app and does not start one. */
export const USAGE_STARTUP = 27;

export const CALL_INCOMING = 1;
export const CALL_OUTGOING = 2;

export const PHONE_CALL_TITLE = "手机通话" as const;

const TRUNCATE_TYPES = new Set([
  USAGE_SCREEN_ON,
  USAGE_SCREEN_OFF,
  USAGE_KEYGUARD_SHOWN,
  USAGE_SHUTDOWN,
]);

const PHONE_PACKAGES = new Set([
  "com.android.dialer",
  "com.google.android.dialer",
  "com.android.incallui",
  "com.android.server.telecom",
  "com.android.phone",
  "com.samsung.android.dialer",
  "com.samsung.android.incallui",
]);

/** 桌面 / 系统壳：不当成日程线索。 */
const SHELL_PACKAGES = new Set([
  "com.android.launcher",
  "com.android.launcher3",
  "com.google.android.apps.nexuslauncher",
  "com.miui.home",
  "com.huawei.android.launcher",
  "com.hihonor.android.launcher",
  "com.sec.android.app.launcher",
  "com.oppo.launcher",
  "com.android.systemui",
  "com.android.settings",
  "com.android.permissioncontroller",
  "com.android.intentresolver",
]);

/** 本包自己，不当成日程线索。 */
export const SELF_PACKAGE_PREFIX = "com.desktop.schedule";

/**
 * 最短前台时长、同应用合并空档、应用线索上限。
 * 工作暂定值；另记那天的报告给出验收数字后锁进常量，不在那天上改阈值。
 */
export const SHORTLIST_MIN_DURATION_MS = 60_000;
export const SHORTLIST_SAME_APP_MERGE_GAP_MS = 2 * 60_000;
export const SHORTLIST_MAX_APP_CUES = 8;

export type ExistingOnceSpan = {
  start: number;
  end: number;
};

const SCHEDULE_TAGS = new Set<ScheduleTag>([
  "work",
  "commute",
  "study",
  "rest",
  "life",
  "call",
  "game",
  "other",
]);

export type UsageEvent = {
  type: number;
  packageName: string;
  timestamp: number;
  label?: string;
};

/** Matching uses an already formatted E.164 string. Raw numbers stay on the phone. */
export type CallRecord = {
  date: number;
  durationSeconds: number;
  type: number;
  e164: string;
};

export type ForegroundSpan = {
  packageName: string;
  label: string;
  start: number;
  end: number;
};

export type MatchedCall = {
  title: typeof PHONE_CALL_TITLE;
  start: number;
  end: number;
};

export type ReplayCue =
  | {
      kind: "call";
      title: typeof PHONE_CALL_TITLE;
      start: number;
      end: number;
    }
  | {
      kind: "app";
      label: string;
      start: number;
      end: number;
    };

export type ReplayScheduleDraft = {
  id: string;
  start: string;
  end: string;
  title: string;
  weekdays: number[];
  enabled: boolean;
  recurrence: "once";
  date: string;
  endDate?: string;
  tag: ScheduleTag;
  skippedDates: string[];
  owner: "self";
  durationMinutes: number;
  callChannel?: "phone";
};

export type ReplaySelection = {
  cue: ReplayCue;
  checked: boolean;
  title: string;
  tag: ScheduleTag | "";
};

export type DayReplayRead =
  | { ok: false; reason: string }
  | {
      ok: true;
      queryTime: number;
      events: UsageEvent[];
      calls: CallRecord[];
    };

function eventRank(type: number) {
  if (type === USAGE_BACKGROUND || TRUNCATE_TYPES.has(type)) return 0;
  if (type === USAGE_STARTUP) return 1;
  if (type === USAGE_FOREGROUND) return 2;
  return 3;
}

function isPhonePackage(packageName: string) {
  return PHONE_PACKAGES.has(packageName);
}

function isShellPackage(packageName: string) {
  return SHELL_PACKAGES.has(packageName) || isPhonePackage(packageName);
}

function isSelfPackage(packageName: string) {
  return (
    packageName === SELF_PACKAGE_PREFIX ||
    packageName.startsWith(`${SELF_PACKAGE_PREFIX}.`)
  );
}

function overlaps(
  start: number,
  end: number,
  otherStart: number,
  otherEnd: number,
) {
  return start < otherEnd && otherStart < end;
}

function fullyCoveredByOnce(
  start: number,
  end: number,
  existingOnce: readonly ExistingOnceSpan[],
) {
  return existingOnce.some(
    (once) => start >= once.start && end <= once.end && once.end > once.start,
  );
}

/** 显示名优先；桥接拿不到 label 时用包名最后一段，避免整页都是「这个应用」。 */
export function cueDisplayLabel(label: string, packageName: string) {
  const trimmed = label.trim();
  if (trimmed) return trimmed;
  const segment =
    packageName
      .trim()
      .split(".")
      .filter((part) => part.length > 0)
      .pop() ?? "";
  return segment || "这个应用";
}

function mergeSameAppSpans(
  spans: readonly ForegroundSpan[],
  gapMs: number,
): ForegroundSpan[] {
  const byPackage = new Map<string, ForegroundSpan[]>();
  for (const span of spans) {
    const list = byPackage.get(span.packageName);
    if (list) list.push(span);
    else byPackage.set(span.packageName, [span]);
  }
  const merged: ForegroundSpan[] = [];
  for (const group of byPackage.values()) {
    group.sort((a, b) => a.start - b.start || a.end - b.end);
    let current: ForegroundSpan | null = null;
    for (const span of group) {
      if (!current) {
        current = { ...span };
        continue;
      }
      if (span.start - current.end <= gapMs) {
        current = {
          packageName: current.packageName,
          label: current.label || span.label,
          start: current.start,
          end: Math.max(current.end, span.end),
        };
        continue;
      }
      merged.push(current);
      current = { ...span };
    }
    if (current) merged.push(current);
  }
  merged.sort((a, b) => a.start - b.start || a.end - b.end);
  return merged;
}

export function pairForegroundSpans(
  events: readonly UsageEvent[],
  queryTime: number,
): ForegroundSpan[] {
  if (!Number.isFinite(queryTime)) return [];
  const ordered = events
    .filter(
      (event) =>
        Number.isFinite(event.timestamp) && event.timestamp <= queryTime,
    )
    .slice()
    .sort(
      (a, b) =>
        a.timestamp - b.timestamp || eventRank(a.type) - eventRank(b.type),
    );

  const spans: ForegroundSpan[] = [];
  const open = new Map<string, { label: string; start: number }>();

  const closeOne = (packageName: string, end: number) => {
    const span = open.get(packageName);
    if (!span) return;
    open.delete(packageName);
    if (end > span.start) {
      spans.push({
        packageName,
        label: span.label,
        start: span.start,
        end,
      });
    }
  };

  const closeAll = (end: number) => {
    for (const packageName of [...open.keys()]) closeOne(packageName, end);
  };

  for (const event of ordered) {
    if (event.type === USAGE_FOREGROUND) {
      const packageName = event.packageName.trim();
      if (!packageName) continue;
      const current = open.get(packageName);
      if (current) {
        if (!current.label && event.label?.trim()) {
          current.label = event.label.trim();
        }
        continue;
      }
      open.set(packageName, {
        label: event.label?.trim() ?? "",
        start: event.timestamp,
      });
      continue;
    }
    if (event.type === USAGE_BACKGROUND) {
      const packageName = event.packageName.trim();
      if (packageName === "") closeAll(event.timestamp);
      else closeOne(packageName, event.timestamp);
      continue;
    }
    if (TRUNCATE_TYPES.has(event.type)) closeAll(event.timestamp);
  }
  closeAll(queryTime);
  return spans;
}

export function matchAllowlistedCalls(
  calls: readonly CallRecord[],
  allowlist: readonly string[],
  queryTime: number,
): MatchedCall[] {
  const allowed = new Set(
    allowlist.map((entry) => entry.trim()).filter((entry) => entry !== ""),
  );
  if (allowed.size === 0 || !Number.isFinite(queryTime)) return [];
  const matched: MatchedCall[] = [];
  for (const call of calls) {
    if (!Number.isFinite(call.date) || call.date > queryTime) continue;
    if (call.type !== CALL_INCOMING && call.type !== CALL_OUTGOING) continue;
    if (!(call.durationSeconds > 0)) continue;
    const e164 = call.e164.trim();
    if (!allowed.has(e164)) continue;
    matched.push({
      title: PHONE_CALL_TITLE,
      start: call.date,
      end: call.date + call.durationSeconds * 1000,
    });
  }
  return matched;
}

export function buildReplayCues(input: {
  events: readonly UsageEvent[];
  calls: readonly CallRecord[];
  allowlist: readonly string[];
  queryTime: number;
}): ReplayCue[] {
  const calls = matchAllowlistedCalls(
    input.calls,
    input.allowlist,
    input.queryTime,
  );
  const cues: ReplayCue[] = calls.map((call) => ({
    kind: "call" as const,
    title: PHONE_CALL_TITLE,
    start: call.start,
    end: call.end,
  }));
  for (const span of pairForegroundSpans(input.events, input.queryTime)) {
    const covered = calls.some((call) =>
      overlaps(span.start, span.end, call.start, call.end),
    );
    if (isPhonePackage(span.packageName) && covered) continue;
    cues.push({
      kind: "app",
      label: cueDisplayLabel(span.label, span.packageName),
      start: span.start,
      end: span.end,
    });
  }
  cues.sort(
    (a, b) =>
      a.start - b.start || (a.kind === b.kind ? 0 : a.kind === "call" ? -1 : 1),
  );
  return cues;
}

/**
 * 已配对的前台时段 + 已匹配通话 + 当天已有仅一次 → 确认用短清单。
 * 闪一下、壳、本包、完全落在已有仅一次里的时段不出现；通话规则不放宽。
 */
export function shortlistReplayCues(input: {
  spans: readonly ForegroundSpan[];
  matchedCalls: readonly MatchedCall[];
  existingOnce?: readonly ExistingOnceSpan[];
  minDurationMs?: number;
  mergeGapMs?: number;
  maxAppCues?: number;
}): ReplayCue[] {
  const minDurationMs = input.minDurationMs ?? SHORTLIST_MIN_DURATION_MS;
  const mergeGapMs = input.mergeGapMs ?? SHORTLIST_SAME_APP_MERGE_GAP_MS;
  const maxAppCues = input.maxAppCues ?? SHORTLIST_MAX_APP_CUES;
  const existingOnce = input.existingOnce ?? [];

  const filtered = input.spans.filter((span) => {
    if (isShellPackage(span.packageName) || isSelfPackage(span.packageName)) {
      return false;
    }
    if (span.end - span.start < minDurationMs) return false;
    if (fullyCoveredByOnce(span.start, span.end, existingOnce)) return false;
    const coveredByCall = input.matchedCalls.some((call) =>
      overlaps(span.start, span.end, call.start, call.end),
    );
    if (isPhonePackage(span.packageName) && coveredByCall) return false;
    return true;
  });

  const merged = mergeSameAppSpans(filtered, mergeGapMs);
  const ranked = merged
    .slice()
    .sort(
      (a, b) =>
        b.end - b.start - (a.end - a.start) || a.start - b.start,
    );
  const keptApps = ranked.slice(0, Math.max(0, maxAppCues));
  keptApps.sort((a, b) => a.start - b.start || a.end - b.end);

  const cues: ReplayCue[] = input.matchedCalls.map((call) => ({
    kind: "call" as const,
    title: PHONE_CALL_TITLE,
    start: call.start,
    end: call.end,
  }));
  for (const span of keptApps) {
    cues.push({
      kind: "app",
      label: cueDisplayLabel(span.label, span.packageName),
      start: span.start,
      end: span.end,
    });
  }
  cues.sort(
    (a, b) =>
      a.start - b.start || (a.kind === b.kind ? 0 : a.kind === "call" ? -1 : 1),
  );
  return cues;
}

export function buildShortReplayCues(input: {
  events: readonly UsageEvent[];
  calls: readonly CallRecord[];
  allowlist: readonly string[];
  queryTime: number;
  existingOnce?: readonly ExistingOnceSpan[];
}): ReplayCue[] {
  return shortlistReplayCues({
    spans: pairForegroundSpans(input.events, input.queryTime),
    matchedCalls: matchAllowlistedCalls(
      input.calls,
      input.allowlist,
      input.queryTime,
    ),
    existingOnce: input.existingOnce,
  });
}

/** 当天已有的仅一次日程 → 毫秒区间，供短清单去掉完全重叠的前台。 */
export function onceItemsToExistingSpans(
  items: readonly {
    recurrence?: string;
    date?: string;
    start: string;
    end: string;
    endDate?: string;
    durationMinutes?: number;
    enabled?: boolean;
  }[],
  dateKey: string,
): ExistingOnceSpan[] {
  const spans: ExistingOnceSpan[] = [];
  for (const item of items) {
    if (item.enabled === false) continue;
    if ((item.recurrence ?? "weekly") !== "once" || item.date !== dateKey) {
      continue;
    }
    const startAt = new Date(
      Number(dateKey.slice(0, 4)),
      Number(dateKey.slice(5, 7)) - 1,
      Number(dateKey.slice(8, 10)),
      0,
      0,
      0,
      0,
    );
    const [sh, sm] = item.start.split(":").map(Number);
    startAt.setHours(sh, sm, 0, 0);
    let endAt: Date;
    if (item.endDate && item.endDate > item.date) {
      endAt = new Date(
        Number(item.endDate.slice(0, 4)),
        Number(item.endDate.slice(5, 7)) - 1,
        Number(item.endDate.slice(8, 10)),
        0,
        0,
        0,
        0,
      );
      const [eh, em] = item.end.split(":").map(Number);
      endAt.setHours(eh, em, 0, 0);
    } else if (
      item.durationMinutes != null &&
      Number.isInteger(item.durationMinutes) &&
      item.durationMinutes > 0
    ) {
      endAt = new Date(startAt.getTime() + item.durationMinutes * 60_000);
    } else {
      endAt = new Date(startAt);
      const [eh, em] = item.end.split(":").map(Number);
      endAt.setHours(eh, em, 0, 0);
      if (endAt.getTime() <= startAt.getTime()) {
        endAt.setDate(endAt.getDate() + 1);
      }
    }
    if (endAt.getTime() > startAt.getTime()) {
      spans.push({ start: startAt.getTime(), end: endAt.getTime() });
    }
  }
  return spans;
}

export function formatCueRange(start: number, end: number) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (formatDateKey(startDate) === formatDateKey(endDate)) {
    return `${toHhmm(startDate)}–${toHhmm(endDate)}`;
  }
  return `${formatDateKey(startDate)} ${toHhmm(startDate)}–${formatDateKey(endDate)} ${toHhmm(endDate)}`;
}

function projectSpan(startMs: number, endMs: number) {
  const startDate = new Date(startMs);
  const endDate = new Date(endMs);
  const start = toHhmm(startDate);
  const endClock = toHhmm(endDate);
  const date = formatDateKey(startDate);
  if (start === endClock && date === formatDateKey(endDate)) {
    const bumped = new Date(startDate.getTime() + 60_000);
    const endDateKey = formatDateKey(bumped);
    return {
      start,
      end: toHhmm(bumped),
      date,
      endDate: endDateKey === date ? undefined : endDateKey,
      durationMinutes: 1,
    };
  }
  const startMinute = new Date(startDate);
  startMinute.setSeconds(0, 0);
  const endMinute = new Date(endDate);
  endMinute.setSeconds(0, 0);
  const endKey = formatDateKey(endDate);
  return {
    start,
    end: endClock,
    date,
    endDate: endKey === date ? undefined : endKey,
    durationMinutes: Math.max(
      1,
      Math.round((endMinute.getTime() - startMinute.getTime()) / 60_000),
    ),
  };
}

function draftFromCue(
  cue: ReplayCue,
  edits: { title: string; tag: ScheduleTag | "" },
  id: string,
): ReplayScheduleDraft | null {
  const projected = projectSpan(cue.start, cue.end);
  if (cue.kind === "call") {
    return {
      id,
      ...projected,
      title: PHONE_CALL_TITLE,
      weekdays: [],
      enabled: true,
      recurrence: "once",
      tag: "call",
      skippedDates: [],
      owner: "self",
      callChannel: "phone",
    };
  }
  const title = edits.title.trim();
  if (!title || title === cue.label) return null;
  if (!SCHEDULE_TAGS.has(edits.tag as ScheduleTag)) return null;
  return {
    id,
    ...projected,
    title,
    weekdays: [],
    enabled: true,
    recurrence: "once",
    tag: edits.tag as ScheduleTag,
    skippedDates: [],
    owner: "self",
  };
}

export function confirmReplayDrafts(
  rows: readonly ReplaySelection[],
  newId: () => string,
): { drafts: ReplayScheduleDraft[]; rejected: number } {
  const drafts: ReplayScheduleDraft[] = [];
  let rejected = 0;
  for (const row of rows) {
    if (!row.checked) continue;
    const draft = draftFromCue(row.cue, row, newId());
    if (!draft || !ScheduleItemSchema.safeParse(draft).success) {
      rejected += 1;
      continue;
    }
    drafts.push(draft);
  }
  return { drafts, rejected };
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseEvent(value: unknown): UsageEvent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.type !== "number" || typeof row.timestamp !== "number") {
    return null;
  }
  return {
    type: row.type,
    packageName: readString(row.packageName),
    timestamp: row.timestamp,
    label: readString(row.label),
  };
}

function parseCall(value: unknown): CallRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const duration =
    typeof row.durationSeconds === "number"
      ? row.durationSeconds
      : typeof row.duration === "number"
        ? row.duration
        : null;
  if (typeof row.date !== "number" || duration == null || typeof row.type !== "number") {
    return null;
  }
  return {
    date: row.date,
    durationSeconds: duration,
    type: row.type,
    e164: readString(row.e164),
  };
}

export function parseDayReplayRead(raw: string): DayReplayRead {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "read-failed" };
  }
  if (!body || typeof body !== "object") return { ok: false, reason: "read-failed" };
  const record = body as Record<string, unknown>;
  if (record.ok === false) {
    return {
      ok: false,
      reason: typeof record.reason === "string" ? record.reason : "read-failed",
    };
  }
  if (record.ok !== true || typeof record.queryTime !== "number") {
    return { ok: false, reason: "read-failed" };
  }
  return {
    ok: true,
    queryTime: record.queryTime,
    events: Array.isArray(record.events)
      ? record.events.flatMap((item) => {
          const event = parseEvent(item);
          return event ? [event] : [];
        })
      : [],
    calls: Array.isArray(record.calls)
      ? record.calls.flatMap((item) => {
          const call = parseCall(item);
          return call ? [call] : [];
        })
      : [],
  };
}
