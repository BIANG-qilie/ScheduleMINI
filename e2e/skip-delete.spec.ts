import { expect, test, type Page } from "@playwright/test";

async function addWeekly(page: Page, title: string) {
  const narrow = (page.viewportSize()?.width ?? 1280) < 760;
  if (narrow) {
    await page.getByRole("button", { name: "新建", exact: true }).click();
  }
  await page.getByRole("button", { name: "新建日程", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新建日程" });
  await dialog.getByLabel(/标题/).fill(title);
  await dialog.locator("#start").fill("11:15");
  await dialog.locator("#end").fill("12:00");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("已添加日程")).toBeVisible();
}

async function openWeek(page: Page) {
  const narrow = (page.viewportSize()?.width ?? 1280) < 760;
  if (narrow) {
    await page.getByRole("button", { name: "周", exact: true }).click();
  } else if (
    await page.getByRole("button", { name: "周视图" }).isVisible()
  ) {
    await page.getByRole("button", { name: "周视图" }).click();
  }
}

function storedItem(page: Page, title: string) {
  return page.evaluate((name) => {
    const raw = localStorage.getItem("desktop-schedule-widget:config");
    const cfg = JSON.parse(raw ?? "{}") as {
      items?: { id: string; title: string; skippedDates?: string[] }[];
      deletedItems?: Record<string, string>;
    };
    const item = cfg.items?.find((it) => it.title === name) ?? null;
    const tomb = item ? cfg.deletedItems?.[item.id] : null;
    const tombs = Object.keys(cfg.deletedItems ?? {});
    return { item, tombs, tomb };
  }, title);
}

test.describe("单次取消后删除整段", () => {
  test("周视图菜单可取消一次，再删除整段并留下墓碑", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await page.goto("/");
    await addWeekly(page, "周会甲");
    await openWeek(page);

    const block = page.getByRole("button", { name: /周会甲/ }).first();
    await block.click({ button: "right" });
    await expect(page.getByRole("button", { name: "取消本次" })).toBeVisible();
    await expect(page.getByRole("button", { name: "删除", exact: true })).toBeVisible();
    const before = await page.getByRole("button", { name: /周会甲/ }).count();
    await page.getByRole("button", { name: "取消本次" }).click();
    await expect(page.getByText(/已取消「周会甲」该次/)).toBeVisible();
    await expect
      .poll(() => page.getByRole("button", { name: /周会甲/ }).count())
      .toBeLessThan(before);
    expect(await page.getByRole("button", { name: /周会甲/ }).count()).toBeGreaterThan(0);

    await page.getByRole("button", { name: /周会甲/ }).first().click({ button: "right" });
    await page.getByRole("button", { name: "删除", exact: true }).click();
    await expect(page.getByRole("button", { name: /周会甲/ })).toHaveCount(0);
    await page.getByRole("button", { name: "列表" }).click();
    await expect(page.locator("li").filter({ hasText: "周会甲" })).toHaveCount(0);
    const saved = await storedItem(page, "周会甲");
    expect(saved.item).toBeNull();
    expect(saved.tombs.length).toBeGreaterThan(0);
  });

  test("编辑页在取消一次后仍可删除整段", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await page.goto("/");
    await addWeekly(page, "周会乙");
    await openWeek(page);
    await page.getByRole("button", { name: /周会乙/ }).first().click({ button: "right" });
    await page.getByRole("button", { name: "取消本次" }).click();
    await expect(page.getByText(/已取消「周会乙」该次/)).toBeVisible();

    await page.getByRole("button", { name: /周会乙/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "编辑日程" });
    await expect(dialog.getByRole("button", { name: "取消本次" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "删除", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "删除", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: /周会乙/ })).toHaveCount(0);
    const saved = await storedItem(page, "周会乙");
    expect(saved.item).toBeNull();
    expect(saved.tombs.length).toBeGreaterThan(0);
  });
});

test.describe("手机：单次取消后删除整段", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("长按菜单在取消一次后可以删除整段", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await page.goto("/");
    await addWeekly(page, "周会丙");
    await openWeek(page);
    const block = page.getByRole("button", { name: /周会丙/ }).first();
    await block.click({ button: "right" });
    await expect(page.getByRole("button", { name: "取消本次" })).toBeVisible();
    await expect(page.getByRole("button", { name: "删除", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "取消本次" }).click();
    await expect(page.getByText(/已取消「周会丙」该次/)).toBeVisible();
    // 手机一次只看一天；取消的是当天，整段还在其他工作日
    const series = page.getByRole("button", { name: /周会丙/ });
    if ((await series.count()) === 0) {
      for (const label of ["周一", "周二", "周三", "周四", "周五"]) {
        await page.getByRole("button", { name: new RegExp(label) }).first().click();
        if ((await series.count()) > 0) break;
      }
    }
    await expect(series.first()).toBeVisible();
    await series.first().click({ button: "right" });
    await page.getByRole("button", { name: "删除", exact: true }).click();
    await page.getByRole("button", { name: "列表", exact: true }).click();
    await expect(page.locator("li").filter({ hasText: "周会丙" })).toHaveCount(0);
    const saved = await storedItem(page, "周会丙");
    expect(saved.item).toBeNull();
    expect(saved.tombs.length).toBeGreaterThan(0);
  });
});
