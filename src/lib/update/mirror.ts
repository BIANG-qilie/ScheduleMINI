import { z } from "zod";
import {
  ANDROID_MIRROR_MANIFEST_URL,
  MIRROR_OBJECT_PREFIX,
  MIRROR_PUBLIC_BASE,
} from "@/lib/update/mirror-endpoints";
import { parseVersion } from "@/lib/update/version";
import type { ReleaseInfo } from "@/lib/update/release";

export {
  ANDROID_MIRROR_MANIFEST_URL,
  DESKTOP_MIRROR_LATEST_URL,
  GITHUB_LATEST_JSON_URL,
  MIRROR_OBJECT_PREFIX,
  MIRROR_PUBLIC_BASE,
} from "@/lib/update/mirror-endpoints";

export const MIRROR_FETCH_TIMEOUT_MS = 5_000;

const manifestSchema = z.object({
  version: z.string(),
  apkUrl: z.string(),
  sha256: z.string(),
  notes: z.string().nullable().optional(),
});

function apkUrlOnMirror(apkUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(apkUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const base = new URL(MIRROR_PUBLIC_BASE);
  if (url.origin !== base.origin) return null;
  const prefix = `${base.pathname.replace(/\/$/, "")}/${MIRROR_OBJECT_PREFIX}/`;
  if (!url.pathname.startsWith(prefix)) return null;
  if (!url.pathname.toLowerCase().endsWith(".apk")) return null;
  return url.toString();
}

/**
 * 镜像 android-latest.json → 版本信息。
 * 缺 sha256、地址不在镜像上、或版本号不合法时返回 null，调用方改走 GitHub。
 */
export function parseAndroidMirror(json: unknown): ReleaseInfo | null {
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) return null;
  const version = parsed.data.version.trim().replace(/^v/i, "");
  if (!parseVersion(version)) return null;
  const sha256 = parsed.data.sha256.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) return null;
  const url = apkUrlOnMirror(parsed.data.apkUrl.trim());
  if (!url) return null;
  const name = new URL(url).pathname.split("/").pop() ?? "app.apk";
  return {
    version,
    notes: parsed.data.notes ?? "",
    htmlUrl: `https://github.com/BIANG-qilie/ScheduleMINI/releases/tag/v${version}`,
    publishedAt: null,
    assets: [{ name, size: 0, url, sha256 }],
  };
}

export async function fetchAndroidMirror(
  fetchImpl: typeof fetch = fetch,
): Promise<ReleaseInfo | null> {
  try {
    const res = await fetchImpl(ANDROID_MIRROR_MANIFEST_URL, {
      signal: AbortSignal.timeout(MIRROR_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return parseAndroidMirror(await res.json());
  } catch {
    return null;
  }
}
