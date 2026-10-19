import type { CoupleIdentity, ItemOwner, ScheduleItem } from "@/lib/config";
import { encryptPayload, decryptPayload, normalizeInviteCode } from "@/lib/sync/crypto";
import { fetchRoom, pushMemberSlice } from "@/lib/sync/relay";

/** 联合维护：每人槽位推送完整日程文档，拉取后按条目 id LWW 合并 */
export type PersonSlice = {
  items: ScheduleItem[];
  selfName: string;
  selfColor: string;
  /** shared-v2 = 全量共享文档 */
  doc?: "shared-v2";
  /** 删除墓碑：条目 id → 删除时间；晚于条目 updatedAt 则视为已删 */
  deletedItems?: Record<string, string>;
};

export type Tombstones = Record<string, string>;

const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function mergeTombstones(...sources: (Tombstones | undefined)[]) {
  const out: Tombstones = {};
  const cutoff = new Date(Date.now() - TOMBSTONE_TTL_MS).toISOString();
  for (const src of sources) {
    for (const [id, at] of Object.entries(src ?? {})) {
      if (at < cutoff) continue;
      if (!out[id] || at > out[id]) out[id] = at;
    }
  }
  return out;
}

export function applyTombstones(items: ScheduleItem[], tombstones: Tombstones) {
  return items.filter((it) => {
    const at = tombstones[it.id];
    return !at || itemUpdatedAt(it) > at;
  });
}

/** @deprecated 用 PersonSlice */
export type PartnerSlice = PersonSlice;

export function itemUpdatedAt(item: ScheduleItem) {
  return item.updatedAt || "1970-01-01T00:00:00.000Z";
}

/** Last-write-wins by updatedAt (ISO string compare). */
export function mergeItemsLww(
  local: ScheduleItem[],
  incoming: ScheduleItem[],
): ScheduleItem[] {
  const map = new Map<string, ScheduleItem>();
  for (const it of local) map.set(it.id, it);
  for (const it of incoming) {
    const cur = map.get(it.id);
    if (!cur || itemUpdatedAt(it) >= itemUpdatedAt(cur)) {
      map.set(it.id, it);
    }
  }
  return [...map.values()];
}

/** @deprecated 联合维护后推送全量；保留供多端 rekey */
export function authoredItems(items: ScheduleItem[], memberId: string) {
  return items.filter((it) => (it.ownerId || memberId) === memberId);
}

export function selfItems(items: ScheduleItem[], memberId: string) {
  return authoredItems(items, memberId);
}

export function partnerAuthoredItems(items: ScheduleItem[], memberId: string) {
  return items.filter((it) => (it.ownerId || memberId) !== memberId);
}

export function partnerItems(items: ScheduleItem[], memberId: string) {
  return partnerAuthoredItems(items, memberId);
}

/** 自己车道（含共同） */
export function laneSelfItems(items: ScheduleItem[]) {
  return items.filter((it) => {
    const o = it.owner ?? "self";
    return o === "self" || o === "shared";
  });
}

/** 对方车道（含共同） */
export function lanePartnerItems(items: ScheduleItem[]) {
  return items.filter((it) => {
    const o = it.owner ?? "self";
    return o === "partner" || o === "shared";
  });
}

/** 对方视角翻转：self↔partner；shared 不变 */
export function flipOwnerForLocal(owner: ItemOwner | undefined): ItemOwner {
  const o = owner ?? "self";
  if (o === "shared") return "shared";
  return o === "self" ? "partner" : "self";
}

export function maxUpdatedAt(items: ScheduleItem[]) {
  let max = "1970-01-01T00:00:00.000Z";
  for (const it of items) {
    const t = itemUpdatedAt(it);
    if (t > max) max = t;
  }
  return max;
}

export function rekeyAuthoredItems(
  items: ScheduleItem[],
  fromPersonId: string,
  toPersonId: string,
): ScheduleItem[] {
  if (fromPersonId === toPersonId) return items;
  return items.map((it) => {
    const author = it.ownerId || fromPersonId;
    if (author !== fromPersonId) return it;
    return { ...it, ownerId: toPersonId };
  });
}

export async function buildEncryptedSelfSlice(
  inviteCode: string,
  couple: CoupleIdentity,
  items: ScheduleItem[],
  deletedItems: Tombstones = {},
) {
  // 联合维护：推送完整日程（相对本机归属）
  const all = items.map((it) => ({
    ...it,
    owner: (it.owner ?? "self") as ItemOwner,
  }));
  const slice: PersonSlice = {
    items: all,
    selfName: couple.selfName,
    selfColor: couple.selfColor,
    doc: "shared-v2",
    deletedItems,
  };
  const payload = await encryptPayload(inviteCode, slice);
  return {
    payload,
    // 槽位版本 = 推送时刻：删除不会抬高条目最大时间，用它会被中继判旧拒收
    updatedAt: new Date().toISOString(),
    itemCount: all.length,
  };
}

/**
 * 拉取并合并共享文档：
 * - 本人槽：不翻转，LWW
 * - 对方槽：翻转 self↔partner（shared 保留），再 LWW
 */
export async function pullAndMergePartner(args: {
  inviteCode: string;
  couple: CoupleIdentity;
  items: ScheduleItem[];
  deletedItems?: Tombstones;
  baseUrl?: string | null;
}): Promise<{
  items: ScheduleItem[];
  deletedItems: Tombstones;
  couple: CoupleIdentity;
  partnerOnline: boolean;
  selfSliceMerged: boolean;
  error?: string;
}> {
  const code = normalizeInviteCode(args.inviteCode);
  const selfId = args.couple.memberId;
  const room = await fetchRoom(code, args.baseUrl);
  if (!room.ok) {
    return {
      items: args.items,
      deletedItems: args.deletedItems ?? {},
      couple: args.couple,
      partnerOnline: false,
      selfSliceMerged: false,
      error: room.error,
    };
  }

  const selfEntry = room.data.members.find((m) => m.memberId === selfId);
  const others = room.data.members.filter((m) => m.memberId !== selfId);

  let merged = [...args.items];
  let tombstones = mergeTombstones(args.deletedItems);
  let selfSliceMerged = false;
  let nextCouple: CoupleIdentity = {
    ...args.couple,
    inviteCode: code,
  };

  if (selfEntry?.payload) {
    try {
      const slice = await decryptPayload<PersonSlice>(code, selfEntry.payload);
      const remote = (slice.items ?? []).map((it) => ({
        ...it,
        owner: (it.owner ?? "self") as ItemOwner,
      }));
      merged = mergeItemsLww(merged, remote);
      tombstones = mergeTombstones(tombstones, slice.deletedItems);
      selfSliceMerged = true;
    } catch {
      // keep local
    }
  }

  if (others.length === 0) {
    return {
      items: applyTombstones(merged, tombstones),
      deletedItems: tombstones,
      couple: {
        ...nextCouple,
        partnerMemberId: null,
        pairedAt: args.couple.pairedAt,
      },
      partnerOnline: false,
      selfSliceMerged,
    };
  }

  const partner = others[0];
  let slice: PersonSlice;
  try {
    slice = await decryptPayload<PersonSlice>(code, partner.payload);
  } catch {
    return {
      items: applyTombstones(merged, tombstones),
      deletedItems: tombstones,
      couple: nextCouple,
      partnerOnline: false,
      selfSliceMerged,
      error: "解密对方日程失败，请确认邀请码一致",
    };
  }

  const fromPartner = (slice.items ?? []).map((it) => ({
    ...it,
    owner: flipOwnerForLocal(it.owner),
    ownerId: it.ownerId || partner.memberId,
  }));
  merged = mergeItemsLww(merged, fromPartner);
  tombstones = mergeTombstones(tombstones, slice.deletedItems);

  return {
    items: applyTombstones(merged, tombstones),
    deletedItems: tombstones,
    couple: {
      ...nextCouple,
      partnerMemberId: partner.memberId,
      partnerName: slice.selfName || partner.name || args.couple.partnerName,
      partnerColor: slice.selfColor || partner.color || args.couple.partnerColor,
      pairedAt: args.couple.pairedAt || new Date().toISOString(),
    },
    partnerOnline: true,
    selfSliceMerged,
  };
}

export async function pushSelfSlice(args: {
  inviteCode: string;
  couple: CoupleIdentity;
  items: ScheduleItem[];
  deletedItems?: Tombstones;
  baseUrl?: string | null;
}) {
  const code = normalizeInviteCode(args.inviteCode);
  const { payload, updatedAt } = await buildEncryptedSelfSlice(
    code,
    args.couple,
    args.items,
    args.deletedItems,
  );
  return pushMemberSlice({
    inviteCode: code,
    memberId: args.couple.memberId,
    name: args.couple.selfName,
    color: args.couple.selfColor,
    payload,
    updatedAt,
    baseUrl: args.baseUrl,
  });
}

export type SyncOnceResult = {
  items: ScheduleItem[];
  deletedItems: Tombstones;
  couple: CoupleIdentity;
  partnerOnline: boolean;
  selfSliceMerged: boolean;
  error?: string;
};

/**
 * 一次完整同步：拉取 → 合并 → 推送。
 * latest() 返回推送前的最新本地状态，避免覆盖同步期间的本地编辑。
 */
export async function syncRoomOnce(args: {
  inviteCode: string;
  couple: CoupleIdentity;
  items: ScheduleItem[];
  deletedItems: Tombstones;
  baseUrl?: string | null;
  latest?: () => { items: ScheduleItem[]; deletedItems: Tombstones };
}): Promise<SyncOnceResult> {
  const pulled = await pullAndMergePartner(args);
  if (pulled.error && !pulled.selfSliceMerged && !pulled.partnerOnline) {
    return { ...pulled, items: args.items, deletedItems: args.deletedItems };
  }

  const now = args.latest?.() ?? args;
  const deletedItems = mergeTombstones(pulled.deletedItems, now.deletedItems);
  const items = applyTombstones(
    mergeItemsLww(pulled.items, now.items),
    deletedItems,
  );

  const pushed = await pushSelfSlice({
    inviteCode: args.inviteCode,
    couple: pulled.couple,
    items,
    deletedItems,
    baseUrl: args.baseUrl,
  });
  const error = !pushed.ok
    ? pushed.error
    : pushed.data.rejected
      ? "中继拒收（本机时间可能偏慢），稍后重试"
      : pulled.error;
  return { ...pulled, items, deletedItems, error };
}
