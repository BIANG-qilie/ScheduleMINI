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
};

/** Default local relay; override with VITE_SYNC_RELAY_URL for remote. */
export function getRelayBaseUrl() {
  const fromEnv = (import.meta.env.VITE_SYNC_RELAY_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://127.0.0.1:8787";
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  const url = `${getRelayBaseUrl()}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data.message || data.error || `HTTP ${res.status}`,
      };
    }
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `中继不可达（${getRelayBaseUrl()}）：${e.message}`
          : "中继不可达",
    };
  }
}

export async function fetchRoom(inviteCode: string) {
  const code = normalizeInviteCode(inviteCode);
  return request<RelayRoom>(`/v1/rooms/${encodeURIComponent(code)}`);
}

export async function pushMemberSlice(args: {
  inviteCode: string;
  memberId: string;
  name: string;
  color: string;
  payload: string;
  updatedAt: string;
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
  );
}
