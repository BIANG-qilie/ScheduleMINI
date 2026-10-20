import { beforeAll, describe, expect, it } from "vitest";
import { emptyConfig, parseAppConfig, type ScheduleTag } from "@/lib/config";
import { ensureHolidayData } from "@/lib/holidays";
import { TAG_BAR, TAG_SURFACE } from "@/lib/schedule-style";
import {
  WIDGET_SNAPSHOT_FILE,
  buildWidgetSnapshot,
  renderHomeWidget,
  type WidgetSnapshot,
} from "@/lib/widget-snapshot";

beforeAll(async () => {
  await ensureHolidayData();
});

function item(partial: Record<string, unknown>) {
  return {
    id: "item",
    start: "09:00",
    end: "10:00",
    title: "事项",
    weekdays: [1],
    enabled: true,
    recurrence: "weekly",
    tag: "life",
    owner: "self",
    skippedDates: [],
    ...partial,
  };
}

function config(
  items: Record<string, unknown>[],
  dayOverrides: Record<string, "off" | "work"> = {},
) {
  const base = emptyConfig();
  return parseAppConfig({
    ...base,
    dayOverrides,
    couple: {
      ...base.couple,
      selfName: "我",
      partnerName: "对方",
      selfColor: "#0f766e",
      partnerColor: "#a21caf",
    },
    items,
  });
}

describe("tag bar colors", () => {
  it("matches the paper tag stripe", () => {
    for (const tag of Object.keys(TAG_BAR) as ScheduleTag[]) {
      expect(TAG_SURFACE[tag].bar.toLowerCase()).toContain(TAG_BAR[tag].slice(1));
    }
  });
});

describe("home widget text", () => {
  it("names the snapshot file next to the app config", () => {
    expect(WIDGET_SNAPSHOT_FILE).toBe("widget-snapshot.json");
  });

  it("自己：进行中的标题、时间和标签", async () => {
    const now = new Date(2026, 8, 21, 9, 30, 0);
    const snapshot = await buildWidgetSnapshot(
      config([
        item({
          id: "read",
          title: "晨读",
          tag: "study",
          weekdays: [1],
        }),
      ]),
      now,
    );
    const view = renderHomeWidget(snapshot, "self", now);
    expect(view.empty).toBe(false);
    expect(view.kicker).toBe("自己");
    expect(view.lanes).toHaveLength(1);
    expect(view.lanes[0]).toMatchObject({
      name: "我",
      ownerColor: "#0f766e",
      headline: "晨读",
      time: "09:00–10:00",
      tag: "学习",
      tagColor: TAG_BAR.study,
      next: "",
    });
  });

  it("自己空闲时写出今日下一程", async () => {
    const now = new Date(2026, 8, 21, 8, 0, 0);
    const snapshot = await buildWidgetSnapshot(
      config([item({ title: "晨读", tag: "study", weekdays: [1] })]),
      now,
    );
    const view = renderHomeWidget(snapshot, "self", now);
    expect(view.lanes[0].headline).toBe("空闲");
    expect(view.lanes[0].time).toBe("");
    expect(view.lanes[0].tag).toBe("");
    expect(view.lanes[0].next).toBe("下一程 晨读 09:00–10:00");
  });

  it("今天没有下一程时只写空闲", async () => {
    const now = new Date(2026, 8, 21, 11, 0, 0);
    const snapshot = await buildWidgetSnapshot(
      config([item({ title: "晨读", tag: "study", weekdays: [1] })]),
      now,
    );
    const view = renderHomeWidget(snapshot, "self", now);
    expect(view.lanes[0].headline).toBe("空闲");
    expect(view.lanes[0].next).toBe("");
  });

  it("对方只看对方，双方各一条", async () => {
    const now = new Date(2026, 8, 21, 9, 30, 0);
    const snapshot = await buildWidgetSnapshot(
      config([
        item({ id: "me", title: "晨读", tag: "study", owner: "self" }),
        item({
          id: "them",
          title: "例会",
          tag: "work",
          owner: "partner",
          start: "09:00",
          end: "11:00",
        }),
      ]),
      now,
    );
    const partner = renderHomeWidget(snapshot, "partner", now);
    expect(partner.kicker).toBe("对方");
    expect(partner.lanes).toHaveLength(1);
    expect(partner.lanes[0]).toMatchObject({
      name: "对方",
      ownerColor: "#a21caf",
      headline: "例会",
      time: "09:00–11:00",
      tag: "工作",
      tagColor: TAG_BAR.work,
    });

    const both = renderHomeWidget(snapshot, "both", now);
    expect(both.kicker).toBe("双方");
    expect(both.lanes.map((lane) => lane.headline)).toEqual(["晨读", "例会"]);
    expect(both.lanes.map((lane) => lane.ownerColor)).toEqual([
      "#0f766e",
      "#a21caf",
    ]);
  });

  it("共同日程出现在双方两条", async () => {
    const now = new Date(2026, 8, 21, 20, 15, 0);
    const snapshot = await buildWidgetSnapshot(
      config([
        item({
          id: "call",
          title: "晚安电话",
          tag: "call",
          owner: "shared",
          start: "20:00",
          end: "20:40",
        }),
      ]),
      now,
    );
    const both = renderHomeWidget(snapshot, "both", now);
    expect(both.lanes.map((lane) => lane.headline)).toEqual([
      "晚安电话",
      "晚安电话",
    ]);
    expect(both.lanes[0].tag).toBe("通话");
  });

  it("过夜日程在次日凌晨仍是当前", async () => {
    const now = new Date(2026, 8, 22, 3, 0, 0);
    const snapshot = await buildWidgetSnapshot(
      config([
        item({
          id: "night",
          title: "值夜",
          tag: "work",
          start: "22:00",
          end: "06:00",
          weekdays: [1],
        }),
      ]),
      now,
    );
    const view = renderHomeWidget(snapshot, "self", now);
    expect(view.lanes[0]).toMatchObject({
      headline: "值夜",
      time: "22:00–06:00",
      tag: "工作",
      next: "",
    });
  });

  it("工作过夜跨进假日时，假日凌晨不再算当前", async () => {
    const evening = new Date(2026, 8, 24, 23, 0, 0);
    const morning = new Date(2026, 8, 25, 3, 0, 0);
    const snapshot = await buildWidgetSnapshot(
      config([
        item({
          id: "night",
          title: "值夜",
          tag: "work",
          start: "22:00",
          end: "06:00",
          weekdays: [4],
        }),
        item({
          id: "life-night",
          title: "夜读",
          tag: "life",
          start: "22:00",
          end: "06:00",
          weekdays: [4],
          owner: "partner",
        }),
      ]),
      evening,
    );
    expect(renderHomeWidget(snapshot, "self", evening).lanes[0].headline).toBe(
      "值夜",
    );
    expect(renderHomeWidget(snapshot, "self", morning).lanes[0].headline).toBe(
      "空闲",
    );
    expect(
      renderHomeWidget(snapshot, "partner", morning).lanes[0].headline,
    ).toBe("夜读");
  });

  it("过夜开始前，今天的下一程是它", async () => {
    const now = new Date(2026, 8, 21, 21, 0, 0);
    const snapshot = await buildWidgetSnapshot(
      config([
        item({
          title: "值夜",
          tag: "work",
          start: "22:00",
          end: "06:00",
          weekdays: [1],
        }),
      ]),
      now,
    );
    const view = renderHomeWidget(snapshot, "self", now);
    expect(view.lanes[0].headline).toBe("空闲");
    expect(view.lanes[0].next).toBe("下一程 值夜 22:00–06:00");
  });

  it("法定假日跳过工作周循环，生活仍在", async () => {
    const now = new Date(2026, 8, 25, 9, 30, 0);
    const snapshot = await buildWidgetSnapshot(
      config([
        item({
          id: "work",
          title: "科学",
          tag: "work",
          weekdays: [5],
        }),
        item({
          id: "life",
          title: "买菜",
          tag: "life",
          weekdays: [5],
        }),
      ]),
      now,
    );
    const view = renderHomeWidget(snapshot, "self", now);
    expect(view.lanes[0].headline).toBe("买菜");
    expect(view.lanes[0].tag).toBe("生活");
  });

  it("标成上班的假日显示工作周循环", async () => {
    const now = new Date(2026, 9, 2, 13, 30, 0);
    const snapshot = await buildWidgetSnapshot(
      config(
        [
          item({
            title: "调休应出现",
            tag: "work",
            weekdays: [5],
            start: "13:00",
            end: "14:00",
          }),
        ],
        { "2026-10-02": "work" },
      ),
      now,
    );
    const view = renderHomeWidget(snapshot, "self", now);
    expect(view.lanes[0].headline).toBe("调休应出现");
    expect(view.lanes[0].time).toBe("13:00–14:00");
  });

  it("取消一次后该日为空闲", async () => {
    const now = new Date(2026, 8, 21, 9, 30, 0);
    const snapshot = await buildWidgetSnapshot(
      config([
        item({
          title: "站会",
          tag: "work",
          weekdays: [1],
          skippedDates: ["2026-09-21"],
        }),
      ]),
      now,
    );
    const view = renderHomeWidget(snapshot, "self", now);
    expect(view.lanes[0].headline).toBe("空闲");
    expect(view.lanes[0].next).toBe("");
  });

  it("activeFrom 之前、activeUntil 之后都不出现", async () => {
    const before = new Date(2026, 8, 21, 9, 30, 0);
    const early = await buildWidgetSnapshot(
      config([
        item({
          title: "新课",
          tag: "study",
          weekdays: [1],
          activeFrom: "2026-09-28",
        }),
      ]),
      before,
    );
    expect(renderHomeWidget(early, "self", before).lanes[0].headline).toBe(
      "空闲",
    );

    const after = new Date(2026, 8, 21, 9, 30, 0);
    const late = await buildWidgetSnapshot(
      config([
        item({
          title: "旧课",
          tag: "study",
          weekdays: [1],
          activeUntil: "2026-09-14",
        }),
      ]),
      after,
    );
    expect(renderHomeWidget(late, "self", after).lanes[0].headline).toBe(
      "空闲",
    );
  });

  it("称呼代替对方，自己这一侧用对方给的称呼", async () => {
    const base = emptyConfig();
    const cfg = parseAppConfig({
      ...base,
      couple: {
        ...base.couple,
        selfName: "我",
        partnerName: "对方",
        addressForThem: "宝宝",
        addressForThemAt: "2026-10-20T01:00:00.000Z",
        addressForMe: "乖乖",
        addressForMeAt: "2026-10-20T01:00:00.000Z",
      },
      items: [],
    });
    const now = new Date(2026, 8, 21, 9, 0, 0);
    const snap = await buildWidgetSnapshot(cfg, now);
    expect(snap.partnerName).toBe("宝宝");
    expect(snap.selfName).toBe("乖乖");
    const both = renderHomeWidget(snap, "both", now);
    expect(both.lanes.map((lane) => lane.name)).toEqual(["乖乖", "宝宝"]);
    expect(renderHomeWidget(snap, "partner", now).lanes[0].name).toBe("宝宝");
    expect(renderHomeWidget(snap, "self", now).lanes[0].name).toBe("乖乖");
  });

  it("没设称呼时仍用原来的名字", async () => {
    const now = new Date(2026, 8, 21, 9, 0, 0);
    const snap = await buildWidgetSnapshot(config([]), now);
    expect(snap.selfName).toBe("我");
    expect(snap.partnerName).toBe("对方");
  });

  it("没有快照时是空状态", () => {
    const view = renderHomeWidget(null, "both", new Date(2026, 8, 21, 9, 0, 0));
    expect(view.empty).toBe(true);
    expect(view.emptyMessage).toBe("打开小日程，日程会出现在这里");
    expect(view.lanes).toEqual([]);
  });

  it("快照过期时提示打开应用更新", () => {
    const snapshot: WidgetSnapshot = {
      version: 1,
      untilMs: new Date(2026, 8, 1, 12, 0, 0).getTime(),
      selfName: "我",
      partnerName: "对方",
      selfColor: "#0f766e",
      partnerColor: "#a21caf",
      self: [],
      partner: [],
    };
    const view = renderHomeWidget(
      snapshot,
      "both",
      new Date(2026, 8, 21, 9, 0, 0),
    );
    expect(view.empty).toBe(true);
    expect(view.emptyMessage).toBe("打开小日程更新");
  });
});
