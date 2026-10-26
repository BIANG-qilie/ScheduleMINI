import { describe, expect, it, vi, beforeEach } from "vitest";

const listen = vi.fn();
const invoke = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listen(...args),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "settings" }),
}));
vi.mock("@/lib/utils", () => ({
  isTauriRuntime: () => true,
}));

describe("subscribeWidgetVisibility", () => {
  beforeEach(() => {
    listen.mockReset();
    invoke.mockReset();
    listen.mockResolvedValue(() => {});
  });

  it("监听与 Rust 相同的显隐事件名", async () => {
    const { subscribeWidgetVisibility, WIDGET_VISIBILITY_EVENT } =
      await import("@/lib/windows");
    const onChange = vi.fn();
    await subscribeWidgetVisibility(onChange);

    expect(WIDGET_VISIBILITY_EVENT).toBe("widget-visibility-changed");
    expect(listen).toHaveBeenCalledWith(
      WIDGET_VISIBILITY_EVENT,
      expect.any(Function),
    );

    const handler = listen.mock.calls[0][1] as (event: {
      payload: boolean;
    }) => void;
    handler({ payload: false });
    handler({ payload: true });
    expect(onChange).toHaveBeenCalledWith(false);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
