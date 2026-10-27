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

const ENTRY_LABEL = "根据手机记录补日程";

describe("DayReplayEntry", () => {
  it("shows no button when the Android bridge is missing", () => {
    render(<DayReplayEntry onCommit={() => undefined} bridge={null} />);
    expect(screen.queryByRole("button", { name: ENTRY_LABEL })).toBeNull();
    expect(screen.queryByRole("button", { name: "补今天" })).toBeNull();
  });

  it("uses a text line trigger, not an outline 补今天 button", () => {
    render(
      <DayReplayEntry
        onCommit={() => undefined}
        bridge={{
          readDay: () =>
            JSON.stringify({
              ok: true,
              queryTime: on26(12, 0),
              events: [],
              calls: [],
            }),
        }}
      />,
    );
    const trigger = screen.getByRole("button", { name: ENTRY_LABEL });
    expect(trigger.className).toContain("now-replay-link");
    expect(screen.queryByRole("button", { name: "补今天" })).toBeNull();
  });

  it("defaults the title to the app name and still keeps the cue label", async () => {
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
    const readDay = (dayOffset: number) => {
      expect(dayOffset).toBe(0);
      return JSON.stringify({
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
    };
    render(
      <DayReplayEntry
        onCommit={onCommit}
        bridge={{ readDay }}
        storage={storage}
      />,
    );
    await user.click(screen.getByRole("button", { name: ENTRY_LABEL }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.closest("body")).toBe(document.body);
    expect(screen.getByRole("heading", { name: "根据手机记录补日程" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "补哪一天" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /今天/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /昨天/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /前天/ })).toBeTruthy();
    expect(screen.getByText("线索 · 微信")).toBeTruthy();
    expect(screen.getByText("手机通话")).toBeTruthy();
    expect(screen.queryByText("com.tencent.mm")).toBeNull();
    expect((screen.getByLabelText("微信的标题") as HTMLInputElement).value).toBe(
      "微信",
    );

    await user.selectOptions(screen.getByLabelText("微信的标签"), "life");
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "记下勾选的" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    const drafts = onCommit.mock.calls[0][0] as Record<string, unknown>[];
    expect(drafts[0]).toMatchObject({
      title: "微信",
      tag: "life",
      recurrence: "once",
      owner: "self",
    });
    expect(JSON.stringify(drafts)).not.toContain("com.tencent.mm");
    expect(JSON.stringify(drafts)).not.toContain("+8613800138000");
  });

  it("reloads through readDay when switching to yesterday", async () => {
    const user = userEvent.setup();
    const offsets: number[] = [];
    const readDay = (dayOffset: number) => {
      offsets.push(dayOffset);
      return JSON.stringify({
        ok: true,
        queryTime: on26(18, 0) - dayOffset * 86_400_000,
        events: [],
        calls: [],
      });
    };
    render(
      <DayReplayEntry onCommit={() => undefined} bridge={{ readDay }} />,
    );
    await user.click(screen.getByRole("button", { name: ENTRY_LABEL }));
    await user.click(screen.getByRole("tab", { name: /昨天/ }));
    expect(offsets).toEqual([0, 1]);
  });
});
