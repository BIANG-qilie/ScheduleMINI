import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildShortReplayCues,
  matchAllowlistedCalls,
  pairForegroundSpans,
  SHORTLIST_MAX_APP_CUES,
  SHORTLIST_MIN_DURATION_MS,
  SHORTLIST_SAME_APP_MERGE_GAP_MS,
} from "@/lib/day-replay";
import {
  heldOutDay,
  heldOutScheduleWorthy,
} from "@/lib/held-out/labeled-day";

function isRealAllowlistedCall(call: {
  date: number;
  durationSeconds: number;
  type: number;
  e164: string;
}) {
  return (
    (call.type === 1 || call.type === 2) &&
    call.durationSeconds > 0 &&
    heldOutDay.allowlist.some((entry) => entry === call.e164)
  );
}

function cueIsScheduleWorthy(cue: {
  kind: string;
  start: number;
  label?: string;
}) {
  return heldOutScheduleWorthy.some((mark) => {
    if (mark.kind !== cue.kind) return false;
    if (mark.start !== cue.start) return false;
    if (mark.kind === "app" && cue.kind === "app") {
      // 短清单不带包名；用另记的起始对齐
      return true;
    }
    return true;
  });
}

export function scoreHeldOutDay() {
  const spans = pairForegroundSpans(heldOutDay.events, heldOutDay.queryTime);
  const suggestions = matchAllowlistedCalls(
    heldOutDay.calls,
    heldOutDay.allowlist,
    heldOutDay.queryTime,
  );
  const truePositives = suggestions.filter((suggestion) =>
    heldOutDay.calls.some(
      (call) => call.date === suggestion.start && isRealAllowlistedCall(call),
    ),
  );
  const precision =
    suggestions.length === 0 ? 0 : truePositives.length / suggestions.length;
  const recalled = heldOutDay.rememberedCalls.filter((remembered) =>
    suggestions.some((suggestion) => suggestion.start === remembered.start),
  );
  const recall = recalled.length / heldOutDay.rememberedCalls.length;

  let foregroundBoundaryErrorMinutes = 0;
  for (const note of heldOutDay.foregroundNotes) {
    const span = spans.find(
      (item) =>
        item.packageName === note.packageName && item.start === note.eventStart,
    );
    if (!span) throw new Error(`missing span ${note.packageName}`);
    foregroundBoundaryErrorMinutes = Math.max(
      foregroundBoundaryErrorMinutes,
      Math.abs(span.start - note.notedStart) / 60_000,
      Math.abs(span.end - note.notedEnd) / 60_000,
    );
  }

  const shortlist = buildShortReplayCues({
    events: heldOutDay.events,
    calls: heldOutDay.calls,
    allowlist: heldOutDay.allowlist,
    queryTime: heldOutDay.queryTime,
    existingOnce: [...heldOutDay.existingOnce],
  });
  const scheduleWorthyCount = shortlist.filter((cue) =>
    cueIsScheduleWorthy(cue),
  ).length;
  const scheduleWorthyFraction =
    shortlist.length === 0 ? 0 : scheduleWorthyCount / shortlist.length;

  return {
    allowlistedCallPrecision: precision,
    allowlistedCallRecall: recall,
    foregroundBoundaryErrorMinutes,
    spans,
    suggestions,
    shortlist,
    shortlistCueCount: shortlist.length,
    scheduleWorthyCount,
    scheduleWorthyFraction,
    lockedConstants: {
      minDurationMs: SHORTLIST_MIN_DURATION_MS,
      sameAppMergeGapMs: SHORTLIST_SAME_APP_MERGE_GAP_MS,
      maxAppCues: SHORTLIST_MAX_APP_CUES,
    },
  };
}

describe("held-out labeled day", () => {
  it("is not imported by the pairing module", () => {
    const source = readFileSync(
      new URL("../day-replay.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("labeled-day");
    expect(source).not.toContain("heldOutDay");
  });

  it("keeps call precision at 1 and reports the disagreed boundary", () => {
    const score = scoreHeldOutDay();
    const wechat = score.spans.find(
      (span) => span.packageName === "com.tencent.mm",
    );
    expect(wechat?.end).toBe(heldOutDay.foregroundNotes[0].eventEnd);
    expect(wechat?.end).not.toBe(heldOutDay.foregroundNotes[0].notedEnd);
    expect(
      score.suggestions.some(
        (suggestion) => suggestion.start === heldOutDay.rememberedCalls[2].start,
      ),
    ).toBe(false);
    expect(score.allowlistedCallPrecision).toBe(1);
    expect(score.allowlistedCallRecall).toBeLessThan(1);
    expect(score.allowlistedCallRecall).toBeCloseTo(2 / 3);
    expect(score.foregroundBoundaryErrorMinutes).toBe(2);
  });

  it("reports shortlist cue count and schedule-worthy fraction without retuning", () => {
    const score = scoreHeldOutDay();
    // 壳、闪一下、本包、与已有仅一次完全重叠的 Chrome 不进清单；
    // 另记的微信 / Chrome / 两通记住的通话在清单里；名单命中但未另记要写的 11:01 也在。
    expect(score.shortlistCueCount).toBe(5);
    expect(score.scheduleWorthyCount).toBe(4);
    expect(score.scheduleWorthyFraction).toBeCloseTo(0.8);
    expect(
      score.shortlist.some((cue) => cue.kind === "app" && cue.label === "Launcher"),
    ).toBe(false);
    expect(score.shortlist.some((cue) => cue.kind === "app" && cue.label === "小日程")).toBe(
      false,
    );
    expect(score.lockedConstants).toEqual({
      minDurationMs: 60_000,
      sameAppMergeGapMs: 120_000,
      maxAppCues: 8,
    });
  });
});
