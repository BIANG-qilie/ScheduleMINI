/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeekGrid } from "@/components/WeekGrid";
import { defaultCouple, formatDateKey, type ScheduleItem } from "@/lib/config";

afterEach(() => {
  cleanup();
});

function weekly(id: string, title: string): ScheduleItem {
  return {
    id,
    start: "09:00",
    end: "10:00",
    title,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
    recurrence: "weekly",
    tag: "work",
    workKind: "class",
    workPrimary: title,
    skippedDates: [],
    owner: "self",
  };
}

describe("replayed short spans", () => {
  it("keeps the class capsule and draws the replay as a light chip", () => {
    class StubResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", StubResizeObserver);
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 280;
      },
    });

    const today = formatDateKey(new Date());
    const replay: ScheduleItem = {
      id: "douyin",
      start: "09:10",
      end: "09:25",
      title: "抖音",
      weekdays: [],
      enabled: true,
      recurrence: "once",
      date: today,
      tag: "life",
      skippedDates: [],
      owner: "self",
    };

    render(
      <WeekGrid
        items={[weekly("class", "语文"), replay]}
        couple={defaultCouple()}
        showHolidays={false}
        dayOverrides={{}}
        gridStartHour={7}
        gridEndHour={22}
        replayItemIds={new Set(["douyin"])}
        onCreateAt={vi.fn()}
        onEditItem={vi.fn()}
        onSkipOccurrence={vi.fn()}
        onDeleteItem={vi.fn()}
        onSetDayOverride={vi.fn()}
      />,
    );

    const chip = document.querySelector("[data-block='replay-chip']");
    const cards = document.querySelectorAll("[data-block='card'][data-item-id='douyin']");
    const classCards = document.querySelectorAll("[data-block='card'][data-item-id='class']");
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute("data-label")).toBe("抖音");
    expect(cards.length).toBe(0);
    expect(classCards.length).toBeGreaterThan(0);
    const classCard = classCards[0] as HTMLElement;
    expect(classCard.style.width).toContain("100%");
    expect(screen.getAllByRole("button", { name: /语文/ }).length).toBeGreaterThan(0);
  });
});
