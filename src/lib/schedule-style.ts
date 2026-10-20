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

/** 纸色界面上的标签色，色条 class 与此一致 */
export const TAG_BAR: Record<ScheduleTag, string> = {
  work: "#1f8a78",
  commute: "#7c5cbf",
  study: "#3d7ea6",
  rest: "#3d8f62",
  life: "#c47a32",
  call: "#c45d6e",
  game: "#5c62b8",
  other: "#8a8176",
};

/** 设置页 / 周视图浅色底 */
export const TAG_SURFACE: Record<
  ScheduleTag,
  { block: string; chip: string; bar: string }
> = {
  work: {
    block: "border border-[#9ec9be] bg-[#e7f3ef] text-[#143f38]",
    chip: "border-[#b7d5cc] bg-[#d7ebe4] text-[#14584c]",
    bar: "bg-[#1f8a78]",
  },
  commute: {
    block: "border border-[#c7b6de] bg-[#f3eef8] text-[#3d2a58]",
    chip: "border-[#d4c4e6] bg-[#e7dcf3] text-[#4c3470]",
    bar: "bg-[#7c5cbf]",
  },
  study: {
    block: "border border-[#b7cbe0] bg-[#eef4f8] text-[#1d3a52]",
    chip: "border-[#c5d6e6] bg-[#dce8f2] text-[#24506e]",
    bar: "bg-[#3d7ea6]",
  },
  rest: {
    block: "border border-[#b7d4c0] bg-[#eef6f0] text-[#1d4330]",
    chip: "border-[#c5e0ce] bg-[#dceddf] text-[#246044]",
    bar: "bg-[#3d8f62]",
  },
  life: {
    block: "border border-[#e4c7a4] bg-[#fbf3e8] text-[#5c3a16]",
    chip: "border-[#edd4b4] bg-[#f6e6d0] text-[#7a4e1c]",
    bar: "bg-[#c47a32]",
  },
  call: {
    block: "border border-[#e7c0c6] bg-[#fbf1f2] text-[#5c2430]",
    chip: "border-[#f0cdd2] bg-[#f8e0e4] text-[#7a3140]",
    bar: "bg-[#c45d6e]",
  },
  game: {
    block: "border border-[#c5c6e4] bg-[#f1f1f8] text-[#2e3160]",
    chip: "border-[#d2d3ec] bg-[#e4e5f4] text-[#3a3e78]",
    bar: "bg-[#5c62b8]",
  },
  other: {
    block: "border border-[#d5cec4] bg-[#f4f0ea] text-[#3a342c]",
    chip: "border-[#ddd6cc] bg-[#eae4db] text-[#4a433a]",
    bar: "bg-[#8a8176]",
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
  const swap = !!item.isCourseSwap;
  return cn(
    TAG_SURFACE[tag].block,
    (once || swap) && "ring-1 ring-dashed ring-amber-500/70",
  );
}

export function scheduleChipClass(tag: ScheduleTag) {
  return cn(
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide",
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
  if (item.isCourseSwap) parts.push("换课");
  else if (itemRecurrence(item) === "once") parts.push("仅一次");
  return parts.join("\n");
}

/** 按所属人着色（周视图 / 列表）；左侧色条强化归属 */
export function ownerSurfaceStyle(hex: string): CSSProperties {
  return {
    borderColor: `${hex}44`,
    backgroundColor: `${hex}22`,
    boxShadow: `inset 3px 0 0 ${hex}`,
  };
}

/** 列表等大卡片：纸色底，只留归属色条 */
export function ownerRailStyle(hex: string): CSSProperties {
  return {
    backgroundColor: "var(--color-surface)",
    borderColor: "var(--color-line)",
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

