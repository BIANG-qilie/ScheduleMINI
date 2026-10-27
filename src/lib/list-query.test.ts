import { describe, expect, it } from "vitest";
import type { ScheduleItem } from "@/lib/config";
import {
  DEFAULT_LIST_FILTERS,
  filterListItems,
  queryListItems,
} from "@/lib/list-query";

function item(
  partial: Partial<ScheduleItem> & Pick<ScheduleItem, "id" | "title">,
): ScheduleItem {
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

/** 当前列表数组夹具；三种筛选的期望条数先写死。 */
const LIST_FIXTURE: ScheduleItem[] = [
  item({ id: "w1", title: "晨读", start: "08:00", tag: "study", owner: "self" }),
  item({
    id: "g1",
    title: "开黑",
    start: "21:00",
    tag: "game",
    owner: "shared",
    recurrence: "once",
    date: "2026-10-26",
    weekdays: [],
  }),
  item({
    id: "s1",
    title: "见面",
    start: "19:00",
    tag: "social",
    owner: "partner",
    recurrence: "once",
    date: "2026-10-25",
    weekdays: [],
  }),
  item({
    id: "w2",
    title: "例会",
    start: "10:00",
    tag: "work",
    owner: "self",
    recurrence: "weekly",
  }),
];

const EXPECTED = {
  tagGame: 1,
  ownerSelf: 2,
  onceOnly: 2,
} as const;

describe("list-query", () => {
  it("locks the three filter counts from the fixture", () => {
    expect(
      filterListItems(LIST_FIXTURE, { ...DEFAULT_LIST_FILTERS, tag: "game" }),
    ).toHaveLength(EXPECTED.tagGame);
    expect(
      filterListItems(LIST_FIXTURE, { ...DEFAULT_LIST_FILTERS, owner: "self" }),
    ).toHaveLength(EXPECTED.ownerSelf);
    expect(
      filterListItems(LIST_FIXTURE, {
        ...DEFAULT_LIST_FILTERS,
        recurrence: "once",
      }),
    ).toHaveLength(EXPECTED.onceOnly);
  });

  it("sorts by start time", () => {
    expect(
      queryListItems(LIST_FIXTURE, DEFAULT_LIST_FILTERS).map((row) => row.id),
    ).toEqual(["w1", "w2", "s1", "g1"]);
  });
});
