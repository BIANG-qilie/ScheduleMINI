import chineseDays from "chinese-days";

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

export type DayLabelKind = "holiday" | "work-on-weekend" | "none";

export type DayLabel = {
  kind: DayLabelKind;
  name: string;
  rawName: string;
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

/** 数据覆盖的大致年份范围（随 chinese-days 升级更新） */
export const HOLIDAY_DATA_YEARS = "2004–2027";

export function getTodayLabel(date = new Date()): DayLabel {
  const key = formatDate(date);
  let detail: { date: string; work: boolean; name: string } | null = null;
  try {
    detail = getDayDetail(key);
  } catch {
    detail = null;
  }

  const rawName = detail?.name ?? "";
  const name = rawName ? extractChineseName(rawName) : "";
  const dow = date.getDay();
  const weekend = dow === 0 || dow === 6;

  try {
    if (isHoliday(key) && !isWorkday(key)) {
      return {
        kind: "holiday",
        name: name || "法定节假日",
        rawName,
      };
    }
    if (weekend && isWorkday(key)) {
      return {
        kind: "work-on-weekend",
        name: name ? `${name}·调休上班` : "调休上班",
        rawName,
      };
    }
    if (isInLieu(key) && name) {
      return {
        kind: "holiday",
        name,
        rawName,
      };
    }
  } catch {
    // 缺年时降级为无标签
  }

  return { kind: "none", name: "", rawName };
}
