import { existsSync, statSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("手机宽度", () => {
  test("打开是我与对方的此刻，并带共处", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "小日程" })).toBeVisible();
    await expect(page.getByText("此刻", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "我" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "对方" })).toBeVisible();
    await expect(page.getByRole("button", { name: "开启共处" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "周", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "列表", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "设置", exact: true }),
    ).toBeVisible();
  });

  test("新建后列表直接看到备注", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "新建", exact: true }).click();
    await page.getByRole("button", { name: "新建日程", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "新建日程" });
    await dialog.getByLabel(/标题/).fill("手机备注");
    await dialog.getByLabel("备注").fill("带伞");
    await dialog.locator("#start").fill("08:30");
    await dialog.locator("#end").fill("09:00");
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("已添加日程")).toBeVisible();
    await page.getByRole("button", { name: "列表", exact: true }).click();
    const row = page.locator("li").filter({ hasText: "手机备注" });
    await expect(row.getByText("带伞")).toBeVisible();
  });

  test("周视图按天看", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "周", exact: true }).click();
    await expect(page.getByRole("button", { name: "上一周" })).toBeVisible();
    await expect(page.getByRole("button", { name: "下一周" })).toBeVisible();
    await expect(page.getByText("本周")).toBeVisible();
  });

  test("设置仍是我们、显示、数据", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "设置", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "设置" });
    await expect(dialog.getByRole("tab", { name: "我们" })).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "显示" })).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "数据" })).toBeVisible();
    await dialog.getByRole("tab", { name: "我们" }).click();
    await expect(dialog.getByLabel("单人模式")).toBeVisible();
    await dialog.getByRole("tab", { name: "显示" }).click();
    await expect(dialog.getByLabel("开始前提醒")).toBeVisible();
    await expect(dialog.getByLabel("开机自启")).toHaveCount(0);
  });
});

test.describe("手机周视图连续滚动换日", () => {
  test.use({ timezoneId: "Asia/Shanghai" });

  test("从 20 日向下滚过凌晨尾巴后标题变成 21 日", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-20T15:00:00+08:00") });
    await page.goto("/");
    await page.getByRole("button", { name: "周", exact: true }).click();
    const scroller = page.locator("[data-week-scroll]");
    await expect(scroller).toBeVisible();

    const stuckDate = () =>
      page.evaluate(() => {
        const el = document.querySelector("[data-week-scroll]");
        if (!el) return null;
        const edge = el.getBoundingClientRect().top + 1;
        const headers = [
          ...document.querySelectorAll<HTMLElement>("[data-day-header]"),
        ];
        let current: HTMLElement | null = null;
        for (const header of headers) {
          const rect = header.getBoundingClientRect();
          if (rect.top <= edge + 4 && rect.bottom > edge) current = header;
        }
        return current?.dataset.date ?? null;
      });

    await expect.poll(stuckDate).toBe("2026-10-20");

    const scrollBy = (date: string, extra: number) =>
      page.evaluate(
        ({ date, extra }) => {
          const el = document.querySelector("[data-week-scroll]");
          const section = el?.querySelector<HTMLElement>(
            `[data-day="${date}"]`,
          );
          if (!el || !section) return false;
          const delta =
            section.getBoundingClientRect().top - el.getBoundingClientRect().top;
          el.scrollTop += delta + extra;
          return true;
        },
        { date, extra },
      );

    // 日内下滚仍停在 20 日，凌晨下沿（21日 00:00）还在这一天里
    expect(await scrollBy("2026-10-20", 400)).toBe(true);
    await expect.poll(stuckDate).toBe("2026-10-20");
    await expect(
      page.locator('[data-day="2026-10-20"]').getByText("21日", { exact: true }),
    ).toBeAttached();

    // 再往下，越过这一天的尾巴，进入 21 日自己的网格起点
    expect(await scrollBy("2026-10-21", 0)).toBe(true);
    await expect.poll(stuckDate).toBe("2026-10-21");
    await expect(page.locator('[data-day="2026-10-20"]')).toBeAttached();

    const media = "/cursor/stores/self/media";
    if (existsSync(media)) {
      const shot = `${media}/phone-week-scroll-next-day.png`;
      await page.screenshot({ path: shot });
      expect(statSync(shot).size).toBeGreaterThan(1000);
    }
  });
});
