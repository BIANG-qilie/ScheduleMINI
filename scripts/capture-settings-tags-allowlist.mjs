import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MEDIA =
  "/cursor/stores/bc-abdb785a-c263-491d-aa91-85f22622f911/media";
const TAGS_OUT = `${MEDIA}/settings-tag-labels.png`;
const ALLOW_OUT = `${MEDIA}/settings-allowlist-data.png`;
const REPLAY_OUT = `${MEDIA}/settings-replay-no-allowlist-editor.png`;
const PORT = 45442;
const baseURL = `http://127.0.0.1:${PORT}`;

mkdirSync(MEDIA, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

await page.addInitScript(() => {
  const on26 = (h, m) => Date.UTC(2026, 9, 26, h, m) - 8 * 3600_000;
  const payload = {
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
    calls: [],
  };
  window.SmDayReplay = {
    readDay: () => JSON.stringify(payload),
    readToday: () => JSON.stringify(payload),
  };
  localStorage.removeItem("desktop-schedule-widget:call-allowlist");
  localStorage.removeItem("desktop-schedule-widget:tag-label-overrides");
});

await page.goto(baseURL, { waitUntil: "networkidle" });

// 显示 → 日程标签
await page.getByRole("button", { name: "设置" }).click();
await page.getByRole("tab", { name: "显示" }).click();
await page.getByRole("heading", { name: "日程标签" }).waitFor();
await page.getByLabel("娱乐显示名").fill("电竞");
await page.waitForTimeout(200);
await page.screenshot({ path: TAGS_OUT, fullPage: false });
console.log(`wrote ${TAGS_OUT}`);

// 数据 → 本机号码名单
await page.getByRole("tab", { name: "数据" }).click();
await page.getByRole("heading", { name: "本机号码名单" }).waitFor();
await page.getByLabel("名单号码").fill("+8613800138000");
await page.getByRole("button", { name: "加入" }).click();
await page.getByText("+8613800138000").waitFor();
await page.waitForTimeout(200);
await page.screenshot({ path: ALLOW_OUT, fullPage: false });
console.log(`wrote ${ALLOW_OUT}`);

await page.keyboard.press("Escape");
await page.getByRole("dialog", { name: "设置" }).waitFor({ state: "hidden" });

// 清空名单再开补录，确认一句指向设置、无编辑器
await page.evaluate(() => {
  localStorage.setItem(
    "desktop-schedule-widget:call-allowlist",
    JSON.stringify([]),
  );
});
await page.getByRole("button", { name: "新建" }).click();
await page.getByRole("button", { name: "补录日程" }).click();
await page.getByRole("heading", { name: "补录日程" }).waitFor();
await page.getByText("设置 → 数据").waitFor();
const editor = page.getByLabel("名单号码");
if (await editor.count()) {
  throw new Error("allowlist editor still present in replay");
}
await page.waitForTimeout(200);
await page.screenshot({ path: REPLAY_OUT, fullPage: false });
console.log(`wrote ${REPLAY_OUT}`);

await browser.close();
