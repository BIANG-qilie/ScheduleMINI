import { describe, expect, it } from "vitest";
import { on26 } from "@/lib/day-replay.fixtures";
import type { ReplayCue } from "@/lib/day-replay";
import {
  annotateReplayCues,
  readReplayMarks,
  rememberReplayMarks,
  REPLAY_MARKS_KEY,
  windowsBasicallyOverlap,
  type ReplayMark,
} from "@/lib/replay-marks";

const wechat: ReplayCue = {
  kind: "app",
  label: "微信",
  packageName: "com.tencent.mm",
  start: on26(9, 0),
  end: on26(9, 30),
};
const douyin: ReplayCue = {
  kind: "app",
  label: "抖音",
  packageName: "com.ss.android.ugc.aweme",
  start: on26(10, 0),
  end: on26(10, 20),
};

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    store: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    },
  };
}

describe("replay marks", () => {
  it("keeps a local mark only after a successful save", () => {
    const { data, store } = memory();
    rememberReplayMarks([], store);
    expect(data.has(REPLAY_MARKS_KEY)).toBe(false);
    const mark: ReplayMark = {
      itemId: "item-1",
      kind: "app",
      packageName: "com.tencent.mm",
      label: "微信",
      start: wechat.start,
      end: wechat.end,
    };
    rememberReplayMarks([mark], store);
    expect(readReplayMarks(store)).toEqual([mark]);
    expect(data.get(REPLAY_MARKS_KEY)).not.toContain("cueWindow");
  });

  it("puts an already saved cue after unsaved ones and leaves it unchecked by the caller", () => {
    const saved: ReplayMark = {
      itemId: "item-1",
      kind: "app",
      packageName: "com.tencent.mm",
      label: "微信",
      start: wechat.start,
      end: wechat.end,
    };
    const rows = annotateReplayCues({
      cues: [wechat, douyin],
      marks: [saved],
      onceItems: [
        {
          id: "item-1",
          title: "回消息",
          tag: "social",
          recurrence: "once",
          date: "2026-10-26",
          start: "09:00",
          end: "09:30",
          enabled: true,
        },
      ],
      dateKey: "2026-10-26",
    });
    expect(rows.map((row) => row.cue.kind === "app" && row.cue.label)).toEqual([
      "抖音",
      "微信",
    ]);
    expect(rows.map((row) => row.filled)).toEqual([false, true]);
  });

  it("treats the same app on the same day as already filled when the times mostly overlap", () => {
    const rows = annotateReplayCues({
      cues: [wechat, douyin],
      marks: [],
      onceItems: [
        {
          id: "manual",
          title: "微信",
          tag: "social",
          recurrence: "once",
          date: "2026-10-26",
          start: "09:05",
          end: "09:28",
          enabled: true,
        },
      ],
      dateKey: "2026-10-26",
    });
    expect(rows.find((row) => row.cue.kind === "app" && row.cue.label === "微信")?.filled).toBe(
      true,
    );
    expect(rows[0]?.filled).toBe(false);
  });

  it("does not count a deleted mark or a brief touch", () => {
    expect(
      windowsBasicallyOverlap(on26(9, 0), on26(9, 30), on26(9, 25), on26(9, 55)),
    ).toBe(false);
    const rows = annotateReplayCues({
      cues: [wechat],
      marks: [
        {
          itemId: "gone",
          kind: "app",
          packageName: "com.tencent.mm",
          label: "微信",
          start: wechat.start,
          end: wechat.end,
        },
      ],
      onceItems: [],
      dateKey: "2026-10-26",
    });
    expect(rows).toEqual([{ cue: wechat, filled: false }]);
  });

  it("hides a cue fully inside another appointment of a different name", () => {
    const rows = annotateReplayCues({
      cues: [wechat, douyin],
      marks: [],
      onceItems: [
        {
          id: "class",
          title: "语文",
          tag: "work",
          recurrence: "once",
          date: "2026-10-26",
          start: "08:00",
          end: "12:00",
          enabled: true,
        },
      ],
      dateKey: "2026-10-26",
    });
    expect(rows).toEqual([]);
  });
});
