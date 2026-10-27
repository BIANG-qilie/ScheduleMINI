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
        layout="day"
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
    expect(classCard.style.left).toBe("calc(0% + 4px)");
    expect(classCard.style.width).toBe("calc(100% - 8px)");
    const classTop = Number.parseFloat(classCard.style.top);
    const classBottom = classTop + Number.parseFloat(classCard.style.height);
    for (const chip of laneChips) {
      const top = Number.parseFloat((chip as HTMLElement).style.top);
      const box = { top, bottom: top + 16 };
      const separated = box.bottom + 8 <= classTop || classBottom + 8 <= box.top;
      expect(separated).toBe(true);
    }
    expect(document.body.textContent).not.toContain("已补录");
    expect(cards.length).toBe(0);
    expect(classCards.length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /语文/ }).length).toBeGreaterThan(0);
    expect(document.querySelector(".phone-week")).toBeTruthy();
  });

  it("draws short one-off apps on the phone rail without a saved mark", () => {
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
    const once = (id: string, title: string, start: string, end: string): ScheduleItem => ({
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
        layout="day"
        items={[
          weekly("class", "语文"),
          once("xin", "芯片课", "09:12", "09:26"),
          once("wu", "午餐", "09:32", "09:48"),
        ]}
        couple={defaultCouple()}
        showHolidays={false}
        dayOverrides={{}}
        gridStartHour={7}
        gridEndHour={22}
        onCreateAt={vi.fn()}
        onEditItem={vi.fn()}
        onSkipOccurrence={vi.fn()}
        onDeleteItem={vi.fn()}
        onSetDayOverride={vi.fn()}
      />,
    );

    const chips = [...document.querySelectorAll("[data-block='replay-chip']")];
    expect(chips.map((chip) => chip.getAttribute("data-label")).sort()).toEqual([
      "午餐",
      "芯片课",
    ]);
    const lane = chips[0]?.closest("[data-lane]");
    const classCard = lane?.querySelector("[data-block='card']") as HTMLElement;
    expect(classCard.style.width).toContain("100%");
    expect(classCard.style.left).not.toContain("50%");
    expect(document.querySelector(".phone-week")).toBeTruthy();
    expect(document.body.textContent).not.toContain("已补录");
    for (const chip of chips) {
      const label = chip.querySelector(".replay-chip-label");
      expect(label?.textContent).toBe(chip.getAttribute("data-label"));
      expect(label?.textContent?.includes("…")).toBe(false);
    }
  });

  it("keeps this phone day on one rail without squeezing class titles", () => {
    class StubResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", StubResizeObserver);
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 300;
      },
    });

    const today = formatDateKey(new Date());
    const course = (
      id: string,
      primary: string,
      secondary: string,
      start: string,
      end: string,
    ): ScheduleItem => ({
      id,
      start,
      end,
      title: primary,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      enabled: true,
      recurrence: "weekly",
      tag: "work",
      workKind: "class",
      workPrimary: primary,
      workSecondary: secondary,
      skippedDates: [],
      owner: "self",
    });
    const once = (id: string, title: string, start: string, end: string): ScheduleItem => ({
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
        layout="day"
        items={[
          course("mind", "心理健康", "", "09:30", "10:10"),
          once("dy1", "抖音", "10:06", "10:18"),
          once("tata1", "塔塔冒险队", "11:36", "11:50"),
          once("dy2", "抖音", "12:18", "12:30"),
          once("xin", "芯核智算 肖总开会", "13:52", "14:08"),
          course("read", "午读", "五年级", "14:00", "14:20"),
          once("dy3", "抖音", "14:14", "14:26"),
          once("tata2", "塔塔冒险队", "15:41", "15:55"),
          once("dy4", "抖音", "15:58", "16:10"),
        ]}
        couple={defaultCouple()}
        showHolidays={false}
        dayOverrides={{}}
        gridStartHour={7}
        gridEndHour={22}
        onCreateAt={vi.fn()}
        onEditItem={vi.fn()}
        onSkipOccurrence={vi.fn()}
        onDeleteItem={vi.fn()}
        onSetDayOverride={vi.fn()}
      />,
    );

    const lane = document.querySelector("[data-label='塔塔冒险队']")?.closest("[data-lane]");
    expect(lane).toBeTruthy();
    const dots = [...(lane?.querySelectorAll("[data-replay-dot]") ?? [])];
    const lefts = dots.map((dot) => {
      const el = dot as HTMLElement;
      return el.style.left || (el.parentElement as HTMLElement).style.left;
    });
    expect(dots.length).toBe(7);
    expect(new Set(lefts)).toEqual(new Set(["6px"]));

    const classCards = [...(lane?.querySelectorAll("[data-block='card']") ?? [])] as HTMLElement[];
    expect(classCards.map((card) => card.getAttribute("data-item-id")).sort()).toEqual([
      "mind",
      "read",
    ]);
    for (const card of classCards) {
      expect(card.style.left).toBe("calc(0% + 4px)");
      expect(card.style.width).toBe("calc(100% - 8px)");
    }
    expect(lane?.textContent).toContain("心理健康");
    expect(lane?.textContent).toContain("午读 · 五年级");

    const chips = [...(lane?.querySelectorAll("[data-block='replay-chip']") ?? [])] as HTMLElement[];
    const labels = chips.map((chip) => chip.getAttribute("data-label") ?? "").sort();
    expect(labels).toEqual(
      ["抖音", "抖音", "抖音", "抖音", "塔塔冒险队", "塔塔冒险队", "芯核智算 肖总开会"].sort(),
    );
    for (const chip of chips) {
      expect(chip.querySelector(".replay-chip-label")?.textContent).toBe(
        chip.getAttribute("data-label"),
      );
    }

    const cardBoxes = classCards.map((card) => {
      const top = Number.parseFloat(card.style.top);
      const height = Number.parseFloat(card.style.height);
      return { top, bottom: top + height };
    });
    for (const chip of chips) {
      const top = Number.parseFloat(chip.style.top);
      const box = { top, bottom: top + 16 };
      for (const card of cardBoxes) {
        const separated = box.bottom + 8 <= card.top || card.bottom + 8 <= box.top;
        expect(separated).toBe(true);
      }
    }
    expect(document.body.textContent).not.toContain("已补录");
    expect(document.querySelector(".phone-week")).toBeTruthy();
  });
});
