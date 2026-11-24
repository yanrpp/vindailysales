/** ช่วงเดือนแสดงปริมาณการใช้ (พ.ศ.) */

export const THAI_MONTH_NAMES = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

export type BuddhistMonth = { year: number; month: number }; // month 1-12

export function toBuddhistMonth(date = new Date()): BuddhistMonth {
  return {
    year: date.getFullYear() + 543,
    month: date.getMonth() + 1,
  };
}

export function formatBuddhistMonthLabel(ym: BuddhistMonth): string {
  return `${THAI_MONTH_NAMES[ym.month - 1]} ${ym.year}`;
}

export function parseBuddhistMonthLabel(label: string): BuddhistMonth | null {
  const s = String(label || "").trim();
  const idx = THAI_MONTH_NAMES.findIndex((name) => s.startsWith(name));
  if (idx < 0) return null;
  const year = parseInt(s.slice(THAI_MONTH_NAMES[idx].length).trim(), 10);
  if (!year || year < 2400) return null;
  return { year, month: idx + 1 };
}

/** ถอยหลัง n เดือนจากจุดสิ้นสุด (รวมเดือนสิ้นสุด) */
export function buildMonthRangeBack(end: BuddhistMonth, count: number): BuddhistMonth[] {
  const n = Math.max(1, Math.min(24, count));
  const result: BuddhistMonth[] = [];
  let y = end.year;
  let m = end.month;
  for (let i = 0; i < n; i++) {
    result.unshift({ year: y, month: m });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return result;
}

/** ดีฟอลต์: 3 เดือนล่าสุด (ถอยจากเดือนปัจจุบัน) */
export function defaultUsageMonthRange(count = 3): {
  end: BuddhistMonth;
  months: BuddhistMonth[];
  labels: string[];
} {
  const end = toBuddhistMonth();
  const months = buildMonthRangeBack(end, count);
  return {
    end,
    months,
    labels: months.map(formatBuddhistMonthLabel),
  };
}

/** ตัวเลือกเดือนสิ้นสุด: ย้อนหลัง 18 เดือนจากปัจจุบัน */
export function usageEndMonthOptions(span = 18): BuddhistMonth[] {
  const end = toBuddhistMonth();
  return buildMonthRangeBack(end, span).reverse();
}

/**
 * จัดค่าปริมาณการใช้ให้ตรงหัวคอลัมน์ช่วงที่เลือก
 * เดือนที่ไม่มีในไฟล์นำเข้า → null (UI แสดง "-")
 */
export function alignUsageMonthsToLabels(
  displayLabels: string[],
  sourceLabels: string[] | null | undefined,
  sourceValues: (number | null | undefined)[] | null | undefined
): (number | null)[] {
  const map = new Map<string, number | null>();
  const labels = Array.isArray(sourceLabels) ? sourceLabels : [];
  const values = Array.isArray(sourceValues) ? sourceValues : [];
  labels.forEach((label, i) => {
    const v = values[i];
    map.set(label, v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v));
  });
  return displayLabels.map((label) => (map.has(label) ? map.get(label)! : null));
}

/**
 * คำนวณ MAX / AVG จากช่วงเดือนที่เลือก
 * - เดือนสุดท้ายใช้ thisMonthUsage (ตัด+ขาย)
 * - เดือนอื่นใช้ค่าจากไฟล์ปริมาณการใช้ (ไม่มีค่า = 0)
 */
export function computeMaxAvgFromMonthWindow(
  displayLabels: string[],
  sourceLabels: string[] | null | undefined,
  sourceValues: (number | null | undefined)[] | null | undefined,
  thisMonthUsage: number | null | undefined
): { maxUsage: number; avgUsage: number; windowValues: number[] } {
  const aligned = alignUsageMonthsToLabels(displayLabels, sourceLabels, sourceValues);
  const windowValues = displayLabels.map((_, i) => {
    const isLast = i === displayLabels.length - 1;
    if (isLast) {
      const v = thisMonthUsage;
      return v === null || v === undefined || Number.isNaN(Number(v)) ? 0 : Number(v);
    }
    const v = aligned[i];
    return v === null || v === undefined || Number.isNaN(Number(v)) ? 0 : Number(v);
  });
  const maxUsage = windowValues.length ? Math.max(...windowValues) : 0;
  const avgUsage = windowValues.length
    ? Number((windowValues.reduce((a, b) => a + b, 0) / windowValues.length).toFixed(2))
    : 0;
  return { maxUsage, avgUsage, windowValues };
}
