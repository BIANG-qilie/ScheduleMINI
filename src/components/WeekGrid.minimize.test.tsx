/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeekGrid } from "@/components/WeekGrid";
import { defaultCouple, type ScheduleItem } from "@/lib/config";
import { minimizeDesktopMiniWindow } from "@/lib/mini-minimize";

vi.mock("@/lib/mini-minimize", () => ({
  minimizeDesktopMiniWindow: vi.fn(async () => {}),
  showDesktopMiniMinimize: vi.fn(() => false),
  restoreDesktopMiniChrome: vi.fn(async () => {}),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function item(id: string, start: string, end: string, title: string): ScheduleItem {
  return {
    id,
    start,
    end,
    title,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
    recurrence: "weekly",
    tag: "work",
    skippedDates: [],
    owner: "self",
  };
}

describe("周历点击不会最小化窗口", () => {
  it("日程、+N 和空白格子都不调用最小化", async () => {
    class StubResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", StubResizeObserver);

    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 140;
      },
    });

    const onCreateAt = vi.fn();
    const onEditItem = vi.fn();
    try {
      render(
        <WeekGrid
          items={[
            item("meet", "09:00", "10:00", "晨会"),
            item("review", "09:15", "09:45", "复盘"),
            item("noon", "09:20", "09:50", "午会"),
          ]}
          couple={defaultCouple()}
          showHolidays={false}
          dayOverrides={{}}
          gridStartHour={7}
          gridEndHour={22}
          onCreateAt={onCreateAt}
          onEditItem={onEditItem}
          onSkipOccurrence={vi.fn()}
          onDeleteItem={vi.fn()}
          onSetDayOverride={vi.fn()}
        />,
      );

      expect(screen.queryByRole("button", { name: "最小化" })).toBeNull();

      const user = userEvent.setup();
      await user.click(screen.getAllByRole("button", { name: /晨会/ })[0]);
      expect(onEditItem).toHaveBeenCalled();

      await user.click(screen.getAllByRole("button", { name: /还有 \d+ 项/ })[0]);
      expect(screen.getByText("复盘")).toBeTruthy();

      const lane = document.querySelector("[data-lane]");
      expect(lane).toBeTruthy();
      await user.click(lane as HTMLElement);
      expect(onCreateAt).toHaveBeenCalled();

      expect(minimizeDesktopMiniWindow).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      if (width) Object.defineProperty(HTMLElement.prototype, "clientWidth", width);
      else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
  });
});
