import { describe, expect, it, vi } from "vitest";
import {
  buildAndroidManifest,
  contentTypeFor,
  MIRROR_OBJECT_PREFIX as scriptPrefix,
  rewriteLatestUrls,
} from "../../../scripts/mirror-manifests.mjs";
import {
  ANDROID_MIRROR_MANIFEST_URL,
  DESKTOP_MIRROR_LATEST_URL,
  GITHUB_LATEST_JSON_URL,
  MIRROR_FETCH_TIMEOUT_MS,
  MIRROR_OBJECT_PREFIX,
  MIRROR_PUBLIC_BASE,
  parseAndroidMirror,
} from "@/lib/update/mirror";
import { fetchGithubLatestRelease, fetchLatestRelease } from "@/lib/update/release";
import conf from "../../../src-tauri/tauri.conf.json";

const PUBLIC_BASE = "https://static-host-e3n8jbll-schedulemini.sealosgzg.site";
const SHA = "ab".repeat(32);
const SIGNATURE = "dW50cnVzdGVkIGNvbW1lbnQ6 minisign https://github.com/BIANG-qilie/ScheduleMINI/releases/download/v0.2.6/ignore-me";

const latest = {
  version: "0.2.6",
  notes: "说明",
  pub_date: "2026-10-25T14:07:02.940Z",
  platforms: {
    "windows-x86_64": {
      signature: SIGNATURE,
      url: "https://github.com/BIANG-qilie/ScheduleMINI/releases/download/v0.2.6/ScheduleMINI-0.2.6-x64-setup.exe",
    },
    "darwin-aarch64": {
      signature: SIGNATURE,
      url: "https://github.com/BIANG-qilie/ScheduleMINI/releases/download/v0.2.6/ScheduleMINI-0.2.6-universal.app.tar.gz",
    },
  },
};

const githubRelease = {
  tag_name: "v0.2.7",
  body: "github",
  html_url: "https://github.com/BIANG-qilie/ScheduleMINI/releases/tag/v0.2.7",
  assets: [
    {
      name: "ScheduleMINI-0.2.7-universal.apk",
      size: 10,
      browser_download_url: "https://github.com/BIANG-qilie/ScheduleMINI/releases/download/v0.2.7/ScheduleMINI-0.2.7-universal.apk",
    },
  ],
};

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    version: "0.2.7",
    apkUrl: `${PUBLIC_BASE}/schedulemini/v0.2.7/ScheduleMINI-0.2.7-universal.apk`,
    sha256: SHA,
    notes: "- 镜像",
    ...overrides,
  };
}

describe("镜像清单", () => {
  it("目录前缀与脚本一致，桌面端点先镜像后 GitHub，公钥不变", () => {
    expect(scriptPrefix).toBe(MIRROR_OBJECT_PREFIX);
    expect(MIRROR_PUBLIC_BASE).toBe(PUBLIC_BASE);
    expect(MIRROR_FETCH_TIMEOUT_MS).toBe(5000);
    expect(conf.plugins.updater.pubkey).toBe(
      "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDQ5QzRDNUNEQkYwMjFGREYKUldUZkh3Sy96Y1hFU1FCTnFySnUzTkNlMElTTjh2WUY3WG5sUDlkUVZmOFFSRXltazNYd015UU8K",
    );
    expect(conf.plugins.updater.endpoints).toEqual([
      DESKTOP_MIRROR_LATEST_URL,
      GITHUB_LATEST_JSON_URL,
    ]);
  });

  it("只改下载地址，signature 和说明原样保留", () => {
    const rewritten = rewriteLatestUrls(latest, `${PUBLIC_BASE}/`, "v0.2.6");
    expect(rewritten.platforms["windows-x86_64"].url).toBe(
      `${PUBLIC_BASE}/schedulemini/v0.2.6/ScheduleMINI-0.2.6-x64-setup.exe`,
    );
    expect(rewritten.platforms["darwin-aarch64"].url).toBe(
      `${PUBLIC_BASE}/schedulemini/v0.2.6/ScheduleMINI-0.2.6-universal.app.tar.gz`,
    );
    expect(rewritten.platforms["windows-x86_64"].signature).toBe(SIGNATURE);
    expect(rewritten.platforms["darwin-aarch64"].signature).toBe(SIGNATURE);
    expect(rewritten.notes).toBe("说明");
    expect(latest.platforms["windows-x86_64"].url).toContain("github.com");
  });

  it("生成的安卓清单能被客户端接受，坏 sha 或外站地址则拒绝", () => {
    const built = buildAndroidManifest({
      publicBase: PUBLIC_BASE,
      version: "v0.2.7",
      apkName: "ScheduleMINI-0.2.7-universal.apk",
      sha256: SHA.toUpperCase(),
      notes: "- 镜像",
    });
    const parsed = parseAndroidMirror(built)!;
    expect(parsed.version).toBe("0.2.7");
    expect(parsed.assets[0]).toMatchObject({ url: built.apkUrl, sha256: SHA });
    expect(parsed.assets[0].url.startsWith(ANDROID_MIRROR_MANIFEST_URL)).toBe(false);
    expect(parseAndroidMirror(manifest({ sha256: "abc" }))).toBeNull();
    expect(parseAndroidMirror(manifest({ sha256: "" }))).toBeNull();
    expect(
      parseAndroidMirror(manifest({ apkUrl: "https://evil.example/schedulemini/a.apk" })),
    ).toBeNull();
    expect(parseAndroidMirror(manifest({ apkUrl: `${PUBLIC_BASE}/other/a.apk` }))).toBeNull();
    expect(parseAndroidMirror(manifest({ version: "android-debug-ff4f" }))).toBeNull();
    expect(contentTypeFor("app.apk")).toBe("application/vnd.android.package-archive");
    expect(contentTypeFor("latest.json")).toBe("application/json");
  });
});

describe("fetchLatestRelease", () => {
  it("镜像清单可用时不再请求 GitHub", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toBe(ANDROID_MIRROR_MANIFEST_URL);
      return new Response(JSON.stringify(manifest()), { status: 200 });
    });
    const info = await fetchLatestRelease(fetchImpl as unknown as typeof fetch);
    expect(info?.version).toBe("0.2.7");
    expect(info?.assets[0].sha256).toBe(SHA);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("镜像 404、超时或不合法时改用 GitHub", async () => {
    for (const mirror of [
      async () => new Response("no", { status: 404 }),
      async () => {
        throw new DOMException("timeout", "TimeoutError");
      },
      async () => new Response(JSON.stringify(manifest({ sha256: "00" })), { status: 200 }),
    ]) {
      const fetchImpl = vi.fn(async (url: string) => {
        if (String(url) === ANDROID_MIRROR_MANIFEST_URL) return mirror();
        return new Response(JSON.stringify(githubRelease), { status: 200 });
      });
      const info = await fetchLatestRelease(fetchImpl as unknown as typeof fetch);
      expect(info?.version).toBe("0.2.7");
      expect(info?.assets[0].sha256).toBeUndefined();
      expect(info?.htmlUrl).toContain("github.com");
    }
  });

  it("GitHub 也失败时抛出检查更新错误", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url) === ANDROID_MIRROR_MANIFEST_URL) return new Response("", { status: 404 });
      return new Response("no", { status: 500 });
    });
    await expect(fetchGithubLatestRelease(fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /500/,
    );
    await expect(fetchLatestRelease(fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      "检查更新失败（500）",
    );
  });
});
