import { z } from "zod";
import { parseVersion } from "@/lib/update/version";

export const UPDATE_REPO = "BIANG-qilie/ScheduleMINI";

export const RELEASE_FEED_URL =
  (import.meta.env.VITE_UPDATE_FEED_URL as string | undefined)?.trim() ||
  `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;

const releaseSchema = z.object({
  tag_name: z.string(),
  name: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  html_url: z.string(),
  published_at: z.string().nullable().optional(),
  draft: z.boolean().optional(),
  prerelease: z.boolean().optional(),
  assets: z.array(
    z.object({
      name: z.string(),
      size: z.number(),
      browser_download_url: z.string(),
    }),
  ),
});

export type ReleaseAsset = { name: string; size: number; url: string };

export type ReleaseInfo = {
  version: string;
  notes: string;
  htmlUrl: string;
  publishedAt: string | null;
  assets: ReleaseAsset[];
};

/** GitHub `releases/latest` 响应 → 版本信息；tag 不是 semver 时返回 null */
export function parseRelease(json: unknown): ReleaseInfo | null {
  const r = releaseSchema.parse(json);
  const version = r.tag_name.replace(/^v/i, "");
  if (r.draft || !parseVersion(version)) return null;
  return {
    version,
    notes: r.body ?? "",
    htmlUrl: r.html_url,
    publishedAt: r.published_at ?? null,
    assets: r.assets.map((a) => ({
      name: a.name,
      size: a.size,
      url: a.browser_download_url,
    })),
  };
}

/** 优先通用包（universal），否则取第一个 .apk */
export function pickApk(assets: ReleaseAsset[]) {
  const apks = assets.filter((a) => a.name.toLowerCase().endsWith(".apk"));
  return apks.find((a) => /universal/i.test(a.name)) ?? apks[0] ?? null;
}

/** Markdown 发布说明 → 最多 maxLines 行纯文本要点 */
export function summarizeNotes(markdown: string, maxLines = 4) {
  const lines = markdown
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^#{1,6}\s+/, "")
        .replace(/^\s*[-*+]\s+/, "")
        .replace(/^\s*\d+\.\s+/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim(),
    )
    .filter((l) => l && !/^full changelog/i.test(l));
  return lines.length > maxLines
    ? [...lines.slice(0, maxLines), `等 ${lines.length - maxLines} 项`]
    : lines;
}

export async function fetchLatestRelease(fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(RELEASE_FEED_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`检查更新失败（${res.status}）`);
  return parseRelease(await res.json());
}
