import { expect, test } from "@playwright/test";

test.describe("共处模式", () => {
  test("开→暂停→继续→结束写入共同日程", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "开启共处" }).click();
    await expect(page.getByText(/共处中/)).toBeVisible();
    await page.getByRole("button", { name: "暂停" }).click();
    await expect(page.getByText(/共处中 · 暂停/)).toBeVisible();
    await page.getByRole("button", { name: "继续" }).click();
    await expect(page.getByText(/共处中/)).toBeVisible();
    await expect(page.getByRole("button", { name: "暂停" })).toBeVisible();
    await page.getByRole("button", { name: "结束" }).click();
    await page.getByRole("button", { name: "记入并结束" }).click();
    await expect(page.getByRole("button", { name: "开启共处" })).toBeVisible();
    await page.getByRole("button", { name: "列表" }).click();
    await expect(page.getByText(/共处/).first()).toBeVisible();
    await expect(page.getByText("共同").first()).toBeVisible();
  });

  test("结束取消不新增", async ({ page }) => {
    await page.goto("/");
    const countText = await page.getByText(/共 \d+ 条/).textContent();
    await page.getByRole("button", { name: "开启共处" }).click();
    await page.getByRole("button", { name: "结束" }).click();
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await expect(page.getByText(/共处中/)).toBeVisible();
    await expect(page.getByRole("button", { name: "开启共处" })).toHaveCount(0);
    await expect(page.getByText(/共 \d+ 条/)).toHaveText(countText ?? "");
    await page.getByRole("button", { name: "结束" }).click();
    await page.getByRole("button", { name: "只结束" }).click();
    await expect(page.getByRole("button", { name: "开启共处" })).toBeVisible();
    await expect(page.getByText(/共 \d+ 条/)).toHaveText(countText ?? "");
  });
});

test.describe("批量操作", () => {
  test("列表多选批量改归属为共同", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "新建日程" }).click();
    await page.getByLabel(/标题/).fill("批量甲");
    await page.locator("#start").fill("09:00");
    await page.locator("#end").fill("10:00");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("已添加日程")).toBeVisible();

    await page.getByRole("button", { name: "新建日程" }).click();
    await page.getByLabel(/标题/).fill("批量乙");
    await page.locator("#start").fill("11:00");
    await page.locator("#end").fill("12:00");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("已添加日程")).toBeVisible();

    await page.getByRole("button", { name: "列表" }).click();
    await page
      .locator("li")
      .filter({ hasText: "批量甲" })
      .locator('input[type="checkbox"]')
      .check();
    await page
      .locator("li")
      .filter({ hasText: "批量乙" })
      .locator('input[type="checkbox"]')
      .check();
    await expect(page.getByText(/已选 2/)).toBeVisible();
    await page
      .locator("select")
      .filter({ has: page.locator('option[value="shared"]') })
      .selectOption("shared");
    await expect(
      page.locator("li").filter({ hasText: "批量甲" }).getByText("共同"),
    ).toBeVisible();
    await expect(
      page.locator("li").filter({ hasText: "批量乙" }).getByText("共同"),
    ).toBeVisible();
  });

  test("周视图 Shift+多选出现批量栏", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "周视图" }).click();
    const blocks = page.locator('button[data-block="card"]');
    await expect(blocks.first()).toBeVisible({ timeout: 10_000 });
    const count = await blocks.count();
    test.skip(count < 2, "需要至少两条可见周块");
    await blocks.nth(0).click({ modifiers: ["Shift"] });
    await blocks.nth(1).click({ modifiers: ["Shift"] });
    await expect(page.getByText(/已选/)).toBeVisible();
  });
});

test.describe("Dialog 可访问名", () => {
  test("设置遮罩与关闭按钮命名区分", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "设置" }).click();
    await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();
    await expect(page.getByRole("button", { name: "关闭设置" })).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }),
    ).toBeVisible();
  });
});

test.describe("导入失败", () => {
  test("非法 JSON 在页内显示红色错误", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "设置" }).click();
    await page.getByRole("tab", { name: "数据" }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "导入 JSON" }).click(),
    ]);
    await chooser.setFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{not-json", "utf8"),
    });
    await expect(page.getByRole("alert")).toContainText(/导入失败/);
  });
});
