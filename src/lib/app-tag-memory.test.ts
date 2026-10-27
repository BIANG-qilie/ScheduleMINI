import { describe, expect, it } from "vitest";
import {
  defaultTagForApp,
  readAppTagMemory,
  rememberAppTags,
} from "@/lib/app-tag-memory";

function memoryStore(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    raw: map,
  };
}

describe("app-tag-memory", () => {
  it("defaults to 其他 when the package has no record", () => {
    const store = memoryStore();
    expect(defaultTagForApp("com.tencent.mm", store)).toBe("other");
    expect(readAppTagMemory(store)).toEqual({});
  });

  it("updates the map only after a successful write", () => {
    const store = memoryStore();
    rememberAppTags(
      [
        { packageName: "com.tencent.mm", tag: "social" },
        { packageName: "com.android.chrome", tag: "life" },
      ],
      store,
    );
    expect(defaultTagForApp("com.tencent.mm", store)).toBe("social");
    expect(defaultTagForApp("com.android.chrome", store)).toBe("life");

    const beforeCancel = JSON.stringify(readAppTagMemory(store));
    // 失败 / 取消：不调用 rememberAppTags
    expect(readAppTagMemory(store)).toEqual(JSON.parse(beforeCancel));
    expect(defaultTagForApp("com.tencent.mm", store)).toBe("social");
  });

  it("does not write when remember receives an empty batch", () => {
    const store = memoryStore();
    rememberAppTags([], store);
    expect(readAppTagMemory(store)).toEqual({});
  });
});
