import { expect, test } from "@playwright/test";

test.describe("称呼在设置里", () => {
  test("设置 → 我们改称呼后，周视图换成这个称呼，悬浮窗没有输入框", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "设置", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      const key = "desktop-schedule-widget:config";
      const config = JSON.parse(localStorage.getItem(key) ?? "{}");
      config.couple.addressForMe = "阿宁";
      config.couple.addressForMeAt = "2026-10-21T00:00:00.000Z";
      localStorage.setItem(key, JSON.stringify(config));
    });
    await page.reload();
    await expect(
      page.locator("header").getByText("对方", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "设置", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "设置" });
    await dialog.getByRole("tab", { name: "我们" }).click();
    await expect(dialog.getByText("称你 阿宁")).toBeVisible();
    const field = dialog.getByLabel("称呼");
    await field.fill("一二三四五六七八九");
    await expect(field).toHaveValue("一二三四五六七八");
    await field.fill("宝宝");
    await expect(
      page.locator("header").getByText("宝宝", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("header").getByText("对方", { exact: true }),
    ).toHaveCount(0);

    const shot = process.env.SCREENSHOT_PATH;
    if (shot) await dialog.screenshot({ path: shot });

    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(dialog).toBeHidden();

    await page.goto("/?view=widget");
    await expect(page.getByText("宝宝", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByLabel("称呼")).toHaveCount(0);
  });
});

test.describe("手机此刻", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("此刻显示称呼，没有称呼输入框", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "对方" })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);

    await page.getByRole("button", { name: "设置", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "设置" });
    await dialog.getByRole("tab", { name: "我们" }).click();
    await dialog.getByLabel("称呼").fill("宝宝");
    await expect(page.getByRole("heading", { name: "宝宝" })).toBeVisible();
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "宝宝" })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });
});
