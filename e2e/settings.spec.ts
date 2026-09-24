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
    await expect(page.getByRole("button", { name: "工作", exact: true })).toBeVisible();
  });
});
