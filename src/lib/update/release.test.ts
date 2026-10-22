import { describe, expect, it } from "vitest";
import { parseRelease, pickApk, summarizeNotes } from "@/lib/update/release";
import pkg from "../../../package.json";
import conf from "../../../src-tauri/tauri.conf.json";
import cargo from "../../../src-tauri/Cargo.toml?raw";

const release = {
  tag_name: "v0.3.0",
  name: "小日程 0.3.0",
  body: "## 新功能\n- **自动检查更新**\n- 修复 `同步` 问题\n\n**Full Changelog**: https://x",
  html_url: "https://github.com/BIANG-qilie/ScheduleMINI/releases/tag/v0.3.0",
  published_at: "2026-10-20T00:00:00Z",
  draft: false,
  prerelease: false,
  assets: [
    { name: "latest.json", size: 900, browser_download_url: "https://g/latest.json" },
    { name: "app-arm64-release.apk", size: 10, browser_download_url: "https://g/arm64.apk" },
    { name: "app-universal-release.apk", size: 30, browser_download_url: "https://g/universal.apk" },
  ],
};

describe("parseRelease", () => {
  it("提取版本、说明与附件", () => {
    const info = parseRelease(release)!;
    expect(info.version).toBe("0.3.0");
    expect(info.htmlUrl).toBe(release.html_url);
    expect(info.assets.map((a) => a.url)).toContain("https://g/universal.apk");
  });

  it("非 semver 标签（调试包）不算新版本", () => {
    expect(parseRelease({ ...release, tag_name: "android-debug-ff4f" })).toBeNull();
  });

  it("四段产品版本算新版本", () => {
    expect(parseRelease({ ...release, tag_name: "v0.2.0.1" })!.version).toBe("0.2.0.1");
  });

  it("缺字段时报错", () => {
    expect(() => parseRelease({ tag_name: "v1.0.0" })).toThrow();
  });
});

describe("pickApk", () => {
  it("优先 universal 包", () => {
    expect(pickApk(parseRelease(release)!.assets)!.url).toBe("https://g/universal.apk");
  });
  it("没有 apk 时为 null", () => {
    expect(pickApk([{ name: "a.msi", size: 1, url: "u" }])).toBeNull();
  });
});

describe("summarizeNotes", () => {
  it("去掉 Markdown 标记与 changelog 链接", () => {
    const notes = summarizeNotes(release.body);
    expect(notes.lines).toEqual(["新功能", "自动检查更新", "修复 同步 问题"]);
    expect(notes.preview).toEqual(notes.lines);
    expect(notes.hidden).toBe(0);
  });
  it("超出行数时只预览，完整列表仍可展开，不再塞入「等 n 项」", () => {
    const notes = summarizeNotes("- a\n- b\n- c", 2);
    expect(notes.preview).toEqual(["a", "b"]);
    expect(notes.hidden).toBe(1);
    expect(notes.lines).toEqual(["a", "b", "c"]);
    expect(notes.lines.some((line) => /^等 /.test(line))).toBe(false);
  });
});

describe("版本单一来源", () => {
  it("tauri.conf 引用 package.json，Cargo.toml 与之一致", () => {
    expect(conf.version).toBe("../package.json");
    expect(cargo).toContain(`version = "${pkg.version}"`);
  });
});
