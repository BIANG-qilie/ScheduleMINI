import type { CoupleIdentity, ItemOwner, ScheduleItem } from "@/lib/config";
import { encryptPayload, decryptPayload, normalizeInviteCode } from "@/lib/sync/crypto";
import { fetchRoom, pushMemberSlice } from "@/lib/sync/relay";

export type PersonSlice = {
  items: ScheduleItem[];
  selfName: string;
  selfColor: string;
};

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

/** 本机作者的条目（进同步上传切片） */
export function authoredItems(items: ScheduleItem[], memberId: string) {
  return items.filter((it) => (it.ownerId || memberId) === memberId);
}

/** @deprecated 使用 authoredItems */
export function selfItems(items: ScheduleItem[], memberId: string) {
  return authoredItems(items, memberId);
}

export function partnerAuthoredItems(items: ScheduleItem[], memberId: string) {
  return items.filter((it) => (it.ownerId || memberId) !== memberId);
}

/** @deprecated */
export function partnerItems(items: ScheduleItem[], memberId: string) {
  return partnerAuthoredItems(items, memberId);
}

export function laneSelfItems(items: ScheduleItem[]) {
  return items.filter((it) => (it.owner ?? "self") === "self");
}

export function lanePartnerItems(items: ScheduleItem[]) {
  return items.filter((it) => (it.owner ?? "self") === "partner");
}

/** 对方切片里的 owner 翻转到本机视角 */
export function flipOwnerForLocal(owner: ItemOwner | undefined): ItemOwner {
  return (owner ?? "self") === "self" ? "partner" : "self";
}

export function maxUpdatedAt(items: ScheduleItem[]) {
  let max = "1970-01-01T00:00:00.000Z";
  for (const it of items) {
    const t = itemUpdatedAt(it);
    if (t > max) max = t;
  }
  return max;
}

/** 把本机作者 id 改写为共享 personId（多端接入时） */
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
) {
  const mine = authoredItems(items, couple.memberId).map((it) => ({
    ...it,
    owner: (it.owner ?? "self") as ItemOwner,
    ownerId: couple.memberId,
  }));
  const slice: PersonSlice = {
    items: mine,
    selfName: couple.selfName,
    selfColor: couple.selfColor,
  };
  const payload = await encryptPayload(inviteCode, slice);
  return {
    payload,
    updatedAt: maxUpdatedAt(mine) || new Date().toISOString(),
    itemCount: mine.length,
  };
}

/**
 * 拉取房间并合并：
 * - 本人 personId 切片：不翻转归属，与本机作者条目 LWW
 * - 另一 personId：翻转归属后作为对方日程
 */
export async function pullAndMergePartner(args: {
  inviteCode: string;
  couple: CoupleIdentity;
  items: ScheduleItem[];
  baseUrl?: string | null;
}): Promise<{
  items: ScheduleItem[];
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
      couple: args.couple,
      partnerOnline: false,
      selfSliceMerged: false,
      error: room.error,
    };
  }

  const selfEntry = room.data.members.find((m) => m.memberId === selfId);
  const others = room.data.members.filter((m) => m.memberId !== selfId);

  let mine = authoredItems(args.items, selfId);
  let selfSliceMerged = false;
  let nextCouple: CoupleIdentity = {
    ...args.couple,
    inviteCode: code,
  };

  if (selfEntry?.payload) {
    try {
      const slice = await decryptPayload<PersonSlice>(code, selfEntry.payload);
      const remoteMine = (slice.items ?? []).map((it) => ({
        ...it,
        owner: (it.owner ?? "self") as ItemOwner,
        ownerId: selfId,
      }));
      mine = mergeItemsLww(mine, remoteMine);
      selfSliceMerged = remoteMine.length > 0;
    } catch {
      // 本人切片解密失败时保留本机条目，不中断对方合并
    }
  }

  if (others.length === 0) {
    return {
      items: mine,
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
      items: mine,
      couple: nextCouple,
      partnerOnline: false,
      selfSliceMerged,
      error: "解密对方日程失败，请确认邀请码一致",
    };
  }

  const partnerOwned = (slice.items ?? []).map((it) => ({
    ...it,
    owner: flipOwnerForLocal(it.owner),
    ownerId: partner.memberId,
  }));

  return {
    items: [...mine, ...partnerOwned],
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
  baseUrl?: string | null;
}) {
  const code = normalizeInviteCode(args.inviteCode);
  const { payload, updatedAt } = await buildEncryptedSelfSlice(
    code,
    args.couple,
    args.items,
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
