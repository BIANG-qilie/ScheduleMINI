import { describe, expect, it } from "vitest";
import { AppConfigSchema, formatTagLabel, parseAppConfig } from "@/lib/config";
import { readFileSync } from "node:fs";
import {
  encryptPayload,
  decryptPayload,
} from "@/lib/sync/crypto";
import type { PersonSlice } from "@/lib/sync/couple";
import type { ScheduleItem } from "@/lib/config";
import {
  TAG_LABEL_OVERRIDES_STORAGE_KEY,
  readTagLabelOverrides,
  setTagLabelOverride,
  writeTagLabelOverrides,
} from "@/lib/tag-label-overrides";

const onDisk = JSON.parse(
  readFileSync(
    new URL("./fixtures/on-disk-game-schedule.json", import.meta.url),
    "utf8",
  ),
);

describe("tag label overrides", () => {
  it("renames display only; disk and sync keep game id", async () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };

    setTagLabelOverride("game", "电竞", storage);
    expect(readTagLabelOverrides(storage)).toEqual({ game: "电竞" });
    expect(memory.get(TAG_LABEL_OVERRIDES_STORAGE_KEY)).toContain("电竞");
    expect(Object.keys(AppConfigSchema.shape)).not.toContain("tagLabelOverrides");
    expect(Object.keys(AppConfigSchema.shape)).not.toContain("tagLabels");

    const cfg = parseAppConfig(onDisk);
    const gameItem = cfg.items.find((item) => item.id === "disk-game-1");
    expect(gameItem?.tag).toBe("game");
    expect(formatTagLabel("game", readTagLabelOverrides(storage))).toBe("电竞");
    expect(formatTagLabel("game", {})).toBe("娱乐");
    expect(JSON.stringify(gameItem)).toContain('"tag":"game"');
    expect(JSON.stringify(gameItem)).not.toContain("电竞");

    const slice: PersonSlice = {
      items: cfg.items.filter(
        (item): item is ScheduleItem & { tag: "game" } => item.tag === "game",
      ),
      selfName: "我",
      selfColor: "#0f766e",
      doc: "shared-v2",
    };
    const wire = await encryptPayload("AB12CD", slice);
    const roundtrip = await decryptPayload<PersonSlice>("AB12CD", wire);
    expect(roundtrip.items.every((item) => item.tag === "game")).toBe(true);
    expect(JSON.stringify(roundtrip.items)).toMatch(/"tag":"game"/);
    expect(JSON.stringify(roundtrip.items)).not.toContain("电竞");
  });

  it("clears override when label matches default", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    writeTagLabelOverrides({ game: "电竞", social: "聚会" }, storage);
    setTagLabelOverride("game", "娱乐", storage);
    expect(readTagLabelOverrides(storage)).toEqual({ social: "聚会" });
  });
});
