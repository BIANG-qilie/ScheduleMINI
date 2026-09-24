import { describe, expect, it } from "vitest";
import { mergeItemsLww } from "@/lib/sync/couple";
import { generateInviteCode, normalizeInviteCode } from "@/lib/sync/crypto";
import {
  BUILTIN_SYNC_RELAY_URL,
  resolveRelayBaseUrl,
} from "@/lib/sync/relay";
import type { ScheduleItem } from "@/lib/config";

function item(
  id: string,
  updatedAt: string,
  title = "t",
): ScheduleItem {
  return {
    id,
    start: "09:00",
    end: "10:00",
    title,
    weekdays: [1],
    enabled: true,
    recurrence: "weekly",
    tag: "work",
    skippedDates: [],
    ownerId: "a",
    updatedAt,
  };
}

describe("mergeItemsLww", () => {
  it("keeps newer updatedAt", () => {
    const local = [item("1", "2026-01-01T10:00:00.000Z", "old")];
    const incoming = [item("1", "2026-01-02T10:00:00.000Z", "new")];
    const merged = mergeItemsLww(local, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("new");
  });

  it("keeps local when newer", () => {
    const local = [item("1", "2026-01-03T10:00:00.000Z", "local")];
    const incoming = [item("1", "2026-01-02T10:00:00.000Z", "remote")];
    expect(mergeItemsLww(local, incoming)[0].title).toBe("local");
  });
});

describe("invite code", () => {
  it("normalizes", () => {
    expect(normalizeInviteCode(" ab-12 ")).toBe("AB12");
  });

  it("generates length 6", () => {
    expect(generateInviteCode(6)).toHaveLength(6);
  });
});

describe("resolveRelayBaseUrl", () => {
  it("settings wins", () => {
    expect(resolveRelayBaseUrl("https://custom.example/")).toBe(
      "https://custom.example",
    );
  });

  it("empty uses builtin when vite unset", () => {
    expect(resolveRelayBaseUrl("")).toBe(BUILTIN_SYNC_RELAY_URL);
  });
});
