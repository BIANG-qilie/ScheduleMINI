/** 配对结果先写在这里。配对实现不能从这份期望里读答案。 */

export const PHONE_CALL_TITLE = "手机通话" as const;

export function at(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
) {
  return new Date(year, month - 1, day, hour, minute, second, 0).getTime();
}

const day = {
  year: 2026,
  month: 10,
  day: 26,
} as const;

export function on26(hour: number, minute: number, second = 0) {
  return at(day.year, day.month, day.day, hour, minute, second);
}

export const ALLOWED = "+8613800138000";

export type FixtureEvent = {
  type: number;
  packageName: string;
  timestamp: number;
  label?: string;
};

export type FixtureCall = {
  date: number;
  durationSeconds: number;
  type: number;
  e164: string;
};

export type ExpectedSpan = {
  packageName: string;
  label: string;
  start: number;
  end: number;
};

export type ExpectedCue =
  | { kind: "call"; title: typeof PHONE_CALL_TITLE; start: number; end: number }
  | { kind: "app"; label: string; start: number; end: number };

const wechat = "com.tencent.mm";
const dialer = "com.android.dialer";
const incall = "com.android.incallui";

export const foregroundCases: {
  name: string;
  events: FixtureEvent[];
  queryTime: number;
  spans: ExpectedSpan[];
}[] = [
  {
    name: "still open at the query time",
    events: [
      { type: 1, packageName: wechat, timestamp: on26(9, 0), label: "微信" },
    ],
    queryTime: on26(9, 40),
    spans: [
      {
        packageName: wechat,
        label: "微信",
        start: on26(9, 0),
        end: on26(9, 40),
      },
    ],
  },
  {
    name: "type 2 ends the span",
    events: [
      { type: 2, packageName: wechat, timestamp: on26(9, 12), label: "微信" },
      { type: 1, packageName: wechat, timestamp: on26(9, 0), label: "微信" },
    ],
    queryTime: on26(18, 0),
    spans: [
      {
        packageName: wechat,
        label: "微信",
        start: on26(9, 0),
        end: on26(9, 12),
      },
    ],
  },
  {
    name: "events after the query time are ignored",
    events: [
      { type: 1, packageName: wechat, timestamp: on26(9, 0), label: "微信" },
      { type: 2, packageName: wechat, timestamp: on26(12, 0), label: "微信" },
      {
        type: 1,
        packageName: "com.android.chrome",
        timestamp: on26(11, 0),
        label: "Chrome",
      },
    ],
    queryTime: on26(10, 0),
    spans: [
      {
        packageName: wechat,
        label: "微信",
        start: on26(9, 0),
        end: on26(10, 0),
      },
    ],
  },
  {
    name: "screen off truncates an open span",
    events: [
      { type: 1, packageName: wechat, timestamp: on26(9, 0), label: "微信" },
      { type: 16, packageName: "", timestamp: on26(9, 5) },
    ],
    queryTime: on26(12, 0),
    spans: [
      {
        packageName: wechat,
        label: "微信",
        start: on26(9, 0),
        end: on26(9, 5),
      },
    ],
  },
  {
    name: "screen on truncates an open span",
    events: [
      { type: 1, packageName: wechat, timestamp: on26(8, 0), label: "微信" },
      { type: 15, packageName: "", timestamp: on26(8, 10) },
      { type: 1, packageName: wechat, timestamp: on26(8, 20), label: "微信" },
      { type: 2, packageName: wechat, timestamp: on26(8, 30), label: "微信" },
    ],
    queryTime: on26(12, 0),
    spans: [
      {
        packageName: wechat,
        label: "微信",
        start: on26(8, 0),
        end: on26(8, 10),
      },
      {
        packageName: wechat,
        label: "微信",
        start: on26(8, 20),
        end: on26(8, 30),
      },
    ],
  },
  {
    name: "keyguard shown truncates an open span",
    events: [
      { type: 1, packageName: wechat, timestamp: on26(22, 0), label: "微信" },
      { type: 17, packageName: "", timestamp: on26(22, 30) },
    ],
    queryTime: on26(23, 0),
    spans: [
      {
        packageName: wechat,
        label: "微信",
        start: on26(22, 0),
        end: on26(22, 30),
      },
    ],
  },
  {
    name: "shutdown truncates and startup does not resume the old app",
    events: [
      { type: 1, packageName: wechat, timestamp: on26(9, 0), label: "微信" },
      { type: 26, packageName: "", timestamp: on26(9, 20) },
      { type: 27, packageName: wechat, timestamp: on26(9, 25), label: "微信" },
    ],
    queryTime: on26(12, 0),
    spans: [
      {
        packageName: wechat,
        label: "微信",
        start: on26(9, 0),
        end: on26(9, 20),
      },
    ],
  },
  {
    name: "a later foreground start does not invent an end for the previous app",
    events: [
      { type: 1, packageName: wechat, timestamp: on26(9, 0), label: "微信" },
      {
        type: 1,
        packageName: "com.android.chrome",
        timestamp: on26(9, 30),
        label: "Chrome",
      },
    ],
    queryTime: on26(10, 0),
    spans: [
      {
        packageName: wechat,
        label: "微信",
        start: on26(9, 0),
        end: on26(10, 0),
      },
      {
        packageName: "com.android.chrome",
        label: "Chrome",
        start: on26(9, 30),
        end: on26(10, 0),
      },
    ],
  },
  {
    name: "a second type 1 for the same package does not split the span",
    events: [
      { type: 1, packageName: wechat, timestamp: on26(9, 0), label: "微信" },
      { type: 1, packageName: wechat, timestamp: on26(9, 5), label: "微信" },
      { type: 2, packageName: wechat, timestamp: on26(9, 10), label: "微信" },
    ],
    queryTime: on26(12, 0),
    spans: [
      {
        packageName: wechat,
        label: "微信",
        start: on26(9, 0),
        end: on26(9, 10),
      },
    ],
  },
];

const callStart = on26(15, 0);
const callGapStart = on26(15, 1, 10);

export const callCases = {
  allowlist: [ALLOWED],
  events: [
    { type: 1, packageName: dialer, timestamp: on26(15, 0), label: "电话" },
    { type: 2, packageName: dialer, timestamp: on26(15, 10), label: "电话" },
    { type: 1, packageName: incall, timestamp: on26(16, 0), label: "通话" },
    { type: 2, packageName: incall, timestamp: on26(16, 4), label: "通话" },
    { type: 1, packageName: wechat, timestamp: on26(14, 55), label: "微信" },
    { type: 2, packageName: wechat, timestamp: on26(15, 5), label: "微信" },
  ] satisfies FixtureEvent[],
  calls: [
    { date: callStart, durationSeconds: 40, type: 2, e164: ALLOWED },
    { date: callGapStart, durationSeconds: 25, type: 2, e164: ALLOWED },
    { date: on26(16, 1), durationSeconds: 60, type: 1, e164: ALLOWED },
    { date: on26(17, 0), durationSeconds: 0, type: 3, e164: ALLOWED },
    { date: on26(17, 5), durationSeconds: 0, type: 2, e164: ALLOWED },
    { date: on26(17, 8), durationSeconds: 12, type: 1, e164: "" },
    { date: on26(17, 20), durationSeconds: 30, type: 2, e164: "+16502530000" },
    { date: on26(17, 30), durationSeconds: 30, type: 2, e164: "+99913800138000" },
    { date: on26(17, 40), durationSeconds: 30, type: 2, e164: "13800138000" },
    { date: on26(18, 0), durationSeconds: 15, type: 5, e164: ALLOWED },
  ] satisfies FixtureCall[],
  queryTime: on26(20, 0),
  cues: [
    {
      kind: "app",
      label: "微信",
      start: on26(14, 55),
      end: on26(15, 5),
    },
    {
      kind: "call",
      title: PHONE_CALL_TITLE,
      start: callStart,
      end: callStart + 40_000,
    },
    {
      kind: "call",
      title: PHONE_CALL_TITLE,
      start: callGapStart,
      end: callGapStart + 25_000,
    },
    {
      kind: "call",
      title: PHONE_CALL_TITLE,
      start: on26(16, 1),
      end: on26(16, 1) + 60_000,
    },
  ] satisfies ExpectedCue[],
};

const launcher = "com.android.launcher3";
const systemUi = "com.android.systemui";
const selfPkg = "com.desktop.schedule";

/** 原始前台时段 → 短清单。筛选实现不能从这份期望里读答案。 */
export const shortlistCases: {
  name: string;
  spans: ExpectedSpan[];
  matchedCalls: { title: typeof PHONE_CALL_TITLE; start: number; end: number }[];
  existingOnce: { start: number; end: number }[];
  cues: ExpectedCue[];
}[] = [
  {
    name: "drops shell apps and this app",
    spans: [
      {
        packageName: launcher,
        label: "Launcher",
        start: on26(8, 0),
        end: on26(8, 40),
      },
      {
        packageName: systemUi,
        label: "System UI",
        start: on26(8, 10),
        end: on26(8, 25),
      },
      {
        packageName: selfPkg,
        label: "小日程",
        start: on26(8, 30),
        end: on26(9, 0),
      },
      {
        packageName: wechat,
        label: "微信",
        start: on26(9, 0),
        end: on26(9, 40),
      },
    ],
    matchedCalls: [],
    existingOnce: [],
    cues: [
      {
        kind: "app",
        label: "微信",
        start: on26(9, 0),
        end: on26(9, 40),
      },
    ],
  },
  {
    name: "drops a 10s flicker",
    spans: [
      {
        packageName: "com.android.chrome",
        label: "Chrome",
        start: on26(10, 0),
        end: on26(10, 0, 10),
      },
      {
        packageName: wechat,
        label: "微信",
        start: on26(10, 5),
        end: on26(10, 35),
      },
    ],
    matchedCalls: [],
    existingOnce: [],
    cues: [
      {
        kind: "app",
        label: "微信",
        start: on26(10, 5),
        end: on26(10, 35),
      },
    ],
  },
  {
    name: "merges same-app spans across a 2-minute gap",
    spans: [
      {
        packageName: wechat,
        label: "微信",
        start: on26(11, 0),
        end: on26(11, 10),
      },
      {
        packageName: wechat,
        label: "微信",
        start: on26(11, 12),
        end: on26(11, 25),
      },
    ],
    matchedCalls: [],
    existingOnce: [],
    cues: [
      {
        kind: "app",
        label: "微信",
        start: on26(11, 0),
        end: on26(11, 25),
      },
    ],
  },
  {
    name: "keeps a long WeChat span",
    spans: [
      {
        packageName: wechat,
        label: "微信",
        start: on26(14, 0),
        end: on26(15, 20),
      },
    ],
    matchedCalls: [],
    existingOnce: [],
    cues: [
      {
        kind: "app",
        label: "微信",
        start: on26(14, 0),
        end: on26(15, 20),
      },
    ],
  },
  {
    name: "drops a span that fully overlaps an existing once item",
    spans: [
      {
        packageName: wechat,
        label: "微信",
        start: on26(16, 0),
        end: on26(16, 30),
      },
      {
        packageName: "com.android.chrome",
        label: "Chrome",
        start: on26(17, 0),
        end: on26(17, 25),
      },
    ],
    matchedCalls: [],
    existingOnce: [{ start: on26(16, 0), end: on26(16, 30) }],
    cues: [
      {
        kind: "app",
        label: "Chrome",
        start: on26(17, 0),
        end: on26(17, 25),
      },
    ],
  },
];
