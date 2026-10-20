/// <reference types="node" />
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultCouple, type CoupleIdentity, type ScheduleItem } from "@/lib/config";
import { syncRoomOnce } from "@/lib/sync/couple";
import { generateInviteCode } from "@/lib/sync/crypto";

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
};

function client(couple: Partial<CoupleIdentity> = {}): Client {
  return { couple: { ...defaultCouple(), ...couple }, items: [], deletedItems: {} };
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
    baseUrl: BASE,
  });
  expect(r.error).toBeUndefined();
  c.couple = r.couple;
  c.items = r.items;
  c.deletedItems = r.deletedItems;
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
});
