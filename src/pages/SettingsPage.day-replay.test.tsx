import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("SettingsPage main section", () => {
  it("does not put DayReplayEntry or an outline 补今天 in the main bar", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/pages/SettingsPage.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/import\s+\{\s*DayReplayEntry/);
    expect(source).not.toContain("<DayReplayEntry");
    expect(source).not.toMatch(/>\s*补今天\s*</);
  });
});
