import { at } from "@/lib/day-replay.fixtures";

/**
 * 另记的一天。配对实现不引用这个文件，也不按这里的边界改阈值。
 * 微信的结束，纸上写 09:30，系统事件是 09:32。
 * 19:40 那通记得清，号码末尾和名单撞车，但不是同一个 E.164，应当拒绝。
 */
const y = 2026;
const m = 10;
const d = 21;

export function heldOutAt(hour: number, minute: number, second = 0) {
  return at(y, m, d, hour, minute, second);
}

export const heldOutAllowlist = ["+8613800138000"] as const;

const wechatEndEvent = heldOutAt(9, 32);

export const heldOutDay = {
  queryTime: heldOutAt(23, 0),
  allowlist: heldOutAllowlist,
  events: [
    {
      type: 1,
      packageName: "com.tencent.mm",
      timestamp: heldOutAt(9, 0),
      label: "微信",
    },
    {
      type: 2,
      packageName: "com.tencent.mm",
      timestamp: wechatEndEvent,
      label: "微信",
    },
    {
      type: 1,
      packageName: "com.android.chrome",
      timestamp: heldOutAt(10, 0),
      label: "Chrome",
    },
    {
      type: 2,
      packageName: "com.android.chrome",
      timestamp: heldOutAt(10, 20),
      label: "Chrome",
    },
    {
      type: 1,
      packageName: "com.android.dialer",
      timestamp: heldOutAt(11, 0),
      label: "电话",
    },
    {
      type: 2,
      packageName: "com.android.dialer",
      timestamp: heldOutAt(11, 5),
      label: "电话",
    },
  ],
  calls: [
    {
      date: heldOutAt(11, 1),
      durationSeconds: 120,
      type: 2,
      e164: "+8613800138000",
    },
    {
      date: heldOutAt(14, 0),
      durationSeconds: 180,
      type: 2,
      e164: "+8613800138000",
    },
    {
      date: heldOutAt(16, 10),
      durationSeconds: 90,
      type: 1,
      e164: "+8613800138000",
    },
    {
      date: heldOutAt(19, 40),
      durationSeconds: 45,
      type: 2,
      e164: "+99913800138000",
    },
  ],
  rememberedCalls: [
    { start: heldOutAt(14, 0), refused: false },
    { start: heldOutAt(16, 10), refused: false },
    { start: heldOutAt(19, 40), refused: true },
  ],
  foregroundNotes: [
    {
      packageName: "com.tencent.mm",
      eventStart: heldOutAt(9, 0),
      notedStart: heldOutAt(9, 0),
      notedEnd: heldOutAt(9, 30),
      eventEnd: wechatEndEvent,
    },
    {
      packageName: "com.android.chrome",
      eventStart: heldOutAt(10, 0),
      notedStart: heldOutAt(10, 0),
      notedEnd: heldOutAt(10, 20),
      eventEnd: heldOutAt(10, 20),
    },
  ],
};
