/** @vitest-environment jsdom */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { UpdatePrompt, useUpdateDialogLift } from "@/components/UpdatePrompt";
import { updateDialogLift } from "@/lib/update/update-dialog-layout";
import type { ReleaseInfo } from "@/lib/update/release";
import { useUpdateStore } from "@/store/update-store";

const LONG_NOTES = ["一", "二", "三", "四", "五项完整说明", "六也不丢"]
  .map((line) => `- ${line}`)
  .join("\n");

function openPrompt(notes: string) {
  const release: ReleaseInfo = {
    version: "9.0.0",
    notes,
    htmlUrl: "https://github.com/BIANG-qilie/ScheduleMINI/releases/tag/v9.0.0",
    publishedAt: null,
    assets: [],
  };
  useUpdateStore.setState({
    status: "available",
    release,
    percent: null,
    error: null,
    handedOffTo: null,
    promptOpen: true,
  });
}

afterEach(() => {
  cleanup();
  useUpdateStore.setState({
    status: "idle",
    release: null,
    promptOpen: false,
    error: null,
    percent: null,
    handedOffTo: null,
  });
});

describe("UpdatePrompt 更新说明", () => {
  it("短说明全部展示，没有展开按钮", () => {
    openPrompt("- 自动检查更新\n- 修复同步");
    render(<UpdatePrompt />);
    expect(screen.getByText("自动检查更新")).toBeTruthy();
    expect(screen.getByText("修复同步")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /查看全部更新说明/ })).toBeNull();
    expect(screen.queryByText(/等 \d+ 项/)).toBeNull();
  });

  it("长说明先预览，点开后能在弹窗里看完", async () => {
    openPrompt(LONG_NOTES);
    render(<UpdatePrompt />);
    expect(screen.getByText("一")).toBeTruthy();
    expect(screen.getByText("四")).toBeTruthy();
    expect(screen.queryByText("五项完整说明")).toBeNull();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "查看全部更新说明（还有 2 项）" }),
    );
    expect(screen.getByText("五项完整说明")).toBeTruthy();
    expect(screen.getByText("六也不丢")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "收起" }));
    expect(screen.queryByText("五项完整说明")).toBeNull();
    expect(screen.getByText("一")).toBeTruthy();
  });

  it("关掉再打开仍从预览开始", async () => {
    openPrompt(LONG_NOTES);
    render(<UpdatePrompt />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "查看全部更新说明（还有 2 项）" }),
    );
    expect(screen.getByText("六也不丢")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "稍后" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => {
      useUpdateStore.setState({ promptOpen: true });
    });
    expect(screen.queryByText("六也不丢")).toBeNull();
    expect(
      screen.getByRole("button", { name: "查看全部更新说明（还有 2 项）" }),
    ).toBeTruthy();
  });

  it("下载中显示真实百分比", () => {
    openPrompt("- 修复同步");
    act(() => {
      useUpdateStore.setState({ status: "installing", percent: 42 });
    });
    render(<UpdatePrompt />);
    expect(screen.getByRole("button", { name: "下载中 42%" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("42%");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "42",
    );
  });

  it("进度未知时只显示正在下载，不编造百分比", () => {
    openPrompt("- 修复同步");
    act(() => {
      useUpdateStore.setState({ status: "installing", percent: null });
    });
    render(<UpdatePrompt />);
    expect(screen.getByRole("button", { name: "下载中…" })).toBeTruthy();
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("正在下载");
    expect(status.textContent).not.toMatch(/\d+%/);
    expect(
      screen.getByRole("progressbar").hasAttribute("aria-valuenow"),
    ).toBe(false);
  });

  it("按视口高度抬起弹窗，矮屏抬得少", () => {
    window.innerHeight = 844;
    const tall = renderHook(() => useUpdateDialogLift());
    expect(tall.result.current).toBe(updateDialogLift(844, 0));
    tall.unmount();

    window.innerHeight = 640;
    const short = renderHook(() => useUpdateDialogLift());
    expect(short.result.current).toBe(updateDialogLift(640, 0));
    short.unmount();
  });

  it("手机上的更新弹窗带抬起距离，避免贴住底边", () => {
    window.innerHeight = 844;
    openPrompt("- 修复同步");
    render(<UpdatePrompt />);
    const frame = screen.getByRole("dialog").parentElement;
    expect(frame?.className).toContain("update-dialog-lift");
    expect(frame?.style.getPropertyValue("--update-dialog-lift")).toBe(
      `${updateDialogLift(844, 0)}px`,
    );
  });
});
