import {
  itemTag,
  type ItemOwner,
  type ScheduleItem,
  type ScheduleTag,
} from "@/lib/config";

export type ListSortKey = "start" | "title" | "date";

export type ListFilters = {
  tag: ScheduleTag | "all";
  owner: ItemOwner | "all";
  /** YYYY-MM-DD；空字符串表示不限 */
  dateFrom: string;
  dateTo: string;
};

export const DEFAULT_LIST_FILTERS: ListFilters = {
  tag: "all",
  owner: "all",
  dateFrom: "",
  dateTo: "",
};

/** 仅一次用 date；周循环用 activeFrom，否则排到后段 */
export function itemListDateKey(item: ScheduleItem): string {
  if ((item.recurrence ?? "weekly") === "once" && item.date) {
    return item.date;
  }
  return item.activeFrom ?? "9999-99-99";
}

function itemMatchesDateRange(
  item: ScheduleItem,
  dateFrom: string,
  dateTo: string,
): boolean {
  if (!dateFrom && !dateTo) return true;
  const recurrence = item.recurrence ?? "weekly";
  if (recurrence === "once") {
    const key = item.date ?? "";
    if (!key) return false;
    if (dateFrom && key < dateFrom) return false;
    if (dateTo && key > dateTo) return false;
    return true;
  }
  const from = item.activeFrom;
  const until = item.activeUntil;
  if (dateTo && from && from > dateTo) return false;
  if (dateFrom && until && until < dateFrom) return false;
  return true;
}

export function filterListItems(
  items: readonly ScheduleItem[],
  filters: ListFilters,
): ScheduleItem[] {
  return items.filter((item) => {
    if (filters.tag !== "all" && itemTag(item) !== filters.tag) return false;
    const owner = item.owner ?? "self";
    if (filters.owner !== "all" && owner !== filters.owner) return false;
    if (!itemMatchesDateRange(item, filters.dateFrom, filters.dateTo)) {
      return false;
    }
    return true;
  });
}

export function sortListItems(
  items: readonly ScheduleItem[],
  sort: ListSortKey,
): ScheduleItem[] {
  const next = [...items];
  next.sort((a, b) => {
    if (sort === "title") {
      const byTitle = a.title.localeCompare(b.title, "zh-CN");
      if (byTitle !== 0) return byTitle;
      return a.start.localeCompare(b.start);
    }
    if (sort === "date") {
      const byDate = itemListDateKey(a).localeCompare(itemListDateKey(b));
      if (byDate !== 0) return byDate;
      return a.start.localeCompare(b.start);
    }
    if (a.start !== b.start) return a.start.localeCompare(b.start);
    return a.title.localeCompare(b.title, "zh-CN");
  });
  return next;
}

export function queryListItems(
  items: readonly ScheduleItem[],
  filters: ListFilters,
  sort: ListSortKey,
): ScheduleItem[] {
  return sortListItems(filterListItems(items, filters), sort);
}
