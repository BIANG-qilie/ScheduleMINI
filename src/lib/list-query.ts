import {
  itemRecurrence,
  itemTag,
  type ItemOwner,
  type ScheduleItem,
  type ScheduleTag,
} from "@/lib/config";

export type ListFilters = {
  tag: ScheduleTag | "all";
  owner: ItemOwner | "all";
  /** once=仅一次；weekly=会重复 */
  recurrence: "all" | "once" | "weekly";
};

export const DEFAULT_LIST_FILTERS: ListFilters = {
  tag: "all",
  owner: "all",
  recurrence: "all",
};

export function filterListItems(
  items: readonly ScheduleItem[],
  filters: ListFilters,
): ScheduleItem[] {
  return items.filter((item) => {
    if (filters.tag !== "all" && itemTag(item) !== filters.tag) return false;
    const owner = item.owner ?? "self";
    if (filters.owner !== "all" && owner !== filters.owner) return false;
    if (filters.recurrence !== "all") {
      const recurrence = itemRecurrence(item);
      if (recurrence !== filters.recurrence) return false;
    }
    return true;
  });
}

/** 列表按开始时间排序；同刻按标题。 */
export function sortListItems(
  items: readonly ScheduleItem[],
): ScheduleItem[] {
  const next = [...items];
  next.sort((a, b) => {
    if (a.start !== b.start) return a.start.localeCompare(b.start);
    return a.title.localeCompare(b.title, "zh-CN");
  });
  return next;
}

export function queryListItems(
  items: readonly ScheduleItem[],
  filters: ListFilters,
): ScheduleItem[] {
  return sortListItems(filterListItems(items, filters));
}
