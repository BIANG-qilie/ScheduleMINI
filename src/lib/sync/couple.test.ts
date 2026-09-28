import { describe, expect, it } from "vitest";
import {
  authoredItems,
  flipOwnerForLocal,
  lanePartnerItems,
  laneSelfItems,
  mergeItemsLww,
  rekeyAuthoredItems,
} from "@/lib/sync/couple";
import {
  encodeDeviceSyncCode,
  generateInviteCode,
  normalizeInviteCode,
  parseDeviceSyncCode,
} from "@/lib/sync/crypto";
import {
  BUILTIN_SYNC_RELAY_URL,
  resolveRelayBaseUrl,
} from "@/lib/sync/relay";
import { parseAppConfig, type ScheduleItem } from "@/lib/config";

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
    owner: "self",
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

describe("device sync code", () => {
  it("round-trips room + personId", () => {
    const code = encodeDeviceSyncCode("ab12cd", "550e8400-e29b-41d4-a716-446655440000");
    expect(code.startsWith("D1.")).toBe(true);
    expect(parseDeviceSyncCode(code)).toEqual({
      inviteCode: "AB12CD",
      personId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("rejects short invite codes as device codes", () => {
    expect(parseDeviceSyncCode("AB12CD")).toBeNull();
  });

  it("rekeys authored items to shared personId", () => {
    const items = [
      item("1", "2026-01-01T00:00:00.000Z"),
      {
        ...item("2", "2026-01-01T00:00:00.000Z"),
        ownerId: "other",
      },
    ];
    const next = rekeyAuthoredItems(items, "a", "shared");
    expect(next.find((i) => i.id === "1")?.ownerId).toBe("shared");
    expect(next.find((i) => i.id === "2")?.ownerId).toBe("other");
  });
});

describe("shared-v2 owner round-trip", () => {
  it("keeps shared through flip and LWW merge", () => {
    const local = [
      {
        ...item("s1", "2026-01-01T10:00:00.000Z", "约会"),
        owner: "shared" as const,
      },
    ];
    const fromPartner = local.map((it) => ({
      ...it,
      owner: flipOwnerForLocal(it.owner),
      updatedAt: "2026-01-02T10:00:00.000Z",
      title: "约会·新",
    }));
    expect(fromPartner[0].owner).toBe("shared");
    const merged = mergeItemsLww(local, fromPartner);
    expect(merged).toHaveLength(1);
    expect(merged[0].owner).toBe("shared");
    expect(merged[0].title).toBe("约会·新");
  });

  it("does not flip shared when partner updates self item", () => {
    const remoteSelf = item("x", "2026-01-03T00:00:00.000Z", "对方课");
    const flipped = {
      ...remoteSelf,
      owner: flipOwnerForLocal(remoteSelf.owner),
    };
    expect(flipped.owner).toBe("partner");
    const withShared = [
      {
        ...item("s", "2026-01-01T00:00:00.000Z", "共同"),
        owner: "shared" as const,
      },
      flipped,
    ];
    const merged = mergeItemsLww([], withShared);
    expect(merged.find((i) => i.id === "s")?.owner).toBe("shared");
    expect(merged.find((i) => i.id === "x")?.owner).toBe("partner");
  });

  it("LWW prefers newer shared over older self same id", () => {
    const olderSelf = item("same", "2026-01-01T00:00:00.000Z", "旧");
    const newerShared = {
      ...item("same", "2026-01-05T00:00:00.000Z", "共同版"),
      owner: "shared" as const,
    };
    const merged = mergeItemsLww([olderSelf], [newerShared]);
    expect(merged[0].owner).toBe("shared");
    expect(merged[0].title).toBe("共同版");
  });
});

describe("owner lane", () => {
  it("flips relative owner across devices", () => {
    expect(flipOwnerForLocal("self")).toBe("partner");
    expect(flipOwnerForLocal("partner")).toBe("self");
    expect(flipOwnerForLocal("shared")).toBe("shared");
    expect(flipOwnerForLocal(undefined)).toBe("partner");
  });

  it("authored vs lane filters", () => {
    const items: ScheduleItem[] = [
      { ...item("1", "2026-01-01T00:00:00.000Z"), owner: "self", ownerId: "me" },
      {
        ...item("2", "2026-01-01T00:00:00.000Z"),
        owner: "partner",
        ownerId: "me",
      },
      {
        ...item("3", "2026-01-01T00:00:00.000Z"),
        owner: "self",
        ownerId: "them",
      },
      {
        ...item("4", "2026-01-01T00:00:00.000Z"),
        owner: "shared",
        ownerId: "me",
      },
    ];
    expect(authoredItems(items, "me").map((i) => i.id)).toEqual([
      "1",
      "2",
      "4",
    ]);
    expect(laneSelfItems(items).map((i) => i.id)).toEqual(["1", "3", "4"]);
    expect(lanePartnerItems(items).map((i) => i.id)).toEqual(["2", "4"]);
  });

  it("migrates missing owner from foreign ownerId", () => {
    const cfg = parseAppConfig({
      version: 1,
      showHolidays: true,
      widgetVisible: true,
      couple: {
        memberId: "me",
        selfName: "我",
        selfColor: "#0f766e",
        partnerName: "对方",
        partnerColor: "#a21caf",
      },
      items: [
        {
          id: "p",
          start: "09:00",
          end: "10:00",
          title: "对方的",
          weekdays: [1],
          enabled: true,
          ownerId: "them",
        },
        {
          id: "s",
          start: "11:00",
          end: "12:00",
          title: "自己的",
          weekdays: [1],
          enabled: true,
        },
      ],
    });
    expect(cfg.items.find((i) => i.id === "p")?.owner).toBe("partner");
    expect(cfg.items.find((i) => i.id === "s")?.owner).toBe("self");
    expect(cfg.soloMode).toBe(false);
  });
});
