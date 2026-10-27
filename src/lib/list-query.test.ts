import { describe, expect, it } from "vitest";
import type { ScheduleItem } from "@/lib/config";
import {
  DEFAULT_LIST_FILTERS,
  filterListItems,
  queryListItems,
  sortListItems,
} from "@/lib/list-query";

function item(partial: Partial<ScheduleItem> & Pick<ScheduleItem, "id" | "title">): ScheduleItem {
  return {
    start: "09:00",
    end: "10:00",
    weekdays: [1],
    enabled: true,
    recurrence: "weekly",
    tag: "work",
    skippedDates: [],
    owner: "self",
    ...partial,
  };
}

describe("list-query", () => {
  const items = [
    item({ id: "a", title: "晨读", start: "08:00", tag: "study", owner: "self" }),
    item({
      id: "b",
      title: "开黑",
      start: "21:00",
      tag: "entertainment",
      owner: "shared",
      recurrence: "once",
      date: "2026-10-26",
      weekdays: [],
    }),
    item({
      id: "c",
      title: "见面",
      start: "19:00",
      tag: "social",
      owner: "partner",
      recurrence: "once",
      date: "2026-10-25",
      weekdays: [],
    }),
  ];

  it("filters by tag and owner", () => {
    expect(
      filterListItems(items, { ...DEFAULT_LIST_FILTERS, tag: "social" }).map(
        (row) => row.id,
      ),
    ).toEqual(["c"]);
    expect(
      filterListItems(items, { ...DEFAULT_LIST_FILTERS, owner: "shared" }).map(
        (row) => row.id,
      ),
    ).toEqual(["b"]);
  });

  it("filters once items by date range", () => {
    expect(
      filterListItems(items, {
        ...DEFAULT_LIST_FILTERS,
        dateFrom: "2026-10-26",
        dateTo: "2026-10-26",
      }).map((row) => row.id),
    ).toEqual(["a", "b"]);
  });

  it("sorts by start time and date", () => {
    expect(sortListItems(items, "start").map((row) => row.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(
      queryListItems(items, DEFAULT_LIST_FILTERS, "date").map((row) => row.id),
    ).toEqual(["c", "b", "a"]);
    const byTitle = sortListItems(items, "title").map((row) => row.title);
    expect(new Set(byTitle)).toEqual(new Set(["晨读", "开黑", "见面"]));
    expect(byTitle).toHaveLength(3);
  });
});
