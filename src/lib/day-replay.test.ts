import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ScheduleItemSchema } from "@/lib/config";
import {
  ALLOWED,
  at,
  callCases,
  foregroundCases,
  on26,
  PHONE_CALL_TITLE,
  shortlistCases,
} from "@/lib/day-replay.fixtures";
import {
  buildReplayCues,
  buildShortReplayCues,
  confirmReplayDrafts,
  matchAllowlistedCalls,
  pairForegroundSpans,
  parseDayReplayRead,
  SHORTLIST_MAX_APP_CUES,
  SHORTLIST_MIN_DURATION_MS,
  SHORTLIST_SAME_APP_MERGE_GAP_MS,
  shortlistReplayCues,
} from "@/lib/day-replay";

function schemaFieldNames(schema: { shape?: Record<string, unknown> }) {
  if (!schema.shape) throw new Error("schema has no shape");
  return Object.keys(schema.shape);
}

describe("pairForegroundSpans", () => {
  it.each(foregroundCases)("$name", ({ events, queryTime, spans }) => {
    expect(pairForegroundSpans(events, queryTime)).toEqual(spans);
  });
});

describe("allowlisted calls", () => {
  it("keeps two calls thirty seconds apart and drops a phone span that overlaps one", () => {
    expect(
      buildReplayCues({
        events: callCases.events,
        calls: callCases.calls,
        allowlist: callCases.allowlist,
        queryTime: callCases.queryTime,
      }),
    ).toEqual(callCases.cues);
  });

  it("fails the task when a number that is not the allowlist entry is kept", () => {
    const cues = buildReplayCues({
      events: [],
      calls: callCases.calls,
      allowlist: callCases.allowlist,
      queryTime: callCases.queryTime,
    });
    const calls = cues.filter((cue) => cue.kind === "call");
    expect(calls.map((cue) => cue.start)).toEqual([
      on26(15, 0),
      on26(15, 1, 10),
      on26(16, 1),
    ]);
    expect(calls.some((cue) => cue.start === on26(17, 30))).toBe(false);
    expect(calls.some((cue) => cue.start === on26(17, 40))).toBe(false);
  });

  it("shows nothing when the allowlist is empty", () => {
    expect(
      matchAllowlistedCalls(callCases.calls, [], callCases.queryTime),
    ).toEqual([]);
  });

  it("does not match by the last 11 digits", () => {
    expect(
      matchAllowlistedCalls(
        [
          {
            date: on26(17, 30),
            durationSeconds: 30,
            type: 2,
            e164: "+99913800138000",
          },
          {
            date: on26(17, 40),
            durationSeconds: 30,
            type: 2,
            e164: "13800138000",
          },
        ],
        [ALLOWED],
        on26(20, 0),
      ),
    ).toEqual([]);
  });

  it("names a matched call 手机通话", () => {
    const [call] = matchAllowlistedCalls(
      [{ date: on26(15, 0), durationSeconds: 40, type: 2, e164: ALLOWED }],
      [ALLOWED],
      on26(20, 0),
    );
    expect(call).toMatchObject({ title: PHONE_CALL_TITLE });
  });
});

describe("schedule drafts", () => {
  const cues = buildReplayCues({
    events: callCases.events,
    calls: callCases.calls,
    allowlist: callCases.allowlist,
    queryTime: callCases.queryTime,
  });
  const allowedKeys = new Set(schemaFieldNames(ScheduleItemSchema));

  it("writes only ScheduleItem fields, with no number and no package name", () => {
    const app = cues.find((cue) => cue.kind === "app");
    const call = cues.find((cue) => cue.kind === "call");
    expect(app?.kind).toBe("app");
    expect(call?.kind).toBe("call");
    if (app?.kind !== "app" || call?.kind !== "call") return;
    const { drafts, rejected } = confirmReplayDrafts(
      [
        { cue: app, checked: true, title: "回消息", tag: "life" },
        { cue: call, checked: true, title: "随便写", tag: "life" },
        { cue: app, checked: false, title: "没勾", tag: "life" },
      ],
      () => "draft-1",
    );
    expect(rejected).toBe(0);
    expect(drafts).toHaveLength(2);
    for (const draft of drafts) {
      for (const key of Object.keys(draft)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
      expect(draft).not.toHaveProperty("packageName");
      expect(draft).not.toHaveProperty("e164");
      expect(draft).not.toHaveProperty("number");
      expect(draft).not.toHaveProperty("label");
      expect(JSON.stringify(draft)).not.toContain(ALLOWED);
      expect(JSON.stringify(draft)).not.toContain("com.");
      expect(draft.recurrence).toBe("once");
      expect(draft.owner).toBe("self");
      expect(ScheduleItemSchema.safeParse(draft).success).toBe(true);
    }
    expect(drafts[1]).toMatchObject({
      title: PHONE_CALL_TITLE,
      tag: "call",
      callChannel: "phone",
    });
  });

  it("refuses to save an app cue whose title is still the app name", () => {
    const app = cues.find((cue) => cue.kind === "app");
    if (app?.kind !== "app") throw new Error("missing app cue");
    const { drafts, rejected } = confirmReplayDrafts(
      [{ cue: app, checked: true, title: app.label, tag: "life" }],
      () => "draft-2",
    );
    expect(drafts).toEqual([]);
    expect(rejected).toBe(1);
  });

  it("writes an overnight span with the existing end date", () => {
    const start = on26(23, 50);
    const end = at(2026, 10, 27, 0, 10);
    const { drafts } = confirmReplayDrafts(
      [
        {
          cue: { kind: "app", label: "微信", start, end },
          checked: true,
          title: "夜读",
          tag: "study",
        },
      ],
      () => "night",
    );
    expect(drafts[0]?.date).toBe("2026-10-26");
    expect(drafts[0]?.endDate).toBe("2026-10-27");
    expect(ScheduleItemSchema.safeParse(drafts[0]).success).toBe(true);
  });

  it("can store a sub-minute call on the existing minute fields", () => {
    const [call] = matchAllowlistedCalls(
      [{ date: on26(9, 0, 10), durationSeconds: 30, type: 1, e164: ALLOWED }],
      [ALLOWED],
      on26(12, 0),
    );
    const { drafts } = confirmReplayDrafts(
      [
        {
          cue: {
            kind: "call",
            title: PHONE_CALL_TITLE,
            start: call.start,
            end: call.end,
          },
          checked: true,
          title: PHONE_CALL_TITLE,
          tag: "call",
        },
      ],
      () => "draft-3",
    );
    expect(ScheduleItemSchema.safeParse(drafts[0]).success).toBe(true);
    expect(drafts[0].start).not.toBe(drafts[0].end);
  });
});

describe("bridge payload", () => {
  it("reads already formatted e164 and drops rows after the query time", () => {
    const raw = JSON.stringify({
      ok: true,
      queryTime: on26(16, 0),
      events: [
        {
          type: 1,
          packageName: "com.tencent.mm",
          timestamp: on26(15, 0),
          label: "微信",
          number: ALLOWED,
        },
      ],
      calls: [
        {
          date: on26(15, 30),
          duration: 20,
          type: 2,
          e164: ALLOWED,
          number: "+86 138 0013 8000",
          cachedNormalizedNumber: ALLOWED,
        },
        {
          date: on26(16, 30),
          duration: 20,
          type: 2,
          e164: ALLOWED,
        },
      ],
    });
    const parsed = parseDayReplayRead(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const cues = buildReplayCues({
      events: parsed.events,
      calls: parsed.calls,
      allowlist: [ALLOWED],
      queryTime: parsed.queryTime,
    });
    expect(cues.filter((cue) => cue.kind === "call")).toHaveLength(1);
    expect(JSON.stringify(cues)).not.toContain("packageName");
  });

  it("stops when the bridge cannot read", () => {
    expect(parseDayReplayRead(JSON.stringify({ ok: false, reason: "permission" }))).toEqual({
      ok: false,
      reason: "permission",
    });
  });
});

describe("shortlistReplayCues", () => {
  it.each(shortlistCases)("$name", ({ spans, matchedCalls, existingOnce, cues }) => {
    expect(
      shortlistReplayCues({
        spans,
        matchedCalls,
        existingOnce,
      }),
    ).toEqual(cues);
  });

  it("keeps allowlisted call cues unchanged beside the short app list", () => {
    expect(
      buildShortReplayCues({
        events: callCases.events,
        calls: callCases.calls,
        allowlist: callCases.allowlist,
        queryTime: callCases.queryTime,
      }),
    ).toEqual(callCases.cues);
  });

  it("locks working constants for min duration, merge gap, and app cue cap", () => {
    expect(SHORTLIST_MIN_DURATION_MS).toBe(60_000);
    expect(SHORTLIST_SAME_APP_MERGE_GAP_MS).toBe(120_000);
    expect(SHORTLIST_MAX_APP_CUES).toBe(8);
  });
});

describe("pairing module boundary", () => {
  it("does not import the held-out day", () => {
    const source = readFileSync(new URL("./day-replay.ts", import.meta.url), "utf8");
    expect(source).not.toContain("held-out");
    expect(source).not.toContain("labeled-day");
  });
});
