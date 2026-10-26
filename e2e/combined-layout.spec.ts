import { expect, test, type Locator, type Page } from "@playwright/test";

const CONFIG_KEY = "desktop-schedule-widget:config";
const BOOT_KEY = "schedulemini:boot-cache";

const SELF = "rgb(15, 118, 110)";
const PARTNER = "rgb(162, 28, 175)";
const SHARED = "rgb(180, 83, 9)";

function stressConfig() {
  const now = "2026-10-26T08:00:00.000Z";
  const member = "member-self";
  const stamp = {
    note: "",
    enabled: true,
    skippedDates: [] as string[],
    ownerId: member,
    updatedAt: now,
  };
  return {
    version: 1,
    showHolidays: true,
    widgetVisible: false,
    widgetMode: "current",
    settingsViewMode: "week",
    autostart: false,
    remindersEnabled: false,
    reminderMinutesBefore: 10,
    widgetOpacity: 0.92,
    gridStartHour: 7,
    gridEndHour: 2,
    dayOverrides: {},
    soloMode: false,
    syncRelayUrl: "",
    deletedItems: {},
    coexistence: { current: null, updatedAt: "", log: [] },
    couple: {
      memberId: member,
      selfName: "阿宁",
      selfColor: "#0f766e",
      partnerName: "阿晚",
      partnerColor: "#a21caf",
      addressForThem: "",
      addressForThemAt: "",
      addressForMe: "",
      addressForMeAt: "",
      inviteCode: null,
      partnerMemberId: null,
      pairedAt: null,
      bindingUpdatedAt: "",
    },
    items: [
      {
        ...stamp,
        id: "morning",
        start: "07:30",
        end: "08:00",
        title: "晨读",
        weekdays: [1],
        recurrence: "weekly",
        tag: "life",
        owner: "self",
      },
      {
        ...stamp,
        id: "once-temp",
        start: "08:00",
        end: "08:40",
        title: "临时",
        weekdays: [],
        recurrence: "once",
        date: "2026-10-12",
        tag: "life",
        owner: "partner",
      },
      {
        ...stamp,
        id: "swap",
        start: "08:50",
        end: "09:30",
        title: "代课",
        weekdays: [],
        recurrence: "once",
        date: "2026-10-12",
        tag: "work",
        workKind: "class",
        workPrimary: "代课",
        isCourseSwap: true,
        owner: "shared",
      },
      {
        ...stamp,
        id: "night",
        start: "22:00",
        end: "06:00",
        title: "值夜",
        weekdays: [1],
        recurrence: "weekly",
        tag: "rest",
        owner: "self",
      },
      {
        ...stamp,
        id: "solo",
        start: "10:00",
        end: "11:00",
        title: "单独",
        weekdays: [],
        recurrence: "once",
        date: "2026-10-13",
        tag: "life",
        owner: "self",
      },
      {
        ...stamp,
        id: "upper",
        start: "10:00",
        end: "11:00",
        title: "上段",
        weekdays: [],
        recurrence: "once",
        date: "2026-10-15",
        tag: "life",
        owner: "self",
      },
      {
        ...stamp,
        id: "lower",
        start: "11:00",
        end: "12:00",
        title: "下段",
        weekdays: [],
        recurrence: "once",
        date: "2026-10-15",
        tag: "life",
        owner: "partner",
      },
      {
        ...stamp,
        id: "long-call",
        start: "22:00",
        end: "10:00",
        title: "长通话",
        weekdays: [],
        recurrence: "once",
        date: "2026-10-15",
        endDate: "2026-10-16",
        durationMinutes: 720,
        tag: "call",
        callChannel: "phone",
        owner: "partner",
      },
      {
        ...stamp,
        id: "span",
        start: "13:40",
        end: "20:00",
        title: "相处",
        weekdays: [],
        recurrence: "once",
        date: "2026-10-16",
        endDate: "2026-10-18",
        durationMinutes: 3260,
        tag: "life",
        owner: "shared",
      },
      ...[
        ["math", "15:00", "16:10", "数学", "self"],
        ["piano", "15:05", "16:00", "钢琴", "partner"],
        ["meet", "15:10", "16:20", "例会", "shared"],
        ["science", "15:20", "16:40", "科学", "self"],
        ["brush", "15:25", "16:15", "书法", "partner"],
        ["qa", "15:30", "16:05", "答疑", "shared"],
      ].map(([id, start, end, title, owner]) => ({
        ...stamp,
        id,
        start,
        end,
        title,
        weekdays: [],
        recurrence: "once",
        date: "2026-10-16",
        tag: "life",
        owner,
      })),
    ],
  };
}

async function installConfig(page: Page, corruptDisk = false) {
  const text = JSON.stringify(stressConfig());
  await page.addInitScript(
    ({ key, boot, raw, corrupt }) => {
      localStorage.setItem(boot, raw);
      localStorage.setItem(key, corrupt ? "{not-json" : raw);
    },
    { key: CONFIG_KEY, boot: BOOT_KEY, raw: text, corrupt: corruptDisk },
  );
}

async function openWeek(page: Page, range: string) {
  if (await page.getByRole("button", { name: "周", exact: true }).count()) {
    await page.getByRole("button", { name: "周", exact: true }).click();
  }
  const label = page.locator("p.font-mono").filter({ hasText: "–" }).first();
  for (let i = 0; i < 8; i++) {
    if ((await label.textContent())?.includes(range)) return;
    await page.getByRole("button", { name: "上一周" }).click();
  }
  throw new Error(`没有翻到 ${range}`);
}

function desktopGrid(page: Page) {
  return page.locator("[data-week-scroll] > div.grid").locator("visible=true");
}

async function desktopColumns(page: Page) {
  const grid = desktopGrid(page);
  const headers = grid.locator("xpath=./button");
  const lanes = grid.locator("xpath=./div[contains(@class,'border-l')]");
  await expect(headers).toHaveCount(7);
  await expect(lanes).toHaveCount(7);
  await expect(headers.nth(0)).toContainText("10/12");
  await expect(headers.nth(4)).toContainText("10/16");
  await expect(headers.nth(6)).toContainText("10/18");
  return { headers, lanes };
}

async function borderStyle(card: Locator) {
  return card.evaluate((el) => getComputedStyle(el).borderTopStyle);
}

async function swatch(root: Locator) {
  return root
    .locator("span.rounded-full")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
}

async function expectTuckedUnderHeader(label: Locator, header: Locator) {
  const headerEl = await header.elementHandle();
  const placed = await label.evaluate((el, head) => {
    if (!(head instanceof HTMLElement)) return null;
    const text = (el.textContent ?? "").replace(/\s+/g, "");
    const section = el.closest<HTMLElement>("[data-day]");
    const scroller = el.closest<HTMLElement>("[data-week-scroll]");
    if (section && scroller && section.contains(head)) {
      const scrollerRect = scroller.getBoundingClientRect();
      const sectionTop =
        section.getBoundingClientRect().top - scrollerRect.top + scroller.scrollTop;
      scroller.scrollTop = Math.max(0, sectionTop);
    }
    const labelRect = el.getBoundingClientRect();
    const headerRect = head.getBoundingClientRect();
    return {
      gap: labelRect.top - headerRect.bottom,
      sameColumn:
        labelRect.left + labelRect.width / 2 > headerRect.left &&
        labelRect.left + labelRect.width / 2 < headerRect.right,
      text,
    };
  }, headerEl);
  expect(placed, "续标应排在次日日期下面").not.toBeNull();
  expect(placed!.text).toContain("续");
  expect(placed!.gap).toBeGreaterThanOrEqual(-2);
  expect(placed!.gap).toBeLessThan(80);
  expect(placed!.sameColumn).toBe(true);
}

test.describe("合并后的周历", () => {
  test.use({ viewport: { width: 1000, height: 900 } });

  test("窄列、标尺、虚线、端点相接和 +N", async ({ page }) => {
    await installConfig(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "小日程" })).toBeVisible();
    await expect(page.getByText("阿宁", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("阿晚", { exact: true }).first()).toBeVisible();
    await openWeek(page, "10/12 – 10/18");
    const { headers, lanes } = await desktopColumns(page);
    const mon = lanes.nth(0);
    const tue = lanes.nth(1);
    const wed = lanes.nth(2);
    const thu = lanes.nth(3);
    const fri = lanes.nth(4);
    const sat = lanes.nth(5);
    const sun = lanes.nth(6);

    await expect(wed.locator("[data-block]")).toHaveCount(0);
    await expect(tue.locator('[data-block="card"]')).toHaveCount(1);
    await expect(tue.locator("[data-block='band'], [data-block='pill']")).toHaveCount(0);
    await expect(tue.getByText("单独", { exact: true })).toBeVisible();

    const upper = thu.locator('[data-block="card"]', { hasText: "上段" });
    const lower = thu.locator('[data-block="card"]', { hasText: "下段" });
    await expect(upper).toBeVisible();
    await expect(lower).toBeVisible();
    const upperBox = await upper.boundingBox();
    const lowerBox = await lower.boundingBox();
    expect(upperBox && lowerBox).toBeTruthy();
    expect(Math.abs(upperBox!.x - lowerBox!.x)).toBeLessThan(8);
    expect(lowerBox!.y).toBeGreaterThanOrEqual(upperBox!.y + upperBox!.height - 2);
    expect(lowerBox!.y).toBeLessThanOrEqual(upperBox!.y + upperBox!.height + 6);
    expect(await swatch(upper)).toBe(SELF);
    expect(await swatch(lower)).toBe(PARTNER);

    const read = mon.locator('[data-block="card"]', { hasText: "晨读" });
    const temp = mon.locator('[data-block="card"]', { hasText: "临时" });
    const swap = mon.locator('[data-block="card"]', { hasText: "代课" });
    expect(await borderStyle(read)).toBe("solid");
    expect(await borderStyle(temp)).toBe("dashed");
    expect(await borderStyle(swap)).toBe("dashed");
    expect(await swatch(read)).toBe(SELF);
    expect(await swatch(temp)).toBe(PARTNER);
    expect(await swatch(swap)).toBe(SHARED);

    await expect(mon.locator('[data-item-id="night"]')).toHaveCount(2);
    await expect(tue.locator('[data-item-id="night"]')).toHaveCount(0);
    const nightCarry = mon.locator('[data-block="band-label"]', { hasText: "续" });
    await expect(nightCarry).toContainText("值夜");
    const nightBox = await nightCarry.boundingBox();
    const monHeader = await headers.nth(0).boundingBox();
    expect(nightBox && monHeader).toBeTruthy();
    expect(nightBox!.y).toBeGreaterThan(monHeader!.y + monHeader!.height + 400);

    await expect(thu.locator('[data-block="band"][data-item-id="long-call"]')).toHaveCount(1);
    await expect(thu.locator('[data-block="card"][data-item-id="long-call"]')).toHaveCount(0);
    await expectTuckedUnderHeader(
      fri.locator('[data-block="band-label"]', { hasText: "长通话" }),
      headers.nth(4),
    );
    await expect(fri.locator('[data-block="band-label"]', { hasText: "长通话" })).toContainText("续");

    for (const lane of [fri, sat, sun]) {
      await expect(lane.locator('[data-block="band"][data-item-id="span"]')).toHaveCount(1);
      await expect(lane.locator('[data-block="card"][data-item-id="span"]')).toHaveCount(0);
    }
    await expect(thu.locator('[data-item-id="span"]')).toHaveCount(0);
    await expect(wed.locator('[data-item-id="span"]')).toHaveCount(0);
    await expect(await swatch(sat.locator('[data-block="band-label"]', { hasText: "相处" }))).toBe(SHARED);
    await expectTuckedUnderHeader(
      sat.locator('[data-block="band-label"]', { hasText: "相处" }),
      headers.nth(5),
    );
    await expectTuckedUnderHeader(
      sun.locator('[data-block="band-label"]', { hasText: "相处" }),
      headers.nth(6),
    );
    await expect(fri.locator('[data-block="band-label"]', { hasText: "相处" })).toContainText("13:40");
    await expect(fri.locator('[data-block="band-label"]', { hasText: "相处" })).not.toContainText("续");

    const pill = fri.locator('[data-block="pill"]');
    await expect(pill).toHaveCount(1);
    await pill.scrollIntoViewIfNeeded();
    const pillBox = await pill.boundingBox();
    expect(pillBox).not.toBeNull();
    expect(Math.round(pillBox!.width)).toBe(18);
    expect(Math.round(pillBox!.height)).toBe(18);
    await expect(pill).toHaveText(/^\+\d+$/);
    await pill.click();
    const menu = page.locator(".overlap-menu");
    await expect(menu.getByText(/这个时段还有 \d+ 项/)).toBeVisible();
    const entry = menu.getByRole("button").first();
    const name = (await entry.locator("span.truncate").innerText()).trim();
    expect(name.length).toBeGreaterThan(0);
    await page.locator("p.font-mono").filter({ hasText: "10/12 – 10/18" }).click();
    await expect(menu).toHaveCount(0);
    await pill.click();
    await menu.getByRole("button", { name: new RegExp(name) }).click();
    const dialog = page.getByRole("dialog", { name: "编辑日程" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#title")).toHaveValue(name);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(pill).toBeVisible();

    await page.getByRole("button", { name: "下一周" }).click();
    await expect(page.locator("p.font-mono").filter({ hasText: "10/19 – 10/25" })).toBeVisible();
    const next = desktopGrid(page).locator("xpath=./div[contains(@class,'border-l')]");
    await expect(next.nth(0).locator('[data-item-id="span"]')).toHaveCount(0);
  });

  test("磁盘读坏时仍画出带标尺的周历，刷新不丢", async ({ page }) => {
    await installConfig(page, true);
    await page.goto("/");
    await expect(page.getByText("先显示上次打开时的内容")).toBeVisible();
    await openWeek(page, "10/12 – 10/18");
    const { lanes } = await desktopColumns(page);
    await expect(lanes.nth(4).locator('[data-block="band"][data-item-id="span"]')).toHaveCount(1);
    await expect(lanes.nth(4).locator('[data-block="pill"]')).toHaveCount(1);
    await expect(lanes.nth(5).locator('[data-block="band-label"]', { hasText: "续" })).toContainText("相处");
    await page.reload();
    await expect(page.getByText("先显示上次打开时的内容")).toBeVisible();
    await openWeek(page, "10/12 – 10/18");
    const again = (await desktopColumns(page)).lanes;
    await expect(again.nth(4).locator('[data-block="pill"]')).toHaveCount(1);
    await expect(again.nth(5).locator('[data-block="band-label"]', { hasText: "续" })).toContainText("相处");
    await expect(again.nth(1).locator('[data-item-id="night"]')).toHaveCount(0);
  });
});

test.describe("手机宽", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("日列里的 +N、续标和归属色", async ({ page }) => {
    await installConfig(page);
    await page.goto("/");
    await openWeek(page, "10/12 – 10/18");

    const day = (key: string) => page.locator(`[data-day="${key}"]`);
    const wed = day("2026-10-14");
    const tue = day("2026-10-13");
    const mon = day("2026-10-12");
    const fri = day("2026-10-16");
    const sat = day("2026-10-17");
    const sun = day("2026-10-18");

    await expect(wed.locator("[data-block]")).toHaveCount(0);
    await expect(tue.locator('[data-block="card"]')).toHaveCount(1);
    await expect(tue.getByText("单独", { exact: true })).toBeVisible();
    await expect(mon.locator('[data-item-id="night"]')).not.toHaveCount(0);
    await expect(tue.locator('[data-item-id="night"]')).toHaveCount(0);

    expect(await borderStyle(mon.locator('[data-block="card"]', { hasText: "晨读" }))).toBe("solid");
    expect(await borderStyle(mon.locator('[data-block="card"]', { hasText: "临时" }))).toBe("dashed");
    expect(await borderStyle(mon.locator('[data-block="card"]', { hasText: "代课" }))).toBe("dashed");
    expect(await swatch(mon.locator('[data-block="card"]', { hasText: "晨读" }))).toBe(SELF);
    expect(await swatch(mon.locator('[data-block="card"]', { hasText: "临时" }))).toBe(PARTNER);
    expect(await swatch(mon.locator('[data-block="card"]', { hasText: "代课" }))).toBe(SHARED);

    for (const section of [fri, sat, sun]) {
      await expect(section.locator('[data-block="band"][data-item-id="span"]')).toHaveCount(1);
    }
    await expect(day("2026-10-15").locator('[data-item-id="span"]')).toHaveCount(0);
    await expectTuckedUnderHeader(
      sat.locator('[data-block="band-label"]', { hasText: "相处" }),
      sat.locator("[data-day-header]"),
    );
    await expect(sat.locator('[data-block="band-label"]', { hasText: "相处" })).toContainText("续");
    await expectTuckedUnderHeader(
      fri.locator('[data-block="band-label"]', { hasText: "长通话" }),
      fri.locator("[data-day-header]"),
    );

    const pill = fri.locator('[data-block="pill"]');
    await expect(pill).toHaveCount(1);
    await pill.scrollIntoViewIfNeeded();
    const pillBox = await pill.boundingBox();
    expect(Math.round(pillBox!.width)).toBe(18);
    expect(Math.round(pillBox!.height)).toBe(18);
    await pill.click();
    const menu = page.locator(".overlap-menu");
    await expect(menu.getByText(/这个时段还有 \d+ 项/)).toBeVisible();
    const entry = menu.getByRole("button").first();
    const name = (await entry.locator("span.truncate").innerText()).trim();
    await entry.click();
    const dialog = page.getByRole("dialog", { name: "编辑日程" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#title")).toHaveValue(name);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});
