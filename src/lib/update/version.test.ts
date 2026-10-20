import { describe, expect, it } from "vitest";
import { APP_VERSION, compareVersions, isNewer, parseVersion } from "@/lib/update/version";
import pkg from "../../../package.json";

describe("compareVersions", () => {
  it.each([
    ["0.2.0", "0.1.9", 1],
    ["v1.0.0", "1.0.0", 0],
    ["1.10.0", "1.9.3", 1],
    ["1.0.0-beta.2", "1.0.0-beta.10", -1],
    ["1.0.0-beta", "1.0.0", -1],
    ["1.0.0-alpha.1", "1.0.0-alpha.beta", -1],
    ["2.0.0+build.5", "2.0.0", 0],
    ["0.2.0.1", "0.2.0", 1],
    ["0.2.0", "0.2.0.0", 0],
    ["0.2.0.1", "0.2.0.2", -1],
    ["0.2.1", "0.2.0.9", 1],
    ["v0.2.0.1", "0.2.0.1", 0],
  ])("%s vs %s → %i", (a, b, want) => {
    expect(compareVersions(a, b)).toBe(want);
  });

  it("拒绝非 semver", () => {
    expect(parseVersion("android-debug-ff4f")).toBeNull();
    expect(() => compareVersions("latest", "1.0.0")).toThrow("无效版本号：latest");
  });

  it("isNewer 只在严格更大时为真", () => {
    expect(isNewer("0.2.1", "0.2.0")).toBe(true);
    expect(isNewer("0.2.0", "0.2.0")).toBe(false);
    expect(isNewer("0.2.0.1", "0.2.0")).toBe(true);
    expect(isNewer("0.2.0", "0.2.0.1")).toBe(false);
  });

  it("APP_VERSION 来自 package.json", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});
