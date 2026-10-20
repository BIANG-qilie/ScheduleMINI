export const APP_VERSION = __APP_VERSION__;

type Parsed = { core: number[]; pre: string[] };

/**
 * 解析 `v1.2.3`、`1.2.3-beta.1`，以及产品版本 `0.2.0.1`（第四段数字）。
 * 不是这种版本号时返回 null。
 */
export function parseVersion(input: string): Parsed | null {
  const m = input
    .trim()
    .match(
      /^v?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
    );
  if (!m) return null;
  const core = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (m[4] !== undefined) core.push(Number(m[4]));
  return {
    core,
    pre: m[5] ? m[5].split(".") : [],
  };
}

function comparePre(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return b.length - a.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const na = /^\d+$/.test(a[i]);
    const nb = /^\d+$/.test(b[i]);
    if (na && nb) {
      const d = Number(a[i]) - Number(b[i]);
      if (d !== 0) return Math.sign(d);
    } else if (na !== nb) {
      return na ? -1 : 1;
    } else if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1;
    }
  }
  return 0;
}

/** semver 比较：a<b 为 -1，相等 0，a>b 为 1 */
export function compareVersions(a: string, b: string) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) throw new Error(`无效版本号：${pa ? b : a}`);
  const n = Math.max(pa.core.length, pb.core.length);
  for (let i = 0; i < n; i++) {
    const d = (pa.core[i] ?? 0) - (pb.core[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return Math.sign(comparePre(pa.pre, pb.pre));
}

export function isNewer(candidate: string, current: string) {
  return compareVersions(candidate, current) > 0;
}
