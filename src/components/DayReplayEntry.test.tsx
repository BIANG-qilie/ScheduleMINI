/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DayReplayEntry } from "@/components/DayReplayEntry";
import { CALL_ALLOWLIST_STORAGE_KEY } from "@/lib/call-allowlist";
import { on26 } from "@/lib/day-replay.fixtures";

afterEach(() => {
  cleanup();
});

describe("DayReplayEntry", () => {
  it("shows no button when the Android bridge is missing", () => {
    render(<DayReplayEntry onCommit={() => undefined} bridge={null} />);
    expect(screen.queryByRole("button", { name: "补今天" })).toBeNull();
  });

  it("asks for a real title before an app cue becomes a schedule item", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const memory = new Map<string, string>([
      [CALL_ALLOWLIST_STORAGE_KEY, JSON.stringify(["+8613800138000"])],
    ]);
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    const readToday = () =>
      JSON.stringify({
        ok: true,
        queryTime: on26(18, 0),
        events: [
          {
            type: 1,
            packageName: "com.tencent.mm",
            timestamp: on26(9, 0),
            label: "微信",
          },
          {
            type: 2,
            packageName: "com.tencent.mm",
            timestamp: on26(9, 32),
            label: "微信",
          },
        ],
        calls: [
          {
            date: on26(14, 0),
            duration: 60,
            type: 2,
            e164: "+8613800138000",
            number: "+86 138 0013 8000",
          },
        ],
      });
    render(
      <DayReplayEntry
        onCommit={onCommit}
        bridge={{ readToday }}
        storage={storage}
      />,
    );
    await user.click(screen.getByRole("button", { name: "补今天" }));
    expect(screen.getByRole("heading", { name: "补今天" })).toBeTruthy();
    expect(screen.getByText("线索 · 微信")).toBeTruthy();
    expect(screen.getByText("手机通话")).toBeTruthy();
    expect(screen.queryByText("com.tencent.mm")).toBeNull();

    await user.type(screen.getByLabelText("微信的标题"), "微信");
    await user.selectOptions(screen.getByLabelText("微信的标签"), "life");
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "记下勾选的" }));
    expect(screen.getByText("先改标题和标签。应用名不能当作做了什么。")).toBeTruthy();
    expect(onCommit).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("微信的标题"));
    await user.type(screen.getByLabelText("微信的标题"), "回消息");
    await user.click(screen.getByRole("button", { name: "记下勾选的" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    const drafts = onCommit.mock.calls[0][0] as Record<string, unknown>[];
    expect(drafts[0]).toMatchObject({
      title: "回消息",
      tag: "life",
      recurrence: "once",
      owner: "self",
    });
    expect(JSON.stringify(drafts)).not.toContain("com.tencent.mm");
    expect(JSON.stringify(drafts)).not.toContain("+8613800138000");
  });
});
