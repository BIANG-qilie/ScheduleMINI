import { expect, test, type Page } from "@playwright/test";
import pkg from "../package.json" with { type: "json" };
import { ANDROID_MIRROR_MANIFEST_URL } from "../src/lib/update/mirror-endpoints";

const FEED = "https://api.github.com/repos/BIANG-qilie/ScheduleMINI/releases/latest";
const MIRROR_APK =
  "https://static-host-e3n8jbll-schedulemini.sealosgzg.site/schedulemini/v9.9.0/ScheduleMINI-9.9.0-universal.apk";

test.beforeEach(async ({ page }) => {
  await page.route(ANDROID_MIRROR_MANIFEST_URL, (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
});

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

  test("镜像清单优先于 GitHub", async ({ page }) => {
    await page.route(ANDROID_MIRROR_MANIFEST_URL, (route) =>
      route.fulfill({
        json: {
          version: "9.9.0",
          apkUrl: MIRROR_APK,
          sha256: "ab".repeat(32),
          notes: "- 走国内镜像",
        },
      }),
    );
    await mockFeed(page, "v1.0.0");
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "发现新版本 v9.9.0" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("走国内镜像")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "发现新版本 v1.0.0" })).toHaveCount(0);
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

async function buttonClearance(page: Page, name: string) {
  const button = page.getByRole("dialog").getByRole("button", { name });
  const box = await button.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) return -1;
  return viewport.height - (box.y + box.height);
}

test.describe("常规手机高度的更新弹窗", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("按钮留在拇指区，并离底边留出空隙", async ({ page }) => {
    await mockFeed(page, "v9.0.0");
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "发现新版本 v9.0.0" });
    await expect(dialog).toBeVisible();
    await expect.poll(async () => buttonClearance(page, "更新")).toBeGreaterThanOrEqual(72);
    const box = await dialog.getByRole("button", { name: "更新" }).boundingBox();
    const height = page.viewportSize()!.height;
    expect(box!.y).toBeGreaterThan(height * 0.35);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height);
  });
});

test.describe("较矮手机上的更新弹窗", () => {
  test.use({ viewport: { width: 390, height: 640 } });

  test("按钮完整留在视口内，不贴底也不被顶出拇指区", async ({ page }) => {
    await mockFeed(page, "v9.0.0");
    await page.goto("/");
    await expect(page.getByRole("dialog", { name: "发现新版本 v9.0.0" })).toBeVisible();
    await expect.poll(async () => buttonClearance(page, "更新")).toBeGreaterThanOrEqual(24);
    await expect.poll(async () => buttonClearance(page, "稍后")).toBeGreaterThanOrEqual(24);
    const box = await page.getByRole("button", { name: "更新" }).boundingBox();
    const height = page.viewportSize()!.height;
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThan(height * 0.35);
  });

  test("长说明撑开后按钮仍完整可点", async ({ page }) => {
    await page.route(FEED, (route) =>
      route.fulfill({
        json: {
          tag_name: "v9.2.0",
          name: "v9.2.0",
          body: Array.from({ length: 12 }, (_, i) => `- 第${i + 1}项更新说明需要完整留在弹窗里`).join(
            "\n",
          ),
          html_url: "https://github.com/BIANG-qilie/ScheduleMINI/releases/tag/v9.2.0",
          published_at: "2026-10-20T00:00:00Z",
          draft: false,
          prerelease: false,
          assets: [],
        },
      }),
    );
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "发现新版本 v9.2.0" });
    await expect(dialog).toBeVisible();
    const expand = dialog.getByRole("button", { name: /查看全部更新说明/ });
    if (await expand.count()) await expand.click();
    await expect.poll(async () => buttonClearance(page, "更新")).toBeGreaterThanOrEqual(24);
    const box = await dialog.getByRole("button", { name: "更新" }).boundingBox();
    const height = page.viewportSize()!.height;
    expect(box!.y + box!.height).toBeLessThanOrEqual(height);
    expect(box!.y).toBeGreaterThanOrEqual(0);
  });
});
