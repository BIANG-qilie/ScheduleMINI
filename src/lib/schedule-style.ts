import type { CSSProperties } from "react";
import {
  formatCallChannelLabel,
  formatGamePlatformLabel,
  formatTagLabel,
  formatWorkKindLabel,
  itemCallChannel,
  itemDisplayTitle,
  itemGamePlatform,
  itemRecurrence,
  itemTag,
  itemWorkKind,
  type ScheduleItem,
  type ScheduleTag,
} from "@/lib/config";
import { cn } from "@/lib/utils";

/** 设置页 / 周视图浅色底 */
export const TAG_SURFACE: Record<
  ScheduleTag,
  { block: string; chip: string; bar: string }
> = {
  work: {
    block:
      "border border-teal-600/30 bg-teal-50 text-teal-950",
    chip: "bg-teal-100 text-teal-800 border-teal-200",
    bar: "bg-teal-500",
  },
  commute: {
    block:
      "border border-violet-600/30 bg-violet-50 text-violet-950",
    chip: "bg-violet-100 text-violet-800 border-violet-200",
    bar: "bg-violet-500",
  },
  study: {
    block: "border border-sky-600/30 bg-sky-50 text-sky-950",
    chip: "bg-sky-100 text-sky-800 border-sky-200",
    bar: "bg-sky-500",
  },
  rest: {
    block:
      "border border-emerald-600/30 bg-emerald-50 text-emerald-950",
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
    bar: "bg-emerald-500",
  },
  life: {
    block:
      "border border-orange-600/30 bg-orange-50 text-orange-950",
    chip: "bg-orange-100 text-orange-800 border-orange-200",
    bar: "bg-orange-500",
  },
  call: {
    block:
      "border border-rose-600/30 bg-rose-50 text-rose-950",
    chip: "bg-rose-100 text-rose-800 border-rose-200",
    bar: "bg-rose-500",
  },
  game: {
    block:
      "border border-indigo-600/30 bg-indigo-50 text-indigo-950",
    chip: "bg-indigo-100 text-indigo-800 border-indigo-200",
    bar: "bg-indigo-500",
  },
  other: {
    block:
      "border border-stone-400/40 bg-stone-100 text-stone-900",
    chip: "bg-stone-200 text-stone-700 border-stone-300",
    bar: "bg-stone-500",
  },
};

/** 悬浮窗深色底 */
export const TAG_WIDGET: Record<
  ScheduleTag,
  { card: string; badge: string; accent: string }
> = {
  work: {
    card: "border-teal-400/35 bg-teal-500/15",
    badge: "bg-teal-400/25 text-teal-100",
    accent: "#2dd4bf",
  },
  commute: {
    card: "border-violet-400/35 bg-violet-500/18",
    badge: "bg-violet-400/25 text-violet-100",
    accent: "#a78bfa",
  },
  study: {
    card: "border-sky-400/35 bg-sky-500/15",
    badge: "bg-sky-400/25 text-sky-100",
    accent: "#38bdf8",
  },
  rest: {
    card: "border-emerald-400/35 bg-emerald-500/15",
    badge: "bg-emerald-400/25 text-emerald-100",
    accent: "#34d399",
  },
  life: {
    card: "border-orange-400/35 bg-orange-500/18",
    badge: "bg-orange-400/25 text-orange-100",
    accent: "#fb923c",
  },
  call: {
    card: "border-rose-400/35 bg-rose-500/18",
    badge: "bg-rose-400/25 text-rose-100",
    accent: "#fb7185",
  },
  game: {
    card: "border-indigo-400/35 bg-indigo-500/18",
    badge: "bg-indigo-400/25 text-indigo-100",
    accent: "#818cf8",
  },
  other: {
    card: "border-white/15 bg-white/8",
    badge: "bg-white/12 text-white/70",
    accent: "#a8a29e",
  },
};

export function itemOrigin(item: ScheduleItem) {
  return item.origin?.trim() || "";
}

export function itemDestination(item: ScheduleItem) {
  return item.destination?.trim() || "";
}

export function formatRoute(item: ScheduleItem): string | null {
  const from = itemOrigin(item);
  const to = itemDestination(item);
  if (!from && !to) return null;
  if (from && to) return `${from} → ${to}`;
  return from || to;
}

export function isCommuteItem(item: ScheduleItem) {
  return itemTag(item) === "commute";
}

export function isCallItem(item: ScheduleItem) {
  return itemTag(item) === "call";
}

export function isGameItem(item: ScheduleItem) {
  return itemTag(item) === "game";
}

/** 周/列表/小窗副行：交通 / 通话 / 游戏 / 工作子类 */
export function formatItemSubline(item: ScheduleItem): string | null {
  if (isCallItem(item)) {
    const ch = itemCallChannel(item);
    return ch ? formatCallChannelLabel(ch) : null;
  }
  if (isGameItem(item)) {
    const platform = itemGamePlatform(item);
    return platform ? formatGamePlatformLabel(platform) : null;
  }
  if (isCommuteItem(item)) return formatRoute(item);
  if (itemTag(item) === "work") {
    const kind = itemWorkKind(item);
    if (kind && kind !== "other") return formatWorkKindLabel(kind);
  }
  return null;
}

export function scheduleBlockClass(item: ScheduleItem) {
  const tag = itemTag(item);
  const once = itemRecurrence(item) === "once";
  return cn(
    TAG_SURFACE[tag].block,
    once && "ring-1 ring-dashed ring-amber-500/70",
  );
}

export function scheduleChipClass(tag: ScheduleTag) {
  return cn(
    "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium",
    TAG_SURFACE[tag].chip,
  );
}

export function itemHoverText(item: ScheduleItem) {
  const parts = [
    `${item.start}–${item.end} · ${formatTagLabel(itemTag(item))}`,
    itemDisplayTitle(item),
  ];
  const sub = formatItemSubline(item);
  if (sub) parts.push(sub);
  if (item.note?.trim()) parts.push(item.note.trim());
  if (itemRecurrence(item) === "once") parts.push("仅一次");
  return parts.join("\n");
}

/** 按所属人着色（周视图 / 列表）；左侧色条强化归属 */
export function ownerSurfaceStyle(hex: string): CSSProperties {
  return {
    borderColor: `${hex}55`,
    backgroundColor: `${hex}18`,
    boxShadow: `inset 3px 0 0 ${hex}`,
  };
}

export function ownerChipStyle(hex: string): CSSProperties {
  return {
    borderColor: `${hex}55`,
    backgroundColor: `${hex}28`,
    color: hex,
  };
}

