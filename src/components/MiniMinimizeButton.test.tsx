/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopMiniChrome } from "@/components/MiniMinimizeButton";
import type { AppView } from "@/lib/windows";
import type { ShellPlatform } from "@/lib/mini-minimize";

afterEach(() => {
  cleanup();
});

function renderChrome(view: AppView, platform: ShellPlatform, onMinimize = vi.fn()) {
  render(
    <DesktopMiniChrome view={view} platform={platform} onMinimize={onMinimize} />,
  );
  return onMinimize;
}

describe("DesktopMiniChrome", () => {
  it("桌面小窗有可点的最小化，样式沿用纸面圆按钮", async () => {
    const onMinimize = renderChrome("widget", "desktop");
    const button = screen.getByRole("button", { name: "最小化" });
    expect(button.className).toContain("rounded-full");
    expect(button.className).toContain("border-[var(--color-line)]");
    expect(button.className).toContain("bg-[var(--color-surface)]");
    expect(button.className).toContain("h-6");
    expect(button.className).toContain("w-6");

    await userEvent.setup().click(button);
    expect(onMinimize).toHaveBeenCalledOnce();
  });

  it("手机、浏览器和大窗口不出现这个按钮", () => {
    renderChrome("widget", "android");
    renderChrome("widget", "web");
    renderChrome("settings", "desktop");
    expect(screen.queryByRole("button", { name: "最小化" })).toBeNull();
  });
});
