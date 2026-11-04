import { describe, expect, it } from "vitest";
import {
  clockPartsBetween,
  countdownSentence,
  formatImportWhen,
  readCountdown,
  scheduleDeleteMessage,
} from "@/lib/countdown";
import type { ScheduleItem } from "@/lib/config";

function item(patch: Partial<ScheduleItem> & Pick<ScheduleItem, "id">): ScheduleItem {
  return {
    start: "09:00",
    end: "10:00",
    title: "早餐或开工",
    weekdays: [1],
    enabled: true,
    recurrence: "weekly",
    tag: "life",
    skippedDates: [],
    ...patch,
  };
}

describe("countdown display", () => {
  it("splits 3 天 4 小时 12 分 8 秒 into four columns and one sentence", () => {
    const target = new Date(2026, 10, 8, 12, 0, 8);
    const now = new Date(
      target.getTime() - ((3 * 86_400 + 4 * 3_600 + 12 * 60 + 8) * 1000),
    );
    const parts = clockPartsBetween(now, target);
    expect(parts).toEqual({ days: 3, hours: 4, minutes: 12, seconds: 8 });
    expect(countdownSentence(parts)).toBe("3 天 4 小时 12 分 8 秒");
  });

  it("counts down before the start, says 进行中 during, and ends when nothing follows", () => {
    const weekly = item({ id: "week" });
    const before = readCountdown(weekly, new Date(2026, 10, 1, 12, 0, 0));
    expect(before.mode).toBe("before");
    if (before.mode !== "before") return;
    expect(before.sentence).toBe("0 天 21 小时 0 分 0 秒");
    expect(before.sentence.includes("进行中")).toBe(false);
    expect(before.sentence.includes("结束在")).toBe(false);

    const during = readCountdown(weekly, new Date(2026, 10, 2, 9, 30, 0));
    expect(during).toEqual({ mode: "during", label: "进行中" });

    const nextWeek = readCountdown(weekly, new Date(2026, 10, 2, 10, 30, 0));
    expect(nextWeek.mode).toBe("before");
    if (nextWeek.mode !== "before") return;
    expect(nextWeek.sentence.includes("结束在")).toBe(false);

    const once = item({
      id: "night",
      title: "夜班工作",
      recurrence: "once",
      date: "2026-03-01",
      weekdays: [],
      start: "09:00",
      end: "12:00",
    });
    const ended = readCountdown(once, new Date(2026, 2, 2, 8, 0, 0));
    expect(ended).toEqual({
      mode: "ended",
      sentence: "结束在 2026年3月1日",
      endKey: "2026-03-01",
    });
    const live = readCountdown(once, new Date(2026, 2, 1, 10, 0, 0));
    expect(live.mode).toBe("during");
  });

  it("labels import rows like 今天, 明天, 周几, or a month-day", () => {
    const now = new Date(2026, 10, 4, 8, 0, 0);
    expect(formatImportWhen(new Date(2026, 10, 4, 14, 0, 0), now)).toBe("今天 14:00");
    expect(formatImportWhen(new Date(2026, 10, 5, 7, 30, 0), now)).toBe("明天 07:30");
    expect(formatImportWhen(new Date(2026, 10, 6, 15, 30, 0), now)).toBe("周五 15:30");
    expect(formatImportWhen(new Date(2026, 10, 12, 9, 0, 0), now)).toBe("11月12日");
  });

  it("warns that deleting a highlighted schedule removes the countdown", () => {
    expect(scheduleDeleteMessage("夜班工作", true)).toBe(
      "确定删除「夜班工作」？这条倒数也会去掉",
    );
    expect(scheduleDeleteMessage("早餐或开工", false)).toBe("确定删除「早餐或开工」？");
  });
});
