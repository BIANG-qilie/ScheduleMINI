import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT =
  "/cursor/stores/bc-abdb785a-c263-491d-aa91-85f22622f911/media/replay-drawer-cards.png";
const PORT = 45441;
const baseURL = `http://127.0.0.1:${PORT}`;

mkdirSync(dirname(OUT), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

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
      {
        type: 1,
        packageName: "com.android.chrome",
        timestamp: on26(10, 0),
        label: "Chrome",
      },
      {
        type: 2,
        packageName: "com.android.chrome",
        timestamp: on26(10, 45),
        label: "Chrome",
      },
    ],
    calls: [],
  };
  window.SmDayReplay = {
    readDay: () => JSON.stringify(payload),
    readToday: () => JSON.stringify(payload),
  };
});

await page.goto(baseURL, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "新建" }).click();
await page.getByRole("button", { name: "补录日程" }).click();
await page.getByRole("heading", { name: "补录日程" }).waitFor();
await page.getByText("对照手机记录，勾选要留下的时段。").waitFor();
await page.getByTestId("replay-cue-card").waitFor();
await page.getByRole("checkbox").check();
await page.getByRole("button", { name: "下一条" }).click();
await page.getByText("线索 · Chrome").waitFor();
await page.getByRole("button", { name: "上一条" }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: OUT, fullPage: false });
await browser.close();
console.log(`wrote ${OUT}`);
