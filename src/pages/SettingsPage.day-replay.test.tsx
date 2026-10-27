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
});
