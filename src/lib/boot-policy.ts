import { type AppConfig, safeParseAppConfig } from "@/lib/config";

/** 镜像键。和浏览器预览用的配置键分开，避免两边互相覆盖。 */
export const BOOT_CACHE_KEY = "schedulemini:boot-cache";
/** 同一次 WebView 里已经要求重载的次数。reload 不会清掉 sessionStorage。 */
export const BOOT_RECOVERY_KEY = "schedulemini:boot-recoveries";
/** 先重载这么多次，下一次改为重启进程。和安卓 BootWatch 的上限一致。 */
export const BOOT_RECOVER_LIMIT = 2;

export function readCachedConfig(raw: string | null): AppConfig | null {
  if (!raw) return null;
  try {
    const parsed = safeParseAppConfig(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function serializeBootCache(config: AppConfig): string {
  return JSON.stringify(config);
}

/** 有上次的日程时，首屏不该再等磁盘 IPC。 */
export function shouldShowBootScreen(
  hasCache: boolean,
  diskSettled: boolean,
): boolean {
  return !hasCache && !diskSettled;
}

/** 等待期间用户改过日程，就不能再用磁盘结果盖回去。 */
export function shouldApplyDiskConfig(
  startedEpoch: number,
  currentEpoch: number,
): boolean {
  return startedEpoch === currentEpoch;
}

export type DiskFailureDecision = {
  keepCache: boolean;
  useEmpty: boolean;
  recover: boolean;
  restart: boolean;
  recoveries: number;
};

/**
 * 超时说明回包丢了，再调一次同一条通道通常还是丢。
 * 文件损坏不是通道问题，重载也读不回来。
 */
export function applyDiskFailure(input: {
  hadCache: boolean;
  timedOut: boolean;
  recoveries: number;
}): DiskFailureDecision {
  const keepCache = input.hadCache;
  const base = {
    keepCache,
    useEmpty: !keepCache,
    recover: false,
    restart: false,
    recoveries: input.recoveries,
  };
  if (!input.timedOut) return base;
  if (input.recoveries < BOOT_RECOVER_LIMIT) {
    return { ...base, recover: true, recoveries: input.recoveries + 1 };
  }
  if (input.recoveries === BOOT_RECOVER_LIMIT) {
    return { ...base, restart: true, recoveries: input.recoveries + 1 };
  }
  return base;
}

export function readRecoveryCount(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 0;
  return n;
}
