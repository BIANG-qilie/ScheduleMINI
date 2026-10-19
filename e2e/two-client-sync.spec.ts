import { spawn, type ChildProcess } from "node:child_process";
import { expect, test, type Browser, type Page } from "@playwright/test";

const KEY = "desktop-schedule-widget:config";
const PORT = 47000 + Math.floor(Math.random() * 1000);
const RELAY = `http://127.0.0.1:${PORT}`;
let relay: ChildProcess;

test.beforeAll(async () => {
  relay = spawn(process.execPath, ["sync-relay/server.mjs"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });
  await expect
    .poll(async () => (await fetch(`${RELAY}/health`).catch(() => null))?.ok, { timeout: 30_000 })
    .toBe(true);
});

test.afterAll(() => relay?.kill());

type Seed = { memberId: string; inviteCode: string; titles: string[] };

function config(seed: Seed) {
  const now = new Date().toISOString();
  return {
    version: 1,
    showHolidays: false,
    widgetVisible: false,
    syncRelayUrl: RELAY,
    couple: {
      memberId: seed.memberId,
      selfName: seed.memberId,
      inviteCode: seed.inviteCode,
    },
    items: seed.titles.map((title) => ({
      id: `${seed.memberId}-${title}`,
      start: "09:00",
      end: "10:00",
      title,
      weekdays: [1],
      enabled: true,
      tag: "life",
      owner: "self",
      ownerId: seed.memberId,
      updatedAt: now,
    })),
  };
}

async function open(browser: Browser, seed: Seed) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem(key, value);
        sessionStorage.setItem("seeded", "1");
      }
    },
    [KEY, JSON.stringify(config(seed))],
  );
  const page = await ctx.newPage();
  await page.goto("/");
  return page;
}

async function titles(page: Page) {
  return page.evaluate((key) => {
    const cfg = JSON.parse(localStorage.getItem(key) || "{}");
    return (cfg.items ?? []).map((it: { title: string }) => it.title).sort();
  }, KEY);
}

test("伴侣配对：A 的新建与删除到达 B，B 的新建回到 A", async ({ browser }) => {
  const code = "E2E" + Math.floor(Math.random() * 1e6);
  const a = await open(browser, { memberId: "alice-0001", inviteCode: code, titles: ["A 早餐"] });
  const b = await open(browser, { memberId: "bobby-0002", inviteCode: code, titles: ["B 健身"] });

  await expect.poll(() => titles(b)).toEqual(["A 早餐", "B 健身"]);
  await a.reload();
  await expect.poll(() => titles(a)).toEqual(["A 早餐", "B 健身"]);

  // 离开应用页再改存储，避免运行中的同步把手动修改写回去
  await a.route("**/__blank", (r) => r.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await a.goto("/__blank");
  await a.evaluate(async (key) => {
    const cfg = JSON.parse(localStorage.getItem(key)!);
    const victim = cfg.items.find((it: { title: string }) => it.title === "A 早餐");
    cfg.items = cfg.items.filter((it: { id: string }) => it.id !== victim.id);
    cfg.deletedItems = { [victim.id]: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(cfg));
  }, KEY);
  await a.goto("/");
  await expect.poll(() => titles(a)).toEqual(["B 健身"]);
  await b.reload();
  await expect.poll(() => titles(b)).toEqual(["B 健身"]);
});

test("同一人两台设备：互相看到对方新建", async ({ browser }) => {
  const code = "E2E" + Math.floor(Math.random() * 1e6);
  const pc = await open(browser, { memberId: "same-person-01", inviteCode: code, titles: ["电脑上课"] });
  const phone = await open(browser, { memberId: "same-person-01", inviteCode: code, titles: ["手机带读"] });

  await expect.poll(() => titles(phone)).toEqual(["手机带读", "电脑上课"]);
  await pc.reload();
  await expect.poll(() => titles(pc)).toEqual(["手机带读", "电脑上课"]);
});

test("中继不可达时显示中文失败状态", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cfg = config({ memberId: "offline-0001", inviteCode: "OFFLN1", titles: [] });
  cfg.syncRelayUrl = "http://127.0.0.1:9";
  await ctx.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [KEY, JSON.stringify(cfg)],
  );
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByText(/同步失败：连不上中继/).first()).toBeVisible();
});
