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
    const replay = (id: string, title: string, start: string, end: string): ScheduleItem => ({
      id,
      start,
      end,
      title,
      weekdays: [],
      enabled: true,
      recurrence: "once",
      date: today,
      tag: "life",
      skippedDates: [],
      owner: "self",
    });

    render(
      <WeekGrid
        items={[
          weekly("class", "语文"),
          replay("douyin", "抖音", "09:10", "09:25"),
          replay("tata", "塔塔冒险队", "09:30", "09:48"),
        ]}
        couple={defaultCouple()}
        showHolidays={false}
        dayOverrides={{}}
        gridStartHour={7}
        gridEndHour={22}
        replayItemIds={new Set(["douyin", "tata"])}
        onCreateAt={vi.fn()}
        onEditItem={vi.fn()}
        onSkipOccurrence={vi.fn()}
        onDeleteItem={vi.fn()}
        onSetDayOverride={vi.fn()}
      />,
    );

    const chips = [...document.querySelectorAll("[data-block='replay-chip']")];
    const cards = document.querySelectorAll("[data-block='card'][data-item-id='douyin']");
    const classCards = document.querySelectorAll("[data-block='card'][data-item-id='class']");
    expect(chips.length).toBeGreaterThan(1);
    const lane = chips[0]?.closest("[data-lane]");
    const laneChips = [...(lane?.querySelectorAll("[data-block='replay-chip']") ?? [])];
    const dots = [...(lane?.querySelectorAll("[data-replay-dot]") ?? [])];
    expect(dots.length).toBeGreaterThan(1);
    for (const dot of dots) {
      const dotEl = dot as HTMLElement;
      const dotLeft = dotEl.style.left || (dotEl.parentElement as HTMLElement).style.left;
      expect(dotLeft).toBe("6px");
    }
    expect(laneChips.map((chip) => chip.getAttribute("data-label")).sort()).toEqual([
      "塔塔冒险队",
      "抖音",
    ]);
    const classCard = lane?.querySelector("[data-block='card']") as HTMLElement;
    expect(classCard.style.left).toContain("79px");
    expect(classCard.style.width).toContain("100%");
    expect(document.body.textContent).not.toContain("已补录");
    expect(cards.length).toBe(0);
    expect(classCards.length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /语文/ }).length).toBeGreaterThan(0);
  });
});
