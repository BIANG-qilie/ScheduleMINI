import type { CoupleIdentity, ItemOwner, ScheduleItem } from "@/lib/config";
import { normalizeAddress } from "@/lib/config";
import {
  decryptPayload,
  digestJson,
  encryptPayload,
  normalizeInviteCode,
} from "@/lib/sync/crypto";
import {
  fetchRoom,
  pushMemberSlice,
  relayPersonId,
  type RelayMember,
} from "@/lib/sync/relay";

/** 一个称呼：短标签 + 写入时间。空文本表示清掉 */
export type AddressStamp = { text: string; updatedAt: string };

/** 共处会话。current 为空表示已停，仍靠 updatedAt 做后写覆盖 */
export type SyncedCoexistence = {
  current: {
    id: string;
    startedAt: string;
    pauses: { pausedAt: string; resumedAt?: string }[];
  } | null;
  updatedAt: string;
};

/** 联合维护：每人槽位推送完整日程文档，拉取后按条目 id LWW 合并 */
export type PersonSlice = {
  items: ScheduleItem[];
  selfName: string;
  selfColor: string;
  /** shared-v2 = 全量共享文档 */
  doc?: "shared-v2";
  /** 删除墓碑：条目 id → 删除时间；晚于条目 updatedAt 则视为已删 */
  deletedItems?: Record<string, string>;
  /** 我给对方的称呼 */
  addressForThem?: AddressStamp;
  /** 正在进行的共处。记入之前不产生日程条目 */
  coexistence?: SyncedCoexistence;
  /**
   * 本身份的绑定快照。同一人的其他设备靠它知道已经和谁配对；
   * 邀请码变了则跟着去新房间。不占第二个身份席位。
   */
  binding?: CoupleBinding;
};

/** 加密切片里的绑定。partnerMemberId 为空表示还没配对 */
export type CoupleBinding = {
  inviteCode: string;
  partnerMemberId: string | null;
  partnerName: string;
  partnerColor: string;
  pairedAt: string | null;
  updatedAt: string;
};

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export function bindingFromCouple(couple: CoupleIdentity): CoupleBinding | null {
  if (!couple.bindingUpdatedAt) return null;
  const inviteCode = couple.inviteCode
    ? normalizeInviteCode(couple.inviteCode)
    : "";
  if (!inviteCode) return null;
  return {
    inviteCode,
    partnerMemberId: couple.partnerMemberId ?? null,
    partnerName: couple.partnerName,
    partnerColor: couple.partnerColor,
    pairedAt: couple.pairedAt ?? null,
    updatedAt: couple.bindingUpdatedAt,
  };
}

function sameBindingIdentity(a: CoupleIdentity, b: CoupleIdentity) {
  const roomA = a.inviteCode ? normalizeInviteCode(a.inviteCode) : "";
  const roomB = b.inviteCode ? normalizeInviteCode(b.inviteCode) : "";
  return (
    roomA === roomB &&
    (a.partnerMemberId ?? null) === (b.partnerMemberId ?? null) &&
    a.partnerName === b.partnerName &&
    a.partnerColor === b.partnerColor &&
    (a.pairedAt ?? null) === (b.pairedAt ?? null)
  );
}

/** 绑定内容变了才换时间戳，没变就沿用，明文指纹才不会每次都变 */
export function stampBinding(before: CoupleIdentity, after: CoupleIdentity): CoupleIdentity {
  if (sameBindingIdentity(before, after)) {
    return { ...after, bindingUpdatedAt: before.bindingUpdatedAt || "" };
  }
  return { ...after, bindingUpdatedAt: new Date().toISOString() };
}

function applyBindingHint(couple: CoupleIdentity, binding?: CoupleBinding | null): CoupleIdentity {
  if (!binding?.updatedAt || !binding.partnerMemberId) return couple;
  if (couple.bindingUpdatedAt && couple.bindingUpdatedAt > binding.updatedAt) {
    return couple;
  }
  const color = HEX_COLOR.test(binding.partnerColor || "")
    ? binding.partnerColor
    : couple.partnerColor;
  return {
    ...couple,
    partnerMemberId: binding.partnerMemberId,
    partnerName: binding.partnerName || couple.partnerName,
    partnerColor: color,
    pairedAt: binding.pairedAt || couple.pairedAt,
    bindingUpdatedAt: binding.updatedAt,
  };
}

function roomCodeOf(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const code = normalizeInviteCode(raw);
  return code.length >= 4 ? code : "";
}

/** 本身份要去的新房间。redirect 优先，它不会被后续日程推送擦掉 */
export function followRoomCode(
  current: string,
  redirect: unknown,
  binding?: CoupleBinding | null,
) {
  const here = roomCodeOf(current);
  const fromRedirect = roomCodeOf(redirect);
  if (fromRedirect && fromRedirect !== here) return fromRedirect;
  const fromBinding = roomCodeOf(binding?.inviteCode);
  if (fromBinding && fromBinding !== here) return fromBinding;
  return "";
}

function otherPersonId(members: RelayMember[] | undefined, selfId: string) {
  for (const member of members ?? []) {
    const id = relayPersonId(member);
    if (id && id !== selfId) return id;
  }
  return "";
}

export function addressStamp(
  text: string | undefined,
  updatedAt: string | undefined,
): AddressStamp | null {
  if (!updatedAt) return null;
  return { text: normalizeAddress(text ?? ""), updatedAt };
}

/** 称呼后写覆盖。没有时间戳的一侧不参与 */
export function mergeAddressLww(
  local: AddressStamp | null,
  remote: AddressStamp | null | undefined,
): AddressStamp | null {
  if (!remote?.updatedAt) return local;
  const next = {
    text: normalizeAddress(remote.text ?? ""),
    updatedAt: remote.updatedAt,
  };
  if (!local?.updatedAt || next.updatedAt > local.updatedAt) return next;
  return local;
}

export function mergeCoexistenceLww(
  local: SyncedCoexistence | null,
  remote: SyncedCoexistence | null | undefined,
): SyncedCoexistence | null {
  if (!remote?.updatedAt) return local;
  const current = remote.current;
  const next: SyncedCoexistence =
    current?.id && current.startedAt
      ? {
          updatedAt: remote.updatedAt,
          current: {
            id: current.id,
            startedAt: current.startedAt,
            pauses: (current.pauses ?? [])
              .filter((pause) => pause.pausedAt)
              .map((pause) => ({
                pausedAt: pause.pausedAt,
                ...(pause.resumedAt ? { resumedAt: pause.resumedAt } : {}),
              })),
          },
        }
      : { current: null, updatedAt: remote.updatedAt };
  if (!local?.updatedAt || next.updatedAt > local.updatedAt) return next;
  return local;
}

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

/** 同步结果落盘前再并一次本地状态，避免拉取期间的删除被旧条目盖回。 */
export function reconcileSyncResult(
  latest: { items: ScheduleItem[]; deletedItems?: Tombstones },
  synced: { items: ScheduleItem[]; deletedItems?: Tombstones },
) {
  const deletedItems = mergeTombstones(synced.deletedItems, latest.deletedItems);
  const items = applyTombstones(
    mergeItemsLww(synced.items, latest.items),
    deletedItems,
  );
  return { items, deletedItems };
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
  coexistence: SyncedCoexistence | null = null,
) {
  // 联合维护：推送完整日程（相对本机归属）
  const all = items.map((it) => ({
    ...it,
    owner: (it.owner ?? "self") as ItemOwner,
  }));
  const address = addressStamp(couple.addressForThem, couple.addressForThemAt);
  const binding = bindingFromCouple(couple);
  const slice: PersonSlice = {
    items: all,
    selfName: couple.selfName,
    selfColor: couple.selfColor,
    doc: "shared-v2",
    deletedItems,
    ...(address ? { addressForThem: address } : {}),
    ...(coexistence?.updatedAt ? { coexistence } : {}),
    ...(binding ? { binding } : {}),
  };
  const payload = await encryptPayload(inviteCode, slice);
  return {
    payload,
    docRev: await digestJson(slice),
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
  coexistence?: SyncedCoexistence | null;
  baseUrl?: string | null;
}): Promise<{
  items: ScheduleItem[];
  deletedItems: Tombstones;
  couple: CoupleIdentity;
  coexistence: SyncedCoexistence | null;
  partnerOnline: boolean;
  selfSliceMerged: boolean;
  /** 本身份已经换到这间房。调用方应改去同步它，不要再把旧切片推回原房间 */
  followInviteCode?: string;
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
      coexistence: args.coexistence ?? null,
      partnerOnline: false,
      selfSliceMerged: false,
      error: room.error,
    };
  }

  const members = room.data.members ?? [];
  const selfEntry = members.find((m) => relayPersonId(m) === selfId);
  const others = members.filter((m) => {
    const id = relayPersonId(m);
    return Boolean(id) && id !== selfId;
  });

  let merged = [...args.items];
  let tombstones = mergeTombstones(args.deletedItems);
  let selfSliceMerged = false;
  let addressForThem = addressStamp(
    args.couple.addressForThem,
    args.couple.addressForThemAt,
  );
  let addressForMe = addressStamp(
    args.couple.addressForMe,
    args.couple.addressForMeAt,
  );
  let coexistence = args.coexistence ?? null;
  let selfBinding: CoupleBinding | null = null;
  let nextCouple: CoupleIdentity = {
    ...args.couple,
    inviteCode: code,
  };

  const applySliceMeta = (slice: PersonSlice, mine: boolean) => {
    if (mine) {
      addressForThem = mergeAddressLww(addressForThem, slice.addressForThem);
      if (slice.binding?.updatedAt) selfBinding = slice.binding;
    }
    coexistence = mergeCoexistenceLww(coexistence, slice.coexistence);
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
      applySliceMeta(slice, true);
      selfSliceMerged = true;
    } catch {
      // keep local
    }
  }

  nextCouple = applyBindingHint(nextCouple, selfBinding);
  const followInviteCode = followRoomCode(
    code,
    selfEntry?.redirect,
    selfBinding,
  );

  const withAddress = (couple: CoupleIdentity): CoupleIdentity => ({
    ...couple,
    addressForThem: addressForThem?.text ?? "",
    addressForThemAt: addressForThem?.updatedAt ?? "",
    addressForMe: addressForMe?.text ?? "",
    addressForMeAt: addressForMe?.updatedAt ?? "",
  });

  if (followInviteCode) {
    return {
      items: applyTombstones(merged, tombstones),
      deletedItems: tombstones,
      couple: withAddress(stampBinding(args.couple, nextCouple)),
      coexistence,
      partnerOnline: Boolean(nextCouple.partnerMemberId),
      selfSliceMerged,
      followInviteCode,
    };
  }

  if (others.length === 0) {
    const keepHint = Boolean(nextCouple.partnerMemberId);
    const alone: CoupleIdentity = keepHint
      ? nextCouple
      : {
          ...nextCouple,
          partnerMemberId: null,
          pairedAt: args.couple.pairedAt,
        };
    return {
      items: applyTombstones(merged, tombstones),
      deletedItems: tombstones,
      couple: withAddress(stampBinding(args.couple, alone)),
      coexistence,
      partnerOnline: false,
      selfSliceMerged,
    };
  }

  const partner = others[0];
  const partnerId = relayPersonId(partner);
  let slice: PersonSlice;
  try {
    slice = await decryptPayload<PersonSlice>(code, partner.payload);
  } catch {
    return {
      items: applyTombstones(merged, tombstones),
      deletedItems: tombstones,
      couple: withAddress(nextCouple),
      coexistence,
      partnerOnline: false,
      selfSliceMerged,
      error: "解密对方日程失败，请确认邀请码一致",
    };
  }

  const fromPartner = (slice.items ?? []).map((it) => ({
    ...it,
    owner: flipOwnerForLocal(it.owner),
    ownerId: it.ownerId || partnerId,
  }));
  merged = mergeItemsLww(merged, fromPartner);
  tombstones = mergeTombstones(tombstones, slice.deletedItems);
  if (
    args.couple.partnerMemberId &&
    args.couple.partnerMemberId !== partnerId
  ) {
    addressForThem = { text: "", updatedAt: new Date().toISOString() };
    addressForMe = null;
  }
  addressForMe = mergeAddressLww(addressForMe, slice.addressForThem);
  coexistence = mergeCoexistenceLww(coexistence, slice.coexistence);

  return {
    items: applyTombstones(merged, tombstones),
    deletedItems: tombstones,
    couple: withAddress(
      stampBinding(args.couple, {
        ...nextCouple,
        partnerMemberId: partnerId,
        partnerName: slice.selfName || partner.name || args.couple.partnerName,
        partnerColor: slice.selfColor || partner.color || args.couple.partnerColor,
        pairedAt: args.couple.pairedAt || nextCouple.pairedAt || new Date().toISOString(),
      }),
    ),
    coexistence,
    partnerOnline: true,
    selfSliceMerged,
  };
}

export async function pushSelfSlice(args: {
  inviteCode: string;
  couple: CoupleIdentity;
  items: ScheduleItem[];
  deletedItems?: Tombstones;
  coexistence?: SyncedCoexistence | null;
  baseUrl?: string | null;
}) {
  const code = normalizeInviteCode(args.inviteCode);
  const { payload, docRev, updatedAt } = await buildEncryptedSelfSlice(
    code,
    args.couple,
    args.items,
    args.deletedItems,
    args.coexistence ?? null,
  );
  return pushMemberSlice({
    inviteCode: code,
    memberId: args.couple.memberId,
    name: args.couple.selfName,
    color: args.couple.selfColor,
    payload,
    docRev,
    updatedAt,
    baseUrl: args.baseUrl,
  });
}

export type SyncOnceResult = {
  items: ScheduleItem[];
  deletedItems: Tombstones;
  couple: CoupleIdentity;
  coexistence: SyncedCoexistence | null;
  partnerOnline: boolean;
  selfSliceMerged: boolean;
  /** 中继房间代数。长轮询用它判断有没有新写入 */
  roomRev?: number;
  error?: string;
};

export type SyncLatest = {
  items: ScheduleItem[];
  deletedItems: Tombstones;
  couple?: CoupleIdentity;
  coexistence?: SyncedCoexistence | null;
};

export type SyncRoomArgs = {
  inviteCode: string;
  couple: CoupleIdentity;
  items: ScheduleItem[];
  deletedItems: Tombstones;
  coexistence?: SyncedCoexistence | null;
  baseUrl?: string | null;
  latest?: () => SyncLatest;
  /**
   * 测试用：拉取之后、推送之前。用来把「对方这时才加入」插进同一次同步。
   */
  afterPull?: () => Promise<void> | void;
};

/**
 * 一次完整同步：拉取 → 合并 → 推送。
 * latest() 返回推送前的最新本地状态，避免覆盖同步期间的本地编辑。
 * 若这次拉取时对方还没进房间，推送返回的成员列表里已经有对方，会再合并一次。
 * 若本身份留了换房间标记，则改去新房间同步，不再把旧切片推回原房间。
 */
export async function syncRoomOnce(args: SyncRoomArgs): Promise<SyncOnceResult> {
  return syncRoomOnceAt(args, 0);
}

async function syncRoomOnceAt(
  args: SyncRoomArgs,
  depth: number,
): Promise<SyncOnceResult> {
  const pulled = await pullAndMergePartner(args);
  if (pulled.followInviteCode && depth < 2) {
    return syncRoomOnceAt(
      {
        ...args,
        afterPull: undefined,
        inviteCode: pulled.followInviteCode,
        couple: { ...pulled.couple, inviteCode: pulled.followInviteCode },
        items: pulled.items,
        deletedItems: pulled.deletedItems,
        coexistence: pulled.coexistence,
      },
      depth + 1,
    );
  }
  if (pulled.error && !pulled.selfSliceMerged && !pulled.partnerOnline) {
    return {
      ...pulled,
      items: args.items,
      deletedItems: args.deletedItems,
      coexistence: args.coexistence ?? null,
    };
  }

  if (args.afterPull) await args.afterPull();

  const now = args.latest?.() ?? {
    items: args.items,
    deletedItems: args.deletedItems,
    couple: args.couple,
    coexistence: args.coexistence ?? null,
  };
  const deletedItems = mergeTombstones(pulled.deletedItems, now.deletedItems);
  const items = applyTombstones(
    mergeItemsLww(pulled.items, now.items),
    deletedItems,
  );
  const addressForThem = mergeAddressLww(
    addressStamp(pulled.couple.addressForThem, pulled.couple.addressForThemAt),
    addressStamp(now.couple?.addressForThem, now.couple?.addressForThemAt),
  );
  const addressForMe = mergeAddressLww(
    addressStamp(pulled.couple.addressForMe, pulled.couple.addressForMeAt),
    addressStamp(now.couple?.addressForMe, now.couple?.addressForMeAt),
  );
  const coexistence = mergeCoexistenceLww(
    pulled.coexistence,
    now.coexistence,
  );
  const couple: CoupleIdentity = {
    ...pulled.couple,
    selfName: now.couple?.selfName || pulled.couple.selfName,
    selfColor: now.couple?.selfColor || pulled.couple.selfColor,
    addressForThem: addressForThem?.text ?? "",
    addressForThemAt: addressForThem?.updatedAt ?? "",
    addressForMe: addressForMe?.text ?? "",
    addressForMeAt: addressForMe?.updatedAt ?? "",
  };

  const pushed = await pushSelfSlice({
    inviteCode: args.inviteCode,
    couple,
    items,
    deletedItems,
    coexistence,
    baseUrl: args.baseUrl,
  });
  const error = !pushed.ok
    ? pushed.error
    : pushed.data.rejected
      ? "中继拒收，稍后重试"
      : pulled.error;
  const result: SyncOnceResult = {
    ...pulled,
    items,
    deletedItems,
    couple,
    coexistence,
    error,
    roomRev: pushed.ok ? pushed.data.rev : undefined,
  };
  if (!pushed.ok || depth >= 2) return result;

  const redirect = followRoomCode(
    args.inviteCode,
    pushed.data.members.find((m) => relayPersonId(m) === couple.memberId)?.redirect,
    null,
  );
  if (redirect) {
    return syncRoomOnceAt(
      {
        ...args,
        afterPull: undefined,
        inviteCode: redirect,
        couple: { ...couple, inviteCode: redirect },
        items,
        deletedItems,
        coexistence,
      },
      depth + 1,
    );
  }
  const other = otherPersonId(pushed.data.members, couple.memberId);
  if (other && other !== (couple.partnerMemberId || "")) {
    return syncRoomOnceAt(
      {
        ...args,
        afterPull: undefined,
        couple,
        items,
        deletedItems,
        coexistence,
      },
      depth + 1,
    );
  }
  return result;
}

/** 把「这个身份去了新房间」写进旧房间。日程推送不会清掉 redirect */
export async function publishRoomRedirect(args: {
  fromCode: string;
  toCode: string;
  couple: CoupleIdentity;
  items: ScheduleItem[];
  deletedItems?: Tombstones;
  coexistence?: SyncedCoexistence | null;
  baseUrl?: string | null;
}) {
  const fromCode = normalizeInviteCode(args.fromCode);
  const toCode = normalizeInviteCode(args.toCode);
  const couple: CoupleIdentity = {
    ...args.couple,
    inviteCode: toCode,
    bindingUpdatedAt: new Date().toISOString(),
  };
  const { payload, docRev, updatedAt } = await buildEncryptedSelfSlice(
    fromCode,
    couple,
    args.items,
    args.deletedItems,
    args.coexistence ?? null,
  );
  return pushMemberSlice({
    inviteCode: fromCode,
    memberId: args.couple.memberId,
    name: args.couple.selfName,
    color: args.couple.selfColor,
    payload,
    docRev,
    updatedAt,
    redirect: toCode,
    baseUrl: args.baseUrl,
  });
}
