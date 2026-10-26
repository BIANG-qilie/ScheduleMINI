import { describe, expect, it } from "vitest";
import { AppConfigSchema, ScheduleItemSchema } from "@/lib/config";
import {
  CALL_ALLOWLIST_STORAGE_KEY,
  readCallAllowlist,
  writeCallAllowlist,
} from "@/lib/call-allowlist";

describe("call allowlist", () => {
  it("stays in its own store, outside the schedule schema", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    writeCallAllowlist(["+8613800138000"], storage);
    expect(readCallAllowlist(storage)).toEqual(["+8613800138000"]);
    expect(CALL_ALLOWLIST_STORAGE_KEY).not.toBe(
      "desktop-schedule-widget:config",
    );
    expect(Object.keys(AppConfigSchema.shape)).not.toContain("callAllowlist");
    expect(Object.keys(AppConfigSchema.shape)).not.toContain("allowlist");
    const itemKeys = Object.keys(ScheduleItemSchema.shape);
    expect(itemKeys).not.toContain("packageName");
    expect(itemKeys).not.toContain("e164");
    expect(itemKeys).not.toContain("number");
    expect(itemKeys).not.toContain("phoneNumber");
    expect(memory.has("desktop-schedule-widget:config")).toBe(false);
  });
});
