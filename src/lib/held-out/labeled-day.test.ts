import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  matchAllowlistedCalls,
  pairForegroundSpans,
} from "@/lib/day-replay";
import { heldOutDay } from "@/lib/held-out/labeled-day";

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

  return {
    allowlistedCallPrecision: precision,
    allowlistedCallRecall: recall,
    foregroundBoundaryErrorMinutes,
    spans,
    suggestions,
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
});
