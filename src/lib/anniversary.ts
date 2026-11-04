import { formatDateKey, parseDateKey, type Anniversary } from "@/lib/config";

export type { Anniversary };

export type AnniversaryReading = {
  /** 展示页只放这一句。 */
  sentence: string;
  listTitle: string;
  listAside: string;
  today: boolean;
  /** 距目标日的整天数。当天是 0。 */
  days: number;
  /** 按年循环的次数。起始日是第 0 次。不循环时是 null。 */
  index: number | null;
};

export function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysBetween(fromKey: string, toKey: string) {
  const from = parseDateKey(fromKey).getTime();
  const to = parseDateKey(toKey).getTime();
  return Math.round((to - from) / 86_400_000);
}

function parts(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

/** 第 index 次出现的日期。2 月 29 日跳过非闰年。 */
export function yearlyOccurrenceDate(startKey: string, index: number) {
  const { year, month, day } = parts(startKey);
  if (index < 0) return null;
  if (month === 2 && day === 29) {
    if (!isLeapYear(year)) return null;
    let y = year;
    let seen = 0;
    while (seen < index) {
      y += 1;
      if (isLeapYear(y)) seen += 1;
      if (y > year + 800) return null;
    }
    return formatDateKey(new Date(y, 1, 29));
  }
  return formatDateKey(new Date(year + index, month - 1, day));
}

function upcomingYearly(startKey: string, todayKey: string) {
  for (let index = 0; index < 400; index += 1) {
    const date = yearlyOccurrenceDate(startKey, index);
    if (!date) return null;
    if (date >= todayKey) return { index, date };
  }
  return null;
}

/**
 * 不循环：xxx 距今 N 天 / xxx 还有 N 天 / xxx 就是今天。
 * 按年：第 x 次 xxx 还要 N 天，或当天的 今天就是第 x 次 xxx。两句不同时出现。
 */
export function readAnniversary(
  item: Pick<Anniversary, "name" | "date" | "yearly">,
  todayKey: string,
): AnniversaryReading {
  const name = item.name.trim();
  if (!item.yearly) {
    if (item.date === todayKey) {
      return {
        sentence: `${name} 就是今天`,
        listTitle: name,
        listAside: "就是今天",
        today: true,
        days: 0,
        index: null,
      };
    }
    if (item.date < todayKey) {
      const days = daysBetween(item.date, todayKey);
      return {
        sentence: `${name} 距今 ${days} 天`,
        listTitle: name,
        listAside: `距今 ${days} 天`,
        today: false,
        days,
        index: null,
      };
    }
    const days = daysBetween(todayKey, item.date);
    return {
      sentence: `${name} 还有 ${days} 天`,
      listTitle: name,
      listAside: `还有 ${days} 天`,
      today: false,
      days,
      index: null,
    };
  }

  const next = upcomingYearly(item.date, todayKey);
  const index = next?.index ?? 0;
  const date = next?.date ?? item.date;
  if (date === todayKey) {
    return {
      sentence: `今天就是第 ${index} 次 ${name}`,
      listTitle: `第 ${index} 次 ${name}`,
      listAside: "就是今天",
      today: true,
      days: 0,
      index,
    };
  }
  const days = Math.max(0, daysBetween(todayKey, date));
  return {
    sentence: `第 ${index} 次 ${name} 还要 ${days} 天`,
    listTitle: `第 ${index} 次 ${name}`,
    listAside: `还要 ${days} 天`,
    today: false,
    days,
    index,
  };
}
