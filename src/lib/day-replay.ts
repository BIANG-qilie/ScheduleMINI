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

function overlaps(
  start: number,
  end: number,
  otherStart: number,
  otherEnd: number,
) {
  return start < otherEnd && otherStart < end;
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
      label: span.label.trim() || "这个应用",
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
