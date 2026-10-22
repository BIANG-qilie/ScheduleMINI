import { isTauriRuntime } from "@/lib/utils";
import { pickApk, type ReleaseInfo } from "@/lib/update/release";

/** 安卓壳在 MainActivity 注入的原生桥 */
type AndroidInstaller = {
  canInstall(): boolean;
  openInstallSettings(): void;
  download(url: string, fileName: string): void;
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
  | { kind: "failed" };

/** 把安卓壳 sm-apk 事件收成安装状态。percent 为 null 表示总大小未知。 */
export function parseApkEvent(detail: unknown): InstallEvent | null {
  if (detail === "installer") return { kind: "handed-off", target: "installer" };
  if (detail === "failed") return { kind: "failed" };
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
  if (kind === "failed") return { kind: "failed" };
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
  const onApk = (event: Event) => {
    const parsed = parseApkEvent((event as CustomEvent<unknown>).detail);
    if (!parsed) return;
    onEvent(parsed);
    if (parsed.kind !== "progress") window.removeEventListener("sm-apk", onApk);
  };
  window.addEventListener("sm-apk", onApk);
  installer.download(apk.url, `ScheduleMINI-${release.version}.apk`);
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
