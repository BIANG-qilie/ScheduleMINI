import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SettingsPage main section", () => {
  it("keeps DayReplayEntry out of the phone dock and greeting bar", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("CreateActionSheet");
    expect(source).toContain("<DayReplayEntry");
    expect(source).not.toMatch(/phone-dock[\s\S]{0,800}DayReplayEntry/);
    expect(source).not.toMatch(/>\s*补今天\s*</);
    expect(source).not.toMatch(/phone-create[\s\S]{0,200}openCreate/);
    expect(source).toMatch(/phone-create[\s\S]{0,200}setCreateSheetOpen\(true\)/);
  });

  it("shows 已补录 only inside the replay dialog", () => {
    const settings = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
    const week = readFileSync(
      new URL("../components/WeekGrid.tsx", import.meta.url),
      "utf8",
    );
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    const replay = readFileSync(
      new URL("../components/DayReplayEntry.tsx", import.meta.url),
      "utf8",
    );
    expect(settings).not.toContain("已补录");
    expect(week).not.toContain("已补录");
    expect(css).not.toContain("phone-list-replay");
    expect(css).not.toContain("phone-replay-badge");
    expect(replay).toContain("已补录");
  });
});
