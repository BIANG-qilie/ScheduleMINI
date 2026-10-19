export const APP_VERSION = __APP_VERSION__;

type Parsed = { core: [number, number, number]; pre: string[] };

/** 解析 `v1.2.3` / `1.2.3-beta.1`；不是 semver 时返回 null */
export function parseVersion(input: string): Parsed | null {
  const m = input
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!m) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ? m[4].split(".") : [],
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
  for (let i = 0; i < 3; i++) {
    const d = pa.core[i] - pb.core[i];
    if (d !== 0) return Math.sign(d);
  }
  return Math.sign(comparePre(pa.pre, pb.pre));
}

export function isNewer(candidate: string, current: string) {
  return compareVersions(candidate, current) > 0;
}
