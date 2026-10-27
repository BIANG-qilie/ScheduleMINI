import {
  ScheduleTagSchema,
  type ScheduleTag,
} from "@/lib/config";
import type { KeyValueStore } from "@/lib/call-allowlist";

/** 本机应用 → 分类。不进同步。 */
export const APP_TAG_MEMORY_KEY = "desktop-schedule-widget:app-tag-memory";

function browserStore(): KeyValueStore | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export function readAppTagMemory(
  storage?: KeyValueStore,
): Record<string, ScheduleTag> {
  const store = storage ?? browserStore();
  if (!store) return {};
  try {
    const raw = store.getItem(APP_TAG_MEMORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, ScheduleTag> = {};
    for (const [packageName, tag] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      const key = packageName.trim();
      if (!key) continue;
      const parsedTag = ScheduleTagSchema.safeParse(tag);
      if (parsedTag.success) out[key] = parsedTag.data as ScheduleTag;
    }
    return out;
  } catch {
    return {};
  }
}

export function defaultTagForApp(
  packageName: string,
  storage?: KeyValueStore,
): ScheduleTag {
  const key = packageName.trim();
  if (!key) return "other";
  return readAppTagMemory(storage)[key] ?? "other";
}

/** 仅在写入日程成功后调用；失败或取消不要调用。 */
export function rememberAppTags(
  entries: readonly { packageName: string; tag: ScheduleTag }[],
  storage?: KeyValueStore,
) {
  if (entries.length === 0) return;
  const store = storage ?? browserStore();
  if (!store) return;
  const next = { ...readAppTagMemory(store) };
  let touched = false;
  for (const entry of entries) {
    const key = entry.packageName.trim();
    if (!key) continue;
    next[key] = entry.tag;
    touched = true;
  }
  if (!touched) return;
  store.setItem(APP_TAG_MEMORY_KEY, JSON.stringify(next));
}
