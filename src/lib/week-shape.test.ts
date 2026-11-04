import { describe, expect, it } from "vitest";
import {
  WASH_LINE_OPACITY,
  capsuleDashClass,
  capsuleMaxMinutes,
  usesWash,
  washBackground,
  washMixPercent,
} from "@/lib/week-shape";

describe("week shape", () => {
  it("keeps work, commute, study and social as capsules through 2 hours", () => {
    for (const tag of ["work", "commute", "study", "social"] as const) {
      expect(capsuleMaxMinutes(tag)).toBe(120);
      expect(usesWash(tag, 120)).toBe(false);
      expect(usesWash(tag, 121)).toBe(true);
    }
  });

  it("keeps other tags, including calls, as capsules through 1 hour of real duration", () => {
    for (const tag of ["life", "rest", "call", "game", "other"] as const) {
      expect(capsuleMaxMinutes(tag)).toBe(60);
      expect(usesWash(tag, 60)).toBe(false);
      expect(usesWash(tag, 61)).toBe(true);
    }
    expect(usesWash("call", 30)).toBe(false);
    expect(usesWash("call", 90)).toBe(true);
  });

  it("washes longer items at 20% and makes once items half as strong", () => {
    expect(washMixPercent(false)).toBe(20);
    expect(washMixPercent(true)).toBe(10);
    expect(washBackground("#1f8a78", false)).toBe(
      "color-mix(in oklab, #1f8a78 20%, transparent)",
    );
    expect(washBackground("#1f8a78", true)).toBe(
      "color-mix(in oklab, #1f8a78 10%, transparent)",
    );
    expect(WASH_LINE_OPACITY).toBe(0);
  });

  it("draws once capsules with a dashed border", () => {
    expect(capsuleDashClass(true)).toBe("border-dashed");
    expect(capsuleDashClass(false)).toBe("");
  });
});
