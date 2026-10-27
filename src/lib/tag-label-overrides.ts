/** 标签显示名只在本机改。不进日程配置，也不进同步；存储 id 仍是 game 等原代号。 */
import {
  SCHEDULE_TAG_META,
  formatTagLabel,
  type ScheduleTag,
  ScheduleTagSchema,
} from "@/lib/config";
import type { KeyValueStore } from "@/lib/call-allowlist";

/** 须与 formatTagLabel 内读取的钥匙一致 */
export const TAG_LABEL_OVERRIDES_STORAGE_KEY =
  "desktop-schedule-widget:tag-label-overrides";

function browserStore(): KeyValueStore | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export type TagLabelOverrides = Partial<Record<ScheduleTag, string>>;

export function readTagLabelOverrides(
  storage?: KeyValueStore,
): TagLabelOverrides {
  const store = storage ?? browserStore();
  if (!store) return {};
  try {
    const raw = store.getItem(TAG_LABEL_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: TagLabelOverrides = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      const tag = ScheduleTagSchema.safeParse(key);
      if (!tag.success) continue;
      if (typeof value !== "string") continue;
      const label = value.trim();
      if (!label) continue;
      out[tag.data as ScheduleTag] = label;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeTagLabelOverrides(
  overrides: TagLabelOverrides,
  storage?: KeyValueStore,
) {
  const store = storage ?? browserStore();
  if (!store) return;
  const next: TagLabelOverrides = {};
  for (const [key, value] of Object.entries(overrides)) {
    const tag = ScheduleTagSchema.safeParse(key);
    if (!tag.success) continue;
    if (typeof value !== "string") continue;
    const label = value.trim();
    if (!label) continue;
    const id = tag.data as ScheduleTag;
    if (label === SCHEDULE_TAG_META[id]?.label) continue;
    next[id] = label;
  }
  store.setItem(TAG_LABEL_OVERRIDES_STORAGE_KEY, JSON.stringify(next));
}

export function setTagLabelOverride(
  tag: ScheduleTag,
  label: string,
  storage?: KeyValueStore,
) {
  const current = readTagLabelOverrides(storage);
  const trimmed = label.trim();
  if (!trimmed || trimmed === SCHEDULE_TAG_META[tag]?.label) {
    const { [tag]: _removed, ...rest } = current;
    writeTagLabelOverrides(rest, storage);
    return;
  }
  writeTagLabelOverrides({ ...current, [tag]: trimmed }, storage);
}

export function resolveTagLabel(
  tag: ScheduleTag,
  overrides?: TagLabelOverrides,
  storage?: KeyValueStore,
): string {
  const map = overrides ?? readTagLabelOverrides(storage);
  return formatTagLabel(tag, map);
}
