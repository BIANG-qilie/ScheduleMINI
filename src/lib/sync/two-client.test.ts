/// <reference types="node" />
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  coexistenceElapsedMs,
  coexistenceIsPaused,
  defaultConfig,
  defaultCouple,
  pairBanner,
  partnerFacingName,
  widgetCoupleTitle,
  type CoupleIdentity,
  type ScheduleItem,
} from "@/lib/config";
import { useConfigStore } from "@/store/config-store";
import {
  publishRoomRedirect,
  syncRoomOnce,
  type SyncedCoexistence,
} from "@/lib/sync/couple";
import {
  decryptPayload,
  encryptPayload,
  generateInviteCode,
} from "@/lib/sync/crypto";
import {
  decideAfterRoomWait,
  fetchRoom,
  LEGACY_COUPLE_SYNC_POLL_MS,
  pushMemberSlice,
  waitForRoomChange,
} from "@/lib/sync/relay";

const PORT = 18000 + Math.floor(Math.random() * 2000);
const BASE = `http://127.0.0.1:${PORT}`;
let relay: ChildProcess;

beforeAll(async () => {
  relay = spawn(process.execPath, ["sync-relay/server.mjs"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("relay did not start");
});

afterAll(() => {
  relay?.kill();
});

type Client = {
  couple: CoupleIdentity;
  items: ScheduleItem[];
  deletedItems: Record<string, string>;
  coexistence: SyncedCoexistence | null;
};

function client(couple: Partial<CoupleIdentity> = {}): Client {
  return {
    couple: { ...defaultCouple(), ...couple },
    items: [],
    deletedItems: {},
    coexistence: null,
  };
}

let tick = Date.parse("2026-10-19T08:00:00.000Z");
function stamp() {
  tick += 1000;
  return new Date(tick).toISOString();
}

function add(c: Client, id: string, title: string) {
  c.items = [
    ...c.items.filter((it) => it.id !== id),
    {
      id,
      start: "09:00",
      end: "10:00",
      title,
      weekdays: [1],
      enabled: true,
      recurrence: "weekly",
      tag: "life",
      skippedDates: [],
      owner: "self",
      ownerId: c.couple.memberId,
      updatedAt: stamp(),
    },
  ];
}

function remove(c: Client, id: string) {
  c.items = c.items.filter((it) => it.id !== id);
  c.deletedItems = { ...c.deletedItems, [id]: stamp() };
}

async function sync(c: Client) {
  const r = await syncRoomOnce({
    inviteCode: c.couple.inviteCode!,
    couple: c.couple,
    items: c.items,
    deletedItems: c.deletedItems,
    coexistence: c.coexistence,
    baseUrl: BASE,
    latest: () => ({
      items: c.items,
      deletedItems: c.deletedItems,
      couple: c.couple,
      coexistence: c.coexistence,
    }),
  });
  expect(r.error).toBeUndefined();
  c.couple = r.couple;
  c.items = r.items;
  c.deletedItems = r.deletedItems;
  c.coexistence = r.coexistence;
  return r;
}

const titles = (c: Client) => c.items.map((it) => it.title).sort();

describe("two clients against a local relay", () => {
  it("partner pairing: edits and deletes flow both ways", async () => {
    const code = generateInviteCode(6);
    const a = client({ inviteCode: code });
    const b = client({ inviteCode: code });

    add(a, "a1", "A 早餐");
    await sync(a);
    const rb = await sync(b);
    expect(rb.partnerOnline).toBe(true);
    expect(titles(b)).toEqual(["A 早餐"]);
    expect(b.items[0].owner).toBe("partner");

    add(b, "b1", "B 健身");
    await sync(b);
    await sync(a);
    expect(titles(a)).toEqual(["A 早餐", "B 健身"]);

    remove(a, "a1");
    await sync(a);
    await sync(b);
    await sync(a);
    expect(titles(b)).toEqual(["B 健身"]);
    expect(titles(a)).toEqual(["B 健身"]);
  });

  it("same user on two devices: edits and deletes converge", async () => {
    const code = generateInviteCode(6);
    const pc = client({ inviteCode: code });
    add(pc, "x1", "上课");
    add(pc, "x2", "带读");
    await sync(pc);

    const phone = client({ inviteCode: code, memberId: pc.couple.memberId });
    const r = await sync(phone);
    expect(r.selfSliceMerged).toBe(true);
    expect(titles(phone)).toEqual(["上课", "带读"]);
    expect(phone.items.every((it) => it.owner === "self")).toBe(true);

    remove(phone, "x1");
    add(phone, "x3", "手机新建");
    await sync(phone);
    await sync(pc);
    expect(titles(pc)).toEqual(["带读", "手机新建"]);

    await sync(phone);
    expect(titles(phone)).toEqual(["带读", "手机新建"]);
  });

  it("delete after skip-once tombstones the series on both devices", async () => {
    const code = generateInviteCode(6);
    const desk = client({ inviteCode: code });
    add(desk, "w1", "周会");
    await sync(desk);

    const phone = client({ inviteCode: code, memberId: desk.couple.memberId });
    await sync(phone);
    expect(titles(phone)).toEqual(["周会"]);

    desk.items = desk.items.map((it) =>
      it.id === "w1"
        ? { ...it, skippedDates: ["2026-10-20"], updatedAt: stamp() }
        : it,
    );
    await sync(desk);
    await sync(phone);
    expect(phone.items.find((it) => it.id === "w1")?.skippedDates).toEqual([
      "2026-10-20",
    ]);

    remove(desk, "w1");
    await sync(desk);
    await sync(phone);
    await sync(desk);
    expect(titles(desk)).toEqual([]);
    expect(titles(phone)).toEqual([]);
    expect(desk.deletedItems.w1).toBeTruthy();
    expect(phone.deletedItems.w1).toBeTruthy();
  });

  it("称呼同步后，对方用这个标签显示你，你也能看见自己被怎么叫", async () => {
    const code = generateInviteCode(6);
    const a = client({ inviteCode: code, selfName: "甲" });
    const b = client({ inviteCode: code, selfName: "乙" });

    a.couple.addressForThem = "宝宝";
    a.couple.addressForThemAt = stamp();
    await sync(a);
    await sync(b);

    expect(b.couple.addressForMe).toBe("宝宝");
    const aPhone = client({
      inviteCode: code,
      memberId: a.couple.memberId,
      selfName: "甲",
    });
    await sync(aPhone);
    expect(aPhone.couple.addressForThem).toBe("宝宝");
    expect(partnerFacingName(aPhone.couple)).toBe("宝宝");

    b.couple.addressForThem = "乖乖";
    b.couple.addressForThemAt = stamp();
    await sync(b);
    await sync(a);
    expect(partnerFacingName(b.couple)).toBe("乖乖");
    expect(a.couple.addressForMe).toBe("乖乖");
    expect(partnerFacingName(a.couple)).toBe("宝宝");
  });

  it("共处开始、暂停、不记入结束会同步到另一台", async () => {
    const code = generateInviteCode(6);
    const a = client({ inviteCode: code });
    const b = client({ inviteCode: code });
    const startedAt = "2026-10-20T01:00:00.000Z";
    a.coexistence = {
      current: { id: "together", startedAt, pauses: [] },
      updatedAt: startedAt,
    };
    await sync(a);
    await sync(b);

    expect(b.coexistence?.current?.startedAt).toBe(startedAt);
    expect(b.coexistence?.current?.id).toBe("together");
    expect(coexistenceIsPaused(b.coexistence?.current)).toBe(false);
    const now = new Date("2026-10-20T01:05:00.000Z");
    expect(coexistenceElapsedMs(b.coexistence!.current!, now)).toBe(
      coexistenceElapsedMs(a.coexistence!.current!, now),
    );
    expect(b.items.some((it) => it.title.includes("共处"))).toBe(false);

    const pausedAt = "2026-10-20T01:04:00.000Z";
    a.coexistence = {
      current: {
        id: "together",
        startedAt,
        pauses: [{ pausedAt }],
      },
      updatedAt: pausedAt,
    };
    await sync(a);
    await sync(b);
    expect(coexistenceIsPaused(b.coexistence?.current)).toBe(true);
    expect(b.coexistence?.current?.pauses).toEqual([{ pausedAt }]);

    a.coexistence = {
      current: null,
      updatedAt: "2026-10-20T01:06:00.000Z",
    };
    await sync(a);
    await sync(b);
    expect(b.coexistence?.current).toBeNull();
    expect(a.items.some((it) => it.title.includes("共处"))).toBe(false);
    expect(b.items.some((it) => it.title.includes("共处"))).toBe(false);
  });

  it("A 新建后唤醒 B 的长轮询，B 同步即可见", async () => {
    const code = generateInviteCode(6);
    const a = client({ inviteCode: code, selfName: "甲" });
    const b = client({ inviteCode: code, selfName: "乙" });
    await sync(a);
    await sync(b);
    const before = await fetchRoom(code, BASE);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const sinceRev = before.data.rev ?? 0;

    const wake = waitForRoomChange({
      inviteCode: code,
      sinceRev,
      timeoutMs: LEGACY_COUPLE_SYNC_POLL_MS,
      baseUrl: BASE,
    });

    add(a, "live", "即时事项");
    await sync(a);

    const result = await wake;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.room.rev).toBeGreaterThan(sinceRev);

    await sync(b);
    expect(titles(b)).toEqual(["即时事项"]);
    expect(b.items[0].owner).toBe("partner");

    const settled = await fetchRoom(code, BASE);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    await sync(a);
    await sync(b);
    const again = await fetchRoom(code, BASE);
    expect(again.ok && again.data.rev).toBe(settled.data.rev);
  });

  it("同一身份的另一台设备也被长轮询唤醒", async () => {
    const code = generateInviteCode(6);
    const pc = client({ inviteCode: code });
    add(pc, "x1", "上课");
    await sync(pc);
    const phone = client({ inviteCode: code, memberId: pc.couple.memberId });
    await sync(phone);
    const before = await fetchRoom(code, BASE);
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    const wake = waitForRoomChange({
      inviteCode: code,
      sinceRev: before.data.rev ?? 0,
      timeoutMs: LEGACY_COUPLE_SYNC_POLL_MS,
      baseUrl: BASE,
    });
    add(pc, "x2", "带读");
    await sync(pc);
    const result = await wake;
    expect(result.ok && result.changed).toBe(true);
    await sync(phone);
    expect(titles(phone)).toEqual(["上课", "带读"]);
  });

  it("内容未变的再推送不唤醒等待方", async () => {
    const code = generateInviteCode(6);
    const a = client({ inviteCode: code });
    add(a, "a1", "早餐");
    await sync(a);
    const before = await fetchRoom(code, BASE);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const sinceRev = before.data.rev ?? 0;

    const wake = waitForRoomChange({
      inviteCode: code,
      sinceRev,
      timeoutMs: 400,
      baseUrl: BASE,
    });
    await sync(a);
    const result = await wake;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(false);
    expect(result.room.rev).toBe(sinceRev);
  });

  it("不带 docRev 的旧客户端推送仍能写入并唤醒", async () => {
    const code = generateInviteCode(6);
    const b = client({ inviteCode: code, selfName: "乙" });
    await sync(b);
    const before = await fetchRoom(code, BASE);
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    const wake = waitForRoomChange({
      inviteCode: code,
      sinceRev: before.data.rev ?? 0,
      timeoutMs: LEGACY_COUPLE_SYNC_POLL_MS,
      baseUrl: BASE,
    });
    const payload = await encryptPayload(code, {
      items: [
        {
          id: "old1",
          start: "09:00",
          end: "10:00",
          title: "旧端事项",
          weekdays: [1],
          enabled: true,
          recurrence: "weekly",
          tag: "life",
          skippedDates: [],
          owner: "self",
          updatedAt: stamp(),
        },
      ],
      selfName: "旧端",
      selfColor: "#a21caf",
      doc: "shared-v2",
      deletedItems: {},
    });
    const put = await fetch(
      `${BASE}/v1/rooms/${code}/members/${encodeURIComponent("legacy-person")}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "旧端",
          color: "#a21caf",
          payload,
          updatedAt: stamp(),
        }),
      },
    );
    expect(put.ok).toBe(true);
    const result = await wake;
    expect(result.ok && result.changed).toBe(true);
    await sync(b);
    expect(titles(b)).toEqual(["旧端事项"]);
  });

  it("B 的第二台在绑定前就已经在同步，A 加入后也显示已配对", async () => {
    const code = generateInviteCode(6);
    const ba = client({ inviteCode: code, selfName: "B" });
    add(ba, "b1", "B 的课");
    await sync(ba);
    const bb = client({
      inviteCode: code,
      memberId: ba.couple.memberId,
      selfName: "B",
    });
    await sync(bb);
    expect(pairBanner(bb.couple)).toBeNull();
    expect(widgetCoupleTitle(bb.couple)).toBe("今日安排");

    const a = client({ inviteCode: code, selfName: "A" });
    a.couple.addressForThem = "小B";
    a.couple.addressForThemAt = stamp();
    add(a, "a1", "A 的事");
    await sync(a);
    ba.couple.addressForThem = "小A";
    ba.couple.addressForThemAt = stamp();
    await sync(ba);
    await sync(bb);

    expect(bb.couple.partnerMemberId).toBe(a.couple.memberId);
    expect(bb.couple.partnerName).toBe("A");
    expect(pairBanner(bb.couple)).toBe("已与「小A」配对");
    expect(widgetCoupleTitle(bb.couple)).toBe("B · 小A");
    expect(bb.couple.addressForMe).toBe("小B");
    expect(titles(bb)).toContain("A 的事");

    const room = await fetchRoom(code, BASE);
    expect(room.ok).toBe(true);
    if (!room.ok) return;
    expect(room.data.members).toHaveLength(2);
    const slot = room.data.members.find((m) => m.memberId === ba.couple.memberId);
    const slice = await decryptPayload<{
      binding?: { partnerMemberId: string | null; partnerName: string };
    }>(code, slot!.payload);
    expect(slice.binding?.partnerMemberId).toBe(a.couple.memberId);
    expect(slice.binding?.partnerName).toBe("A");
  });

  it("正在拉取的第二台，会在这次同步结束时看到中途加入的 A", async () => {
    const code = generateInviteCode(6);
    const ba = client({ inviteCode: code, selfName: "B" });
    await sync(ba);
    const bb = client({
      inviteCode: code,
      memberId: ba.couple.memberId,
      selfName: "B",
    });
    await sync(bb);
    const a = client({ inviteCode: code, selfName: "A" });

    const result = await syncRoomOnce({
      inviteCode: code,
      couple: bb.couple,
      items: bb.items,
      deletedItems: bb.deletedItems,
      coexistence: bb.coexistence,
      baseUrl: BASE,
      latest: () => ({
        items: bb.items,
        deletedItems: bb.deletedItems,
        couple: bb.couple,
        coexistence: bb.coexistence,
      }),
      afterPull: async () => {
        await sync(a);
        await sync(ba);
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.couple.partnerMemberId).toBe(a.couple.memberId);
    expect(result.couple.partnerName).toBe("A");
    expect(pairBanner(result.couple)).toBe("已与「A」配对");
    expect(widgetCoupleTitle(result.couple)).toBe("B · A");
    const room = await fetchRoom(code, BASE);
    expect(room.ok && room.data.members).toHaveLength(2);
  });

  it("B-a 改去 A 的房间后，已经在同步的 B-b 跟着显示已和 A 配对", async () => {
    const roomB = generateInviteCode(6);
    const roomA = generateInviteCode(6);
    const ba = client({ inviteCode: roomB, selfName: "B" });
    add(ba, "b1", "B 的课");
    await sync(ba);
    const bb = client({
      inviteCode: roomB,
      memberId: ba.couple.memberId,
      selfName: "B",
    });
    await sync(bb);

    const a = client({ inviteCode: roomA, selfName: "A" });
    a.couple.addressForThem = "小B";
    a.couple.addressForThemAt = stamp();
    await sync(a);

    const moved = await syncRoomOnce({
      inviteCode: roomB,
      couple: bb.couple,
      items: bb.items,
      deletedItems: bb.deletedItems,
      coexistence: bb.coexistence,
      baseUrl: BASE,
      latest: () => ({
        items: bb.items,
        deletedItems: bb.deletedItems,
        couple: bb.couple,
        coexistence: bb.coexistence,
      }),
      afterPull: async () => {
        await publishRoomRedirect({
          fromCode: roomB,
          toCode: roomA,
          couple: { ...ba.couple, partnerMemberId: null, pairedAt: null },
          items: ba.items,
          deletedItems: ba.deletedItems,
          coexistence: ba.coexistence,
          baseUrl: BASE,
        });
        ba.couple.inviteCode = roomA;
        ba.couple.partnerMemberId = null;
        ba.couple.pairedAt = null;
        await sync(ba);
        await sync(a);
        await sync(ba);
      },
    });

    expect(moved.error).toBeUndefined();
    expect(moved.couple.inviteCode).toBe(roomA);
    expect(moved.couple.partnerMemberId).toBe(a.couple.memberId);
    expect(moved.couple.partnerName).toBe("A");
    expect(pairBanner(moved.couple)).toBe("已与「A」配对");
    expect(moved.couple.addressForMe).toBe("小B");
    const room = await fetchRoom(roomA, BASE);
    expect(room.ok).toBe(true);
    if (!room.ok) return;
    expect(room.data.members).toHaveLength(2);
    expect(room.data.members.map((m) => m.memberId).sort()).toEqual(
      [a.couple.memberId, ba.couple.memberId].sort(),
    );

    const stale = await pushWithoutRedirect(roomB, ba);
    expect(stale.redirect).toBe(roomA);
  });

  it("设置页这一端加入 A 的房间后，另一台设备的配置变成已配对", async () => {
    const mem = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, String(v)),
        removeItem: (k: string) => void mem.delete(k),
        clear: () => mem.clear(),
        key: (i: number) => [...mem.keys()][i] ?? null,
        get length() {
          return mem.size;
        },
      },
    });

    const roomA = generateInviteCode(6);
    const a = client({ inviteCode: roomA, selfName: "A" });
    await sync(a);

    const ba = defaultConfig();
    ba.items = [];
    ba.syncRelayUrl = BASE;
    ba.couple = { ...ba.couple, selfName: "B", inviteCode: null };
    useConfigStore.setState({
      config: ba,
      hydrated: true,
      loading: false,
      syncStatus: null,
    });
    const roomB = await useConfigStore.getState().createInvite();
    const bb = client({
      inviteCode: roomB,
      memberId: useConfigStore.getState().config.couple.memberId,
      selfName: "B",
    });
    await sync(bb);
    expect(pairBanner(bb.couple)).toBeNull();

    await useConfigStore.getState().joinWithCode(roomA);
    await sync(bb);

    const mine = useConfigStore.getState().config.couple;
    expect(mine.inviteCode).toBe(roomA);
    expect(pairBanner(mine)).toBe("已与「A」配对");
    expect(bb.couple.inviteCode).toBe(roomA);
    expect(bb.couple.partnerMemberId).toBe(a.couple.memberId);
    expect(pairBanner(bb.couple)).toBe("已与「A」配对");
    expect(widgetCoupleTitle(bb.couple)).toBe("B · A");
    const room = await fetchRoom(roomA, BASE);
    expect(room.ok && room.data.members).toHaveLength(2);
  });
});

async function pushWithoutRedirect(code: string, who: Client) {
  const payload = await encryptPayload(code, {
    items: who.items,
    selfName: who.couple.selfName,
    selfColor: who.couple.selfColor,
    doc: "shared-v2",
    deletedItems: who.deletedItems,
  });
  const pushed = await pushMemberSlice({
    inviteCode: code,
    memberId: who.couple.memberId,
    name: who.couple.selfName,
    color: who.couple.selfColor,
    payload,
    updatedAt: new Date().toISOString(),
    baseUrl: BASE,
  });
  expect(pushed.ok).toBe(true);
  const room = await fetchRoom(code, BASE);
  expect(room.ok).toBe(true);
  if (!room.ok) throw new Error(room.error);
  const slot = room.data.members.find((m) => m.memberId === who.couple.memberId);
  return { redirect: slot?.redirect ?? null };
}

describe("room wait fallback", () => {
  it("断线走短间隔，房间变更立刻再同步", () => {
    expect(LEGACY_COUPLE_SYNC_POLL_MS).toBe(20_000);
    expect(decideAfterRoomWait({ ok: false, error: "连不上中继" })).toEqual({
      sync: true,
      delayMs: 2_000,
    });
    expect(decideAfterRoomWait({ ok: true, changed: true })).toEqual({
      sync: true,
      delayMs: 0,
    });
    expect(decideAfterRoomWait({ ok: true, changed: false })).toEqual({
      sync: false,
      delayMs: 0,
    });
  });
});
