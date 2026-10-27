/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateActionSheet } from "@/components/CreateActionSheet";

afterEach(() => {
  cleanup();
});

describe("CreateActionSheet", () => {
  it("offers 新建日程 and 补录日程 side by side", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onReplay = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CreateActionSheet
        open
        onOpenChange={onOpenChange}
        onCreate={onCreate}
        onReplay={onReplay}
      />,
    );
    expect(screen.getByRole("button", { name: "新建日程" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "补录日程" })).toBeTruthy();
    expect(screen.getByText("手写一条新的安排")).toBeTruthy();
    expect(screen.getByText("对照今天用过的应用补上")).toBeTruthy();
    const row = document.querySelector(".create-choice-row");
    expect(row?.querySelectorAll(".create-choice").length).toBe(2);
    expect(document.querySelector(".create-sheet")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "补录日程" }));
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
