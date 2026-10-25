export const MIRROR_OBJECT_PREFIX: string;

export function rewriteLatestUrls<T extends { platforms: Record<string, { url: string; signature?: string }> }>(
  latest: T,
  publicBase: string,
  version: string,
): T;

export function buildAndroidManifest(input: {
  publicBase: string;
  version: string;
  apkName: string;
  sha256: string;
  notes?: string;
}): { version: string; apkUrl: string; sha256: string; notes: string };

export function contentTypeFor(filename: string): string;
