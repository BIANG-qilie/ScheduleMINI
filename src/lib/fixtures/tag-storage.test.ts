import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatTagLabel,
  parseAppConfig,
  type ScheduleItem,
} from "@/lib/config";
import {
  decryptPayload,
  encryptPayload,
} from "@/lib/sync/crypto";
import type { PersonSlice } from "@/lib/sync/couple";

const onDisk = JSON.parse(
  readFileSync(new URL("./on-disk-game-schedule.json", import.meta.url), "utf8"),
);

describe("tag storage stays game", () => {
  it("keeps on-disk game tags and shows 娱乐; reads entertainment back to game", () => {
    const cfg = parseAppConfig(onDisk);
    const gameItem = cfg.items.find((item) => item.id === "disk-game-1");
    const legacy = cfg.items.find((item) => item.id === "disk-entertainment-legacy");
    const social = cfg.items.find((item) => item.id === "disk-social-1");
    expect(gameItem?.tag).toBe("game");
    expect(formatTagLabel(gameItem!.tag!)).toBe("娱乐");
    expect(legacy?.tag).toBe("game");
    expect(formatTagLabel(legacy!.tag!)).toBe("娱乐");
    expect(social?.tag).toBe("social");
    expect(formatTagLabel("social")).toBe("社交");
    // 磁盘上的 game 不被改写成别的 id
    expect(JSON.stringify(cfg.items.find((item) => item.id === "disk-game-1"))).toContain(
      '"tag":"game"',
    );
  });

  it("sync frame still emits game plus social", async () => {
    const cfg = parseAppConfig(onDisk);
    const slice: PersonSlice = {
      items: cfg.items.filter(
        (item): item is ScheduleItem & { tag: "game" | "social" } =>
          item.tag === "game" || item.tag === "social",
      ),
      selfName: "我",
      selfColor: "#0f766e",
      doc: "shared-v2",
    };
    expect(slice.items.some((item) => item.tag === "game")).toBe(true);
    expect(slice.items.some((item) => item.tag === "social")).toBe(true);
    const wire = await encryptPayload("AB12CD", slice);
    const roundtrip = await decryptPayload<PersonSlice>("AB12CD", wire);
    const tags = roundtrip.items.map((item) => item.tag).sort();
    expect(tags).toContain("game");
    expect(tags).toContain("social");
    expect(tags).not.toContain("entertainment");
    expect(JSON.stringify(roundtrip.items)).toMatch(/"tag":"game"/);
    expect(JSON.stringify(roundtrip.items)).toMatch(/"tag":"social"/);
  });
});
