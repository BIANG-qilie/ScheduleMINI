/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DayReplayEntry } from "@/components/DayReplayEntry";
import { CALL_ALLOWLIST_STORAGE_KEY } from "@/lib/call-allowlist";
import { APP_TAG_MEMORY_KEY } from "@/lib/app-tag-memory";
import { on26 } from "@/lib/day-replay.fixtures";

afterEach(() => {
  cleanup();
});

describe("DayReplayEntry", () => {
  it("shows no UI when the Android bridge is missing", () => {
    const { container } = render(
      <DayReplayEntry onCommit={() => undefined} bridge={null} open trigger={null} />,
    );
    expect(container.childNodes).toHaveLength(0);
  });

  it("keeps one short sentence and swipeable cue cards", async () => {
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
    const readDay = () =>
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
          {
            type: 1,
            packageName: "com.android.chrome",
            timestamp: on26(10, 0),
            label: "Chrome",
          },
          {
            type: 2,
            packageName: "com.android.chrome",
            timestamp: on26(10, 40),
            label: "Chrome",
          },
        ],
        calls: [],
      });
    render(
      <DayReplayEntry
        open
        onOpenChange={() => undefined}
        onCommit={onCommit}
        bridge={{ readDay }}
        storage={storage}
        trigger={null}
      />,
    );
    expect(
      screen.getByText("对照手机记录，勾选要留下的时段。"),
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: "今天" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "昨天" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "前天" })).toBeTruthy();
    expect(screen.getByTestId("replay-cue-card")).toBeTruthy();
    expect(screen.getByText("线索 · 微信")).toBeTruthy();
    expect((screen.getByLabelText("微信的标题") as HTMLInputElement).value).toBe(
      "微信",
    );
    expect((screen.getByLabelText("微信的标签") as HTMLSelectElement).value).toBe(
      "other",
    );

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "下一条" }));
    expect(screen.getByText("线索 · Chrome")).toBeTruthy();
    // 滑走后勾选仍在第一张
    await user.click(screen.getByRole("button", { name: "上一条" }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);

    await user.selectOptions(screen.getByLabelText("微信的标签"), "social");
    await user.click(screen.getByRole("button", { name: "记下勾选的" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    const drafts = onCommit.mock.calls[0][0] as Record<string, unknown>[];
    expect(drafts[0]).toMatchObject({
      title: "微信",
      tag: "social",
      recurrence: "once",
      owner: "self",
    });
    expect(JSON.parse(memory.get(APP_TAG_MEMORY_KEY)!)).toEqual({
      "com.tencent.mm": "social",
    });
  });

  it("does not update app-tag memory when commit fails", async () => {
    const user = userEvent.setup();
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    render(
      <DayReplayEntry
        open
        onOpenChange={() => undefined}
        onCommit={async () => {
          throw new Error("write failed");
        }}
        bridge={{
          readDay: () =>
            JSON.stringify({
              ok: true,
              queryTime: on26(12, 0),
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
              calls: [],
            }),
        }}
        storage={storage}
        trigger={null}
      />,
    );
    await user.selectOptions(screen.getByLabelText("微信的标签"), "life");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "记下勾选的" }));
    expect(memory.get(APP_TAG_MEMORY_KEY)).toBeUndefined();
    expect(screen.getByText("没写进去，本机分类没改。")).toBeTruthy();
  });
});
