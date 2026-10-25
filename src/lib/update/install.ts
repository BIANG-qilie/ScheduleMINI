import { isTauriRuntime } from "@/lib/utils";
import { fetchGithubLatestRelease, pickApk, type ReleaseInfo } from "@/lib/update/release";

/** 安卓壳在 MainActivity 注入的原生桥 */
type AndroidInstaller = {
  canInstall(): boolean;
  openInstallSettings(): void;
  download(url: string, fileName: string): void;
  /** 下载后核对 sha256，不一致则不打开安装器 */
  downloadChecked(url: string, fileName: string, sha256: string): void;
};

declare global {
  interface Window {
    SmInstaller?: AndroidInstaller;
  }
}

export type InstallEvent =
  | { kind: "progress"; percent: number | null }
  | { kind: "needs-permission" }
  | { kind: "handed-off"; target: "installer" | "browser" }
  | { kind: "failed"; reason?: "download" | "hash" }
  | { kind: "hash-mismatch" };

/** 把安卓壳 sm-apk 事件收成安装状态。percent 为 null 表示总大小未知。 */
export function parseApkEvent(detail: unknown): InstallEvent | null {
  if (detail === "installer") return { kind: "handed-off", target: "installer" };
  if (detail === "failed") return { kind: "failed", reason: "download" };
  if (detail === "hash-mismatch") return { kind: "hash-mismatch" };
  if (!detail || typeof detail !== "object") return null;
  const kind = (detail as { kind?: unknown }).kind;
  if (kind === "progress") {
    const raw = (detail as { percent?: unknown }).percent;
    const percent =
      typeof raw === "number" && Number.isFinite(raw)
        ? Math.max(0, Math.min(100, Math.round(raw)))
        : null;
    return { kind: "progress", percent };
  }
  if (kind === "installer") return { kind: "handed-off", target: "installer" };
  if (kind === "failed") return { kind: "failed", reason: "download" };
  if (kind === "hash-mismatch") return { kind: "hash-mismatch" };
  return null;
}

export function updatePlatform() {
  if (typeof window !== "undefined" && window.SmInstaller) return "android";
  if (isTauriRuntime()) return "desktop";
  return "web";
}

async function openExternal(url: string) {
  if (isTauriRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

async function installDesktop(
  release: ReleaseInfo,
  onEvent: (e: InstallEvent) => void,
) {
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) {
    // Release 未附带当前平台的签名包时改为打开发布页
    await openExternal(release.htmlUrl);
    onEvent({ kind: "handed-off", target: "browser" });
    return;
  }
  let total = 0;
  let done = 0;
  await update.downloadAndInstall((e) => {
    if (e.event === "Started") total = e.data.contentLength ?? 0;
    if (e.event === "Progress") {
      done += e.data.chunkLength;
      onEvent({
        kind: "progress",
        percent: total ? Math.round((done / total) * 100) : null,
      });
    }
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

function fileNameFor(release: ReleaseInfo) {
  return `ScheduleMINI-${release.version}.apk`;
}

function startAndroidDownload(
  installer: AndroidInstaller,
  url: string,
  fileName: string,
  sha256: string,
) {
  if (sha256) installer.downloadChecked(url, fileName, sha256);
  else installer.download(url, fileName);
}

function installAndroid(
  release: ReleaseInfo,
  installer: AndroidInstaller,
  onEvent: (e: InstallEvent) => void,
) {
  const apk = pickApk(release.assets);
  if (!apk) return openExternal(release.htmlUrl);
  if (!installer.canInstall()) {
    onEvent({ kind: "needs-permission" });
    return;
  }
  const fileName = fileNameFor(release);
  const expected = apk.sha256 ?? "";
  let fallbackUsed = false;

  const onApk = (event: Event) => {
    const parsed = parseApkEvent((event as CustomEvent<unknown>).detail);
    if (!parsed) return;
    const mirrorFailed =
      Boolean(expected) &&
      !fallbackUsed &&
      (parsed.kind === "hash-mismatch" || parsed.kind === "failed");
    if (mirrorFailed) {
      fallbackUsed = true;
      window.removeEventListener("sm-apk", onApk);
      void fallbackToGithub();
      return;
    }
    if (parsed.kind === "hash-mismatch") {
      window.removeEventListener("sm-apk", onApk);
      onEvent({ kind: "failed", reason: "hash" });
      return;
    }
    onEvent(parsed);
    if (parsed.kind !== "progress") window.removeEventListener("sm-apk", onApk);
  };

  async function fallbackToGithub() {
    try {
      const github = await fetchGithubLatestRelease();
      const githubApk = github ? pickApk(github.assets) : null;
      if (!githubApk) {
        onEvent({ kind: "failed", reason: "download" });
        return;
      }
      window.addEventListener("sm-apk", onApk);
      startAndroidDownload(installer, githubApk.url, fileName, expected);
      onEvent({ kind: "progress", percent: null });
    } catch {
      onEvent({ kind: "failed", reason: "download" });
    }
  }

  window.addEventListener("sm-apk", onApk);
  startAndroidDownload(installer, apk.url, fileName, expected);
  onEvent({ kind: "progress", percent: null });
}

export async function installRelease(
  release: ReleaseInfo,
  onEvent: (e: InstallEvent) => void,
) {
  const platform = updatePlatform();
  if (platform === "desktop") return installDesktop(release, onEvent);
  if (platform === "android") {
    return installAndroid(release, window.SmInstaller!, onEvent);
  }
  await openExternal(release.htmlUrl);
  onEvent({ kind: "handed-off", target: "browser" });
}

export function openInstallPermissionSettings() {
  window.SmInstaller?.openInstallSettings();
}
