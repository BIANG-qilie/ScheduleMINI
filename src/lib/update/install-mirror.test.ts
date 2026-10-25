/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { installRelease } from "@/lib/update/install";
import type { ReleaseInfo } from "@/lib/update/release";

const SHA = "cd".repeat(32);

function release(sha256?: string): ReleaseInfo {
  return {
    version: "0.2.7",
    notes: "",
    htmlUrl: "https://github.com/BIANG-qilie/ScheduleMINI/releases/tag/v0.2.7",
    publishedAt: null,
    assets: [
      {
        name: "ScheduleMINI-0.2.7-universal.apk",
        size: 4,
        url: "https://static-host-e3n8jbll-schedulemini.sealosgzg.site/schedulemini/v0.2.7/ScheduleMINI-0.2.7-universal.apk",
        sha256,
      },
    ],
  };
}

describe("安卓安装回退", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.SmInstaller;
  });

  it("镜像校验失败后改下 GitHub 包，并带上同一 sha256", async () => {
    const calls: Array<{ url: string; sha256?: string }> = [];
    window.SmInstaller = {
      canInstall: () => true,
      openInstallSettings: () => {},
      download(url) {
        calls.push({ url });
      },
      downloadChecked(url, _fileName, sha256) {
        calls.push({ url, sha256 });
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            tag_name: "v0.2.7",
            html_url: "https://github.com/BIANG-qilie/ScheduleMINI/releases/tag/v0.2.7",
            assets: [
              {
                name: "ScheduleMINI-0.2.7-universal.apk",
                size: 4,
                browser_download_url:
                  "https://github.com/BIANG-qilie/ScheduleMINI/releases/download/v0.2.7/ScheduleMINI-0.2.7-universal.apk",
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const events: string[] = [];
    await installRelease(release(SHA), (event) => events.push(event.kind));
    expect(calls).toEqual([
      { url: release(SHA).assets[0].url, sha256: SHA },
    ]);
    window.dispatchEvent(new CustomEvent("sm-apk", { detail: { kind: "hash-mismatch" } }));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({
      url: "https://github.com/BIANG-qilie/ScheduleMINI/releases/download/v0.2.7/ScheduleMINI-0.2.7-universal.apk",
      sha256: SHA,
    });
    window.dispatchEvent(new CustomEvent("sm-apk", { detail: { kind: "hash-mismatch" } }));
    await vi.waitFor(() => expect(events).toContain("failed"));
  });

  it("没有 sha256 的 GitHub 包仍走原来的下载，不调用带校验的接口", async () => {
    const calls: string[] = [];
    window.SmInstaller = {
      canInstall: () => true,
      openInstallSettings: () => {},
      download(url) {
        calls.push(url);
      },
      downloadChecked() {
        calls.push("checked");
      },
    };
    const plain = release();
    delete plain.assets[0].sha256;
    await installRelease(plain, () => {});
    expect(calls).toEqual([plain.assets[0].url]);
  });
});
