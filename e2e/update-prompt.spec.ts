import { expect, test, type Page } from "@playwright/test";
import pkg from "../package.json" with { type: "json" };

const FEED = "https://api.github.com/repos/BIANG-qilie/ScheduleMINI/releases/latest";

function mockFeed(page: Page, tag: string) {
  return page.route(FEED, (route) =>
    route.fulfill({
      json: {
        tag_name: tag,
        name: tag,
        body: "- 自动检查更新\n- 修复同步",
        html_url: `https://github.com/BIANG-qilie/ScheduleMINI/releases/tag/${tag}`,
        published_at: "2026-10-20T00:00:00Z",
        draft: false,
        prerelease: false,
        assets: [],
      },
    }),
  );
}

test.describe("检查更新", () => {
  test("启动时发现新版本并可跳过", async ({ page }) => {
    await mockFeed(page, "v9.0.0");
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "发现新版本 v9.0.0" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`当前 v${pkg.version}`)).toBeVisible();
    await expect(dialog.getByText("自动检查更新")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "更新" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "稍后" })).toBeVisible();

    await dialog.getByRole("button", { name: "跳过此版本" }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { name: "小日程" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "发现新版本 v9.0.0" })).toBeHidden();
  });

  test("长更新说明可以在弹窗里展开看完", async ({ page }) => {
    await page.route(FEED, (route) =>
      route.fulfill({
        json: {
          tag_name: "v9.1.0",
          name: "v9.1.0",
          body: [
            "- 第一项",
            "- 第二项",
            "- 第三项",
            "- 第四项",
            "- 第五项完整说明",
            "- 第六项也不该丢",
          ].join("\n"),
          html_url: "https://github.com/BIANG-qilie/ScheduleMINI/releases/tag/v9.1.0",
          published_at: "2026-10-20T00:00:00Z",
          draft: false,
          prerelease: false,
          assets: [],
        },
      }),
    );
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "发现新版本 v9.1.0" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("第一项")).toBeVisible();
    await expect(dialog.getByText("第四项")).toBeVisible();
    await expect(dialog.getByText("第五项完整说明")).toHaveCount(0);
    await expect(dialog.getByText(/等 \d+ 项/)).toHaveCount(0);

    await dialog.getByRole("button", { name: "查看全部更新说明（还有 2 项）" }).click();
    await expect(dialog.getByText("第五项完整说明")).toBeVisible();
    await expect(dialog.getByText("第六项也不该丢")).toBeVisible();

    await dialog.getByRole("button", { name: "收起" }).click();
    await expect(dialog.getByText("第五项完整说明")).toHaveCount(0);
    await expect(dialog.getByText("第一项")).toBeVisible();
  });

  test("更新按钮在网页端打开发布页", async ({ page, context }) => {
    await mockFeed(page, "v9.0.0");
    await page.goto("/");
    const popup = context.waitForEvent("page");
    await page.getByRole("button", { name: "更新" }).click();
    expect((await popup).url()).toContain("/releases/tag/v9.0.0");
  });

  test("设置 → 数据里手动检查，已是最新", async ({ page }) => {
    await mockFeed(page, `v${pkg.version}`);
    await page.goto("/");
    await page.getByRole("button", { name: "设置" }).first().click();
    await page.getByRole("tab", { name: "数据" }).click();
    await expect(page.getByText(`小日程 v${pkg.version}`)).toBeVisible();
    await page.getByRole("button", { name: "检查更新" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已是最新版本" })).toBeVisible();
  });
});
