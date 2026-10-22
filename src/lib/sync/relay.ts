import { normalizeInviteCode } from "@/lib/sync/crypto";

export type RelayMember = {
  memberId: string;
  /** 与 memberId 相同。旧中继可能只给这个字段 */
  personId?: string;
  name: string;
  color: string;
  payload: string;
  updatedAt: string;
  /**
   * 这个身份换到了另一间房间。普通日程推送不带此字段，中继会保留原值。
   * 这样后写的日程切片不会把「跟去新房间」擦掉。
   */
  redirect?: string | null;
};

/** 房间成员的身份 id。memberId 缺失时用 personId */
export function relayPersonId(member: {
  memberId?: string | null;
  personId?: string | null;
}) {
  return (member.memberId || member.personId || "").trim();
}

export type RelayRoom = {
  code: string;
  updatedAt: string | null;
  /** 有实质写入才加一。0.2.2 客户端忽略此字段 */
  rev?: number;
  members: RelayMember[];
  /** 中继认为本次推送比已存槽位旧而未写入 */
  rejected?: boolean;
  /** 明文指纹未变，中继没有改房间 */
  unchanged?: boolean;
};

/** 0.2.2 的拉取间隔。对方要等下一次轮询才看得见编辑。 */
export const LEGACY_COUPLE_SYNC_POLL_MS = 20_000;
/** 长轮询挂起上限。到点没变化就重新挂起。 */
export const COUPLE_SYNC_WAIT_MS = 25_000;
/** 长轮询连不上时的拉取间隔。 */
export const COUPLE_SYNC_FALLBACK_MS = 2_000;

export function decideAfterRoomWait(
  wait: { ok: true; changed: boolean } | { ok: false; error: string },
): { sync: boolean; delayMs: number } {
  if (!wait.ok) return { sync: true, delayMs: COUPLE_SYNC_FALLBACK_MS };
  if (wait.changed) return { sync: true, delayMs: 0 };
  return { sync: false, delayMs: 0 };
}

/** 内置默认中继（Railway） */
export const BUILTIN_SYNC_RELAY_URL =
  "https://schedulemini-production.up.railway.app";

/**
 * 解析中继基址。优先级：设置页保存值 > VITE_SYNC_RELAY_URL > 内置默认。
 * settingsUrl 为空字符串 / null / undefined 时跳过，继续往下找。
 */
export function resolveRelayBaseUrl(settingsUrl?: string | null) {
  const fromSettings = settingsUrl?.trim();
  if (fromSettings) return fromSettings.replace(/\/$/, "");
  const fromEnv = (
    import.meta.env.VITE_SYNC_RELAY_URL as string | undefined
  )?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return BUILTIN_SYNC_RELAY_URL;
}

/** @deprecated 用 resolveRelayBaseUrl；无设置时走 VITE → 内置 */
export function getRelayBaseUrl() {
  return resolveRelayBaseUrl(null);
}

async function request<T>(
  path: string,
  init?: RequestInit,
  baseUrl?: string | null,
): Promise<
  { ok: true; data: T } | { ok: false; error: string; status?: number }
> {
  const root = resolveRelayBaseUrl(baseUrl);
  const url = `${root}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const data = (await res.json().catch(() => ({}))) as T & {
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data.message || `中继返回 ${res.status}`,
      };
    }
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: `连不上中继（${root.replace(/^https?:\/\//, "")}），请检查网络`,
    };
  }
}

export async function fetchRoom(
  inviteCode: string,
  baseUrl?: string | null,
) {
  const code = normalizeInviteCode(inviteCode);
  return request<RelayRoom>(
    `/v1/rooms/${encodeURIComponent(code)}`,
    undefined,
    baseUrl,
  );
}

export async function pushMemberSlice(args: {
  inviteCode: string;
  memberId: string;
  name: string;
  color: string;
  payload: string;
  /** 明文指纹。旧中继忽略；新中继用来避免无变化推送唤醒对方 */
  docRev?: string;
  updatedAt: string;
  /** 只在换房间时传。省略则中继保留该身份上已有的 redirect */
  redirect?: string | null;
  baseUrl?: string | null;
}) {
  const code = normalizeInviteCode(args.inviteCode);
  return request<RelayRoom>(
    `/v1/rooms/${encodeURIComponent(code)}/members/${encodeURIComponent(args.memberId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        name: args.name,
        color: args.color,
        payload: args.payload,
        docRev: args.docRev,
        updatedAt: args.updatedAt,
        ...(args.redirect !== undefined ? { redirect: args.redirect } : {}),
      }),
    },
    args.baseUrl,
  );
}

/** 房间代数变化就返回。旧中继没有这条路径时由调用方改走短间隔。 */
export async function waitForRoomChange(args: {
  inviteCode: string;
  sinceRev: number;
  timeoutMs?: number;
  baseUrl?: string | null;
  signal?: AbortSignal;
}) {
  const code = normalizeInviteCode(args.inviteCode);
  const timeoutMs = args.timeoutMs ?? COUPLE_SYNC_WAIT_MS;
  const q = new URLSearchParams({
    sinceRev: String(args.sinceRev),
    timeoutMs: String(timeoutMs),
  });
  const res = await request<RelayRoom & { changed?: boolean }>(
    `/v1/rooms/${encodeURIComponent(code)}/wait?${q}`,
    { signal: args.signal },
    args.baseUrl,
  );
  if (!res.ok) return res;
  return {
    ok: true as const,
    changed: res.data.changed === true,
    room: res.data,
  };
}
