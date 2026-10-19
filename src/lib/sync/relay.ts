import { normalizeInviteCode } from "@/lib/sync/crypto";

export type RelayMember = {
  memberId: string;
  name: string;
  color: string;
  payload: string;
  updatedAt: string;
};

export type RelayRoom = {
  code: string;
  updatedAt: string | null;
  members: RelayMember[];
  /** 中继认为本次推送比已存槽位旧而未写入 */
  rejected?: boolean;
};

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
  updatedAt: string;
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
        updatedAt: args.updatedAt,
      }),
    },
    args.baseUrl,
  );
}
