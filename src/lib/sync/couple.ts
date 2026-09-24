import type { CoupleIdentity, ScheduleItem } from "@/lib/config";
import { encryptPayload, decryptPayload, normalizeInviteCode } from "@/lib/sync/crypto";
import { fetchRoom, pushMemberSlice } from "@/lib/sync/relay";

export type PartnerSlice = {
  items: ScheduleItem[];
  selfName: string;
  selfColor: string;
};

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

export function selfItems(items: ScheduleItem[], memberId: string) {
  return items.filter((it) => (it.ownerId || memberId) === memberId);
}

export function partnerItems(items: ScheduleItem[], memberId: string) {
  return items.filter((it) => (it.ownerId || memberId) !== memberId);
}

export function maxUpdatedAt(items: ScheduleItem[]) {
  let max = "1970-01-01T00:00:00.000Z";
  for (const it of items) {
    const t = itemUpdatedAt(it);
    if (t > max) max = t;
  }
  return max;
}

export async function buildEncryptedSelfSlice(
  inviteCode: string,
  couple: CoupleIdentity,
  items: ScheduleItem[],
) {
  const mine = selfItems(items, couple.memberId).map((it) => ({
    ...it,
    ownerId: couple.memberId,
  }));
  const slice: PartnerSlice = {
    items: mine,
    selfName: couple.selfName,
    selfColor: couple.selfColor,
  };
  const payload = await encryptPayload(inviteCode, slice);
  return {
    payload,
    updatedAt: maxUpdatedAt(mine) || new Date().toISOString(),
  };
}

export async function pullAndMergePartner(args: {
  inviteCode: string;
  couple: CoupleIdentity;
  items: ScheduleItem[];
}): Promise<{
  items: ScheduleItem[];
  couple: CoupleIdentity;
  partnerOnline: boolean;
  error?: string;
}> {
  const code = normalizeInviteCode(args.inviteCode);
  const room = await fetchRoom(code);
  if (!room.ok) {
    return {
      items: args.items,
      couple: args.couple,
      partnerOnline: false,
      error: room.error,
    };
  }

  const others = room.data.members.filter(
    (m) => m.memberId !== args.couple.memberId,
  );
  if (others.length === 0) {
    return {
      items: args.items,
      couple: {
        ...args.couple,
        inviteCode: code,
        partnerMemberId: null,
        pairedAt: args.couple.pairedAt,
      },
      partnerOnline: false,
    };
  }

  const partner = others[0];
  let slice: PartnerSlice;
  try {
    slice = await decryptPayload<PartnerSlice>(code, partner.payload);
  } catch {
    return {
      items: args.items,
      couple: args.couple,
      partnerOnline: false,
      error: "解密对方日程失败，请确认邀请码一致",
    };
  }

  const partnerOwned = (slice.items ?? []).map((it) => ({
    ...it,
    ownerId: partner.memberId,
  }));
  const mine = selfItems(args.items, args.couple.memberId);

  return {
    items: [...mine, ...partnerOwned],
    couple: {
      ...args.couple,
      inviteCode: code,
      partnerMemberId: partner.memberId,
      partnerName: slice.selfName || partner.name || args.couple.partnerName,
      partnerColor: slice.selfColor || partner.color || args.couple.partnerColor,
      pairedAt: args.couple.pairedAt || new Date().toISOString(),
    },
    partnerOnline: true,
  };
}

export async function pushSelfSlice(args: {
  inviteCode: string;
  couple: CoupleIdentity;
  items: ScheduleItem[];
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
  });
}
