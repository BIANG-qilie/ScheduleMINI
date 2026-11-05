import type { ScheduleTag } from "@/lib/config";

/** 工作、交通、学习、社交：两小时及以内是胶囊。其余标签一小时。 */
const TWO_HOUR_CAPSULE: ReadonlySet<ScheduleTag> = new Set([
  "work",
  "commute",
  "study",
  "social",
]);

export function capsuleMaxMinutes(tag: ScheduleTag) {
  return TWO_HOUR_CAPSULE.has(tag) ? 120 : 60;
}

/** 超过胶囊上限才铺淡底。通话按真实时长，不单独拉长。 */
export function usesWash(tag: ScheduleTag, minutes: number) {
  return minutes > capsuleMaxMinutes(tag);
}

/**
 * 长条淡底的混色百分比。
 * 重复项 20%。一次性再透一半，变成 10%（比 20% 更透 50%）。
 */
export function washMixPercent(once: boolean) {
  return once ? 10 : 20;
}

export function washBackground(color: string, once: boolean) {
  return `color-mix(in oklab, ${color} ${washMixPercent(once)}%, transparent)`;
}

/** 淡底左侧的线不着色，只留点击位置。 */
export const WASH_LINE_OPACITY = 0;

/** 一次性胶囊用虚线。 */
export function capsuleDashClass(once: boolean) {
  return once ? "border-dashed" : "";
}
