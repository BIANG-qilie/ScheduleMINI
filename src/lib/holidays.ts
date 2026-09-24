import chineseDays from "chinese-days";
import type { DayOverride } from "@/lib/config";

const {
  getDayDetail,
  isHoliday,
  isInLieu,
  isWorkday,
} = chineseDays as {
  getDayDetail: (date: string) => { date: string; work: boolean; name: string };
  isHoliday: (date: string) => boolean;
  isInLieu: (date: string) => boolean;
  isWorkday: (date: string) => boolean;
};

export type DayLabelKind =
  | "holiday"
  | "work-on-weekend"
  | "custom-off"
  | "custom-work"
  | "none";

export type DayLabel = {
  kind: DayLabelKind;
  name: string;
  rawName: string;
  /** 放假（含自定义放假、法定假）；工作周循环应跳过 */
  isOff: boolean;
};

function formatDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function extractChineseName(raw: string) {
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const chinese = parts.find((p) => /[\u4e00-\u9fff]/.test(p));
  return chinese ?? parts[0] ?? raw;
}

function calendarLabel(dateKey: string): DayLabel {
  let detail: { date: string; work: boolean; name: string } | null = null;
  try {
    detail = getDayDetail(dateKey);
  } catch {
    detail = null;
  }

  const rawName = detail?.name ?? "";
  const name = rawName ? extractChineseName(rawName) : "";
  const date = new Date(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
    12,
    0,
    0,
    0,
  );
  const weekend = date.getDay() === 0 || date.getDay() === 6;

  try {
    if (isHoliday(dateKey) && !isWorkday(dateKey)) {
      return {
        kind: "holiday",
        name: name || "法定节假日",
        rawName,
        isOff: true,
      };
    }
    if (weekend && isWorkday(dateKey)) {
      return {
        kind: "work-on-weekend",
        name: name ? `${name}·调休上班` : "调休上班",
        rawName,
        isOff: false,
      };
    }
    if (isInLieu(dateKey) && name) {
      return {
        kind: "holiday",
        name,
        rawName,
        isOff: true,
      };
    }
  } catch {
    // 缺年时降级
  }

  return { kind: "none", name: "", rawName, isOff: false };
}

/** 数据覆盖的大致年份范围（随 chinese-days 升级更新） */
export const HOLIDAY_DATA_YEARS = "2004–2027";

/**
 * 合并手动覆盖与 chinese-days：
 * override off → 放假；override work → 上班；否则用日历。
 */
export function resolveDayState(
  dateKey: string,
  overrides: Record<string, DayOverride> = {},
): DayLabel {
  const override = overrides[dateKey];
  const base = calendarLabel(dateKey);

  if (override === "off") {
    return {
      kind: "custom-off",
      name: base.name || "自定义放假",
      rawName: base.rawName,
      isOff: true,
    };
  }
  if (override === "work") {
    return {
      kind: "custom-work",
      name: base.name ? `${base.name}·上班` : "自定义上班",
      rawName: base.rawName,
      isOff: false,
    };
  }
  return base;
}

export function getTodayLabel(
  date = new Date(),
  overrides: Record<string, DayOverride> = {},
): DayLabel {
  return resolveDayState(formatDate(date), overrides);
}

export function isDayOff(
  dateKey: string,
  overrides: Record<string, DayOverride> = {},
) {
  return resolveDayState(dateKey, overrides).isOff;
}
