import { describe, expect, it } from "vitest";
import {
  readAnniversary,
  yearlyOccurrenceDate,
} from "@/lib/anniversary";

const name = "结婚纪念日";

describe("anniversary sentences", () => {
  it("uses one past, future, or today sentence when it does not repeat", () => {
    expect(
      readAnniversary({ name, date: "2026-11-01", yearly: false }, "2026-11-04"),
    ).toMatchObject({
      sentence: "结婚纪念日 距今 3 天",
      listAside: "距今 3 天",
      today: false,
      index: null,
    });
    expect(
      readAnniversary({ name: "旅行", date: "2026-11-07", yearly: false }, "2026-11-04"),
    ).toMatchObject({
      sentence: "旅行 还有 3 天",
      listAside: "还有 3 天",
    });
    const today = readAnniversary(
      { name: "见面", date: "2026-11-04", yearly: false },
      "2026-11-04",
    );
    expect(today.sentence).toBe("见面 就是今天");
    expect(today.sentence.includes("距今")).toBe(false);
    expect(today.sentence.includes("还有")).toBe(false);
  });

  it("counts the start date as 第 0 次 and the next occurrence as x", () => {
    const onStart = readAnniversary(
      { name, date: "2018-11-04", yearly: true },
      "2018-11-04",
    );
    expect(onStart.sentence).toBe("今天就是第 0 次 结婚纪念日");
    expect(onStart.sentence.includes("还要")).toBe(false);

    const eighth = readAnniversary(
      { name, date: "2018-11-04", yearly: true },
      "2026-05-10",
    );
    expect(eighth.index).toBe(8);
    expect(eighth.days).toBe(178);
    expect(eighth.sentence).toBe("第 8 次 结婚纪念日 还要 178 天");
    expect(eighth.listTitle).toBe("第 8 次 结婚纪念日");
    expect(eighth.listAside).toBe("还要 178 天");
    expect(eighth.sentence.includes("今天就是")).toBe(false);

    const onEighth = readAnniversary(
      { name, date: "2018-11-04", yearly: true },
      "2026-11-04",
    );
    expect(onEighth.sentence).toBe("今天就是第 8 次 结婚纪念日");
    expect(onEighth.sentence.includes("还要")).toBe(false);
    expect(onEighth.sentence.split("\n")).toHaveLength(1);
  });

  it("places Feb 29 only on leap years", () => {
    expect(yearlyOccurrenceDate("2024-02-29", 0)).toBe("2024-02-29");
    expect(yearlyOccurrenceDate("2024-02-29", 1)).toBe("2028-02-29");
    expect(yearlyOccurrenceDate("2024-02-29", 2)).toBe("2032-02-29");
    for (const year of [2025, 2026, 2027]) {
      expect(yearlyOccurrenceDate("2024-02-29", 1)).not.toBe(`${year}-02-29`);
    }

    const before = readAnniversary(
      { name: "闰日", date: "2024-02-29", yearly: true },
      "2027-01-01",
    );
    expect(before.index).toBe(1);
    expect(before.sentence.startsWith("第 1 次 闰日 还要 ")).toBe(true);
    expect(before.sentence.includes("今天就是")).toBe(false);

    const onLeap = readAnniversary(
      { name: "闰日", date: "2024-02-29", yearly: true },
      "2028-02-29",
    );
    expect(onLeap.sentence).toBe("今天就是第 1 次 闰日");
    expect(onLeap.sentence.includes("还要")).toBe(false);
  });
});
