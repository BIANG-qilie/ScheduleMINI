/** 名单只在这台设备上。不进日程配置，也不进同步。 */
export const CALL_ALLOWLIST_STORAGE_KEY =
  "desktop-schedule-widget:call-allowlist";

export type KeyValueStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function browserStore(): KeyValueStore | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export function readCallAllowlist(storage?: KeyValueStore): string[] {
  const store = storage ?? browserStore();
  if (!store) return [];
  try {
    const raw = store.getItem(CALL_ALLOWLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item !== "");
  } catch {
    return [];
  }
}

export function writeCallAllowlist(
  numbers: readonly string[],
  storage?: KeyValueStore,
) {
  const store = storage ?? browserStore();
  if (!store) return;
  const next = numbers.map((item) => item.trim()).filter((item) => item !== "");
  store.setItem(CALL_ALLOWLIST_STORAGE_KEY, JSON.stringify(next));
}
