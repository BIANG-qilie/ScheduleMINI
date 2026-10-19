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
  window.addEventListener(
    "sm-apk",
    (e) =>
      onEvent(
        (e as CustomEvent<string>).detail === "installer"
          ? { kind: "handed-off", target: "installer" }
          : { kind: "failed" },
      ),
    { once: true },
  );
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
