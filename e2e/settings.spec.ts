import { expect, test } from "@playwright/test";

test.describe("小日程设置页", () => {
  test("显示品牌与日程区", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "小日程" })).toBeVisible();
    await expect(page.getByRole("button", { name: "周视图" })).toBeVisible();
    await expect(page.getByRole("button", { name: "新建日程" })).toBeVisible();
  });

  test("打开新建对话框", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "新建日程" }).click();
    await expect(page.getByRole("heading", { name: "新建日程" })).toBeVisible();
    await expect(page.getByText("开始（24 小时）")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "工作", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "交通", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "学习", exact: true }),
    ).toBeVisible();
  });

  test("同点起止被拒绝", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "新建日程" }).click();
    await page.getByLabel(/标题/).fill("同点测试");
    await page.locator("#start").fill("10:00");
    await page.locator("#end").fill("10:00");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("结束时间不能与开始时间相同")).toBeVisible();
  });

  test("跨日日程可保存", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "新建日程" }).click();
    await page.getByLabel(/标题/).fill("值夜跨日");
    await page.locator("#start").fill("22:00");
    await page.locator("#end").fill("06:00");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("已添加日程")).toBeVisible();
    await page.getByRole("button", { name: "列表" }).click();
    await expect(page.getByText("值夜跨日")).toBeVisible();
  });
});

test.describe("坏配置", () => {
  test("非法 localStorage 显示错误与空日程", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "desktop-schedule-widget:config",
        "{not-json",
      );
    });
    await page.goto("/");
    await expect(page.getByText(/配置加载失败/)).toBeVisible();
    await expect(page.getByText(/配置不是合法 JSON/)).toBeVisible();
    await expect(page.getByText("共 0 条")).toBeVisible();
  });
});

test.describe("悬浮窗页", () => {
  test("widget 视图可打开", async ({ page }) => {
    await page.goto("/?view=widget");
    await expect(page.getByText("FREE")).toBeVisible({ timeout: 10_000 });
  });
});
