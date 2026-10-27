import { describe, expect, it } from "vitest";
import {
  CALL_ALLOWLIST_STORAGE_KEY,
  readCallAllowlist,
  writeCallAllowlist,
} from "@/lib/call-allowlist";

describe("allowlist settings and replay share one key", () => {
  it("settings write is what replay reads", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };

    // 设置「数据」分页写入
    writeCallAllowlist(["+8613800138000", "+8613900139000"], storage);
    expect(memory.get(CALL_ALLOWLIST_STORAGE_KEY)).toBe(
      JSON.stringify(["+8613800138000", "+8613900139000"]),
    );

    // 补录读同一把钥匙
    expect(readCallAllowlist(storage)).toEqual([
      "+8613800138000",
      "+8613900139000",
    ]);
  });

  it("replay-side write is what settings reads", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    writeCallAllowlist(["+8613700137000"], storage);
    expect(readCallAllowlist(storage)).toEqual(["+8613700137000"]);
    expect(CALL_ALLOWLIST_STORAGE_KEY).toBe(
      "desktop-schedule-widget:call-allowlist",
    );
  });
});
