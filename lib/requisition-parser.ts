import * as XLSX from "xlsx";
import { fixThaiEncoding } from "@/lib/excel-validator";

export interface ParsedRequisitionRow {
  rowNumber: number;
  requisitionNo: string;   // Col B: Reference
  requestDate: string;     // ISO YYYY-MM-DD (forward-filled from Col C)
  requestDateText: string; // ข้อความวันที่ เช่น "16 พ.ย. 69"
  dateFilled: boolean;     // true ถ้าถูกเติมจากแถวก่อนหน้า
  department: string;      // Col D
  suf: number | null;      // Col E
  action: string;          // Col F: Act
  code: string;            // Col G: Check List Issue
  description: string | null; // Col H
  unit: string | null;     // Col I
  qtyRequist: number;      // Col J: Page -x of x
}

export interface RequisitionParseResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sheetName: string;
  rows: ParsedRequisitionRow[];
  summary: {
    totalRows: number;
    filledDateRows: number;
    uniqueDates: string[];
    uniqueRequisitions: number;
    uniqueDepartments: number;
    uniqueActions: string[];
    totalQty: number;
  };
}

const THAI_MONTHS: Record<string, number> = {
  "ม.ค.": 1, "มกราคม": 1, "มค": 1,
  "ก.พ.": 2, "กุมภาพันธ์": 2, "กพ": 2,
  "มี.ค.": 3, "มีนาคม": 3, "มีค": 3,
  "เม.ย.": 4, "เมษายน": 4, "เมย": 4,
  "พ.ค.": 5, "พฤษภาคม": 5, "พค": 5,
  "มิ.ย.": 6, "มิถุนายน": 6, "มิย": 6,
  "ก.ค.": 7, "กรกฎาคม": 7, "กค": 7,
  "ส.ค.": 8, "สิงหาคม": 8, "สค": 8,
  "ก.ย.": 9, "กันยายน": 9, "กย": 9,
  "ต.ค.": 10, "ตุลาคม": 10, "ตค": 10,
  "พ.ย.": 11, "พฤศจิกายน": 11, "พย": 11,
  "ธ.ค.": 12, "ธันวาคม": 12, "ธค": 12,
};

const THAI_MONTH_LABELS = [
  "", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const clean = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  return (typeof v === "string" ? fixThaiEncoding(v) : String(v)).trim();
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** แปลงวันที่เป็น YYYY-MM-DD และรูปแบบข้อความไทย เช่น "16 พ.ย. 69" */
export function parseThaiOrExcelDate(raw: unknown): { iso: string; text: string } | null {
  if (raw === null || raw === undefined || raw === "") return null;

  // 1. Excel serial date number
  if (typeof raw === "number" && raw > 20000 && raw < 80000) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      let y = parsed.y;
      if (y > 2400) y -= 543;
      const iso = `${y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
      const beShort = String((y + 543) % 100).padStart(2, "0");
      return { iso, text: `${parsed.d} ${THAI_MONTH_LABELS[parsed.m]} ${beShort}` };
    }
  }

  const s = clean(raw);
  if (!s) return null;

  // 2. รูปแบบไทย เช่น "16 พ.ย. 69" หรือ "16 พฤศจิกายน 2569"
  const thaiMatch = s.match(/^(\d{1,2})\s*([ก-๙.]+)\s*(\d{2,4})$/);
  if (thaiMatch) {
    const day = Number(thaiMatch[1]);
    const monthKey = thaiMatch[2].trim();
    const month = THAI_MONTHS[monthKey] || THAI_MONTHS[monthKey.replace(/\./g, "")];
    let year = Number(thaiMatch[3]);
    if (month && day >= 1 && day <= 31) {
      if (year < 100) {
        // ปี พ.ศ. 2 หลัก เช่น 69 -> 2569 -> ค.ศ. 2026
        year = 2500 + year - 543;
      } else if (year > 2400) {
        year -= 543;
      }
      return { iso: `${year}-${pad2(month)}-${pad2(day)}`, text: s };
    }
  }

  // 3. รูปแบบ ISO YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    let year = Number(isoMatch[1]);
    if (year > 2400) year -= 543;
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const beShort = String((year + 543) % 100).padStart(2, "0");
      return { iso: `${year}-${pad2(m)}-${pad2(d)}`, text: `${d} ${THAI_MONTH_LABELS[m]} ${beShort}` };
    }
  }

  // 4. รูปแบบ DD/MM/YYYY หรือ DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    let year = Number(dmyMatch[3]);
    if (year < 100) year = 2500 + year - 543;
    else if (year > 2400) year -= 543;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const beShort = String((year + 543) % 100).padStart(2, "0");
      return { iso: `${year}-${pad2(m)}-${pad2(d)}`, text: `${d} ${THAI_MONTH_LABELS[m]} ${beShort}` };
    }
  }

  return null;
}

/**
 * ตรวจสอบโครงสร้างไฟล์และแปลงข้อมูลการเบิกหน่วยงานรายวัน
 * ไม่สนใจชื่อไฟล์ — ตรวจสอบจากโครงสร้างหัวคอลัมน์เท่านั้น:
 * - Col B (1): Reference
 * - Col C (2): Date
 * - Col D (3): โรงพยาบาลวิชัยเวชฯ (department)
 * - Col E (4): Suf
 * - Col F (5): Act
 * - Col G (6): Check List Issue (code)
 * - Col J (9): Page -x of x (qty_requist)
 */
export function parseRequisitionWorkbook(data: ArrayBuffer | Uint8Array): RequisitionParseResult {
  const emptySummary = {
    totalRows: 0,
    filledDateRows: 0,
    uniqueDates: [],
    uniqueRequisitions: 0,
    uniqueDepartments: 0,
    uniqueActions: [],
    totalQty: 0,
  };

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data instanceof Uint8Array ? data : new Uint8Array(data), {
      type: "array",
      codepage: 874,
    });
  } catch (err: any) {
    return {
      valid: false,
      errors: ["ไม่สามารถเปิดอ่านไฟล์ Excel ได้: " + (err?.message || "รูปแบบไฟล์ไม่ถูกต้อง")],
      warnings: [],
      sheetName: "",
      rows: [],
      summary: emptySummary,
    };
  }

  const sheetName = wb.SheetNames[0] || "";
  if (!sheetName) {
    return {
      valid: false,
      errors: ["ไม่พบชีตข้อมูลในไฟล์"],
      warnings: [],
      sheetName: "",
      rows: [],
      summary: emptySummary,
    };
  }

  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
  });

  if (rawRows.length < 2) {
    return {
      valid: false,
      errors: ["ไฟล์ไม่มีข้อมูล (ต้องมีหัวตารางและอย่างน้อย 1 แถวข้อมูล)"],
      warnings: [],
      sheetName: fixThaiEncoding(sheetName),
      rows: [],
      summary: emptySummary,
    };
  }

  // ---- 1. ตรวจสอบโครงสร้างหัวคอลัมน์ (Strict Structure Validation) ----
  const header = (rawRows[0] || []).map(clean);
  const errors: string[] = [];

  if (header.length < 10) {
    errors.push(`จำนวนคอลัมน์ไม่ครบ (พบ ${header.length} คอลัมน์ ต้องมีอย่างน้อย 10 คอลัมน์ A-J)`);
  }

  const hB = (header[1] || "").toLowerCase();
  const hC = (header[2] || "").toLowerCase();
  const hD = header[3] || "";
  const hE = (header[4] || "").toLowerCase();
  const hF = (header[5] || "").toLowerCase();
  const hG = (header[6] || "").toLowerCase();
  const hJ = (header[9] || "").toLowerCase();

  if (!hB.includes("reference")) {
    errors.push(`คอลัมน์ B ต้องเป็น "Reference" (พบ: "${header[1] || "ว่าง"}")`);
  }
  if (!hC.includes("date")) {
    errors.push(`คอลัมน์ C ต้องเป็น "Date" (พบ: "${header[2] || "ว่าง"}")`);
  }
  if (!hD) {
    errors.push(`คอลัมน์ D ต้องมีหัวคอลัมน์หน่วยงาน/โรงพยาบาล (พบค่าว่าง)`);
  }
  if (!hE.includes("suf")) {
    errors.push(`คอลัมน์ E ต้องเป็น "Suf" (พบ: "${header[4] || "ว่าง"}")`);
  }
  if (!hF.includes("act")) {
    errors.push(`คอลัมน์ F ต้องเป็น "Act" (พบ: "${header[5] || "ว่าง"}")`);
  }
  if (!hG.includes("check list issue")) {
    errors.push(`คอลัมน์ G ต้องเป็น "Check List Issue" (พบ: "${header[6] || "ว่าง"}")`);
  }
  if (!hJ.includes("page")) {
    errors.push(`คอลัมน์ J ต้องเป็น "Page -x of x" (พบ: "${header[9] || "ว่าง"}")`);
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings: [],
      sheetName: fixThaiEncoding(sheetName),
      rows: [],
      summary: emptySummary,
    };
  }

  // ---- 2. อ่านข้อมูลแต่ละแถว พร้อมเติมวันที่จากแถวก่อนหน้าล่าสุด ----
  const warnings: string[] = [];
  const parsedRows: ParsedRequisitionRow[] = [];
  let lastDate: { iso: string; text: string } | null = null;
  let filledDateRows = 0;

  for (let i = 1; i < rawRows.length; i++) {
    const r = rawRows[i] || [];
    const rowNumber = i + 1;
    const requisitionNo = clean(r[1]);
    const rawDate = r[2];
    const department = clean(r[3]);
    const sufRaw = clean(r[4]);
    const action = clean(r[5]);
    const code = clean(r[6]);
    const description = clean(r[7]) || null;
    const unit = clean(r[8]) || null;
    const qtyRaw = r[9];

    // ข้ามแถวว่างหรือแถวสรุปท้ายตารางที่ไม่มีทั้งเลขที่ใบเบิกและรหัสสินค้า
    if (!requisitionNo && !code) continue;

    // ตรวจสอบและเติมวันที่จากแถวที่มีข้อมูลก่อนหน้าล่าสุด
    let rowDate = parseThaiOrExcelDate(rawDate);
    let dateFilled = false;
    if (rowDate) {
      lastDate = rowDate;
    } else if (clean(rawDate)) {
      warnings.push(`แถว ${rowNumber}: รูปแบบวันที่ "${clean(rawDate)}" ไม่ถูกต้อง`);
      rowDate = lastDate;
      dateFilled = Boolean(lastDate);
    } else if (lastDate) {
      rowDate = lastDate;
      dateFilled = true;
      filledDateRows++;
    }

    if (!rowDate) {
      errors.push(`แถว ${rowNumber}: ไม่พบวันที่ขอเบิก (คอลัมน์ C) และไม่มีวันที่จากแถวก่อนหน้า`);
      continue;
    }
    if (!requisitionNo) {
      warnings.push(`แถว ${rowNumber}: ไม่มีเลขที่ใบเบิก (Reference) — ข้าม`);
      continue;
    }
    if (!code) {
      warnings.push(`แถว ${rowNumber}: ไม่มีรหัสสินค้า (Check List Issue) — ข้าม`);
      continue;
    }

    const qtyNum = Number(String(qtyRaw ?? "").replace(/,/g, "").trim());
    if (!Number.isFinite(qtyNum)) {
      warnings.push(`แถว ${rowNumber}: จำนวนขอเบิก "${clean(qtyRaw)}" ไม่ใช่ตัวเลข (ใช้ 0)`);
    }

    const sufNum = sufRaw && /^\d+$/.test(sufRaw) ? Number(sufRaw) : null;

    parsedRows.push({
      rowNumber,
      requisitionNo,
      requestDate: rowDate.iso,
      requestDateText: rowDate.text,
      dateFilled,
      department: department || "-",
      suf: sufNum,
      action: action || "-",
      code,
      description,
      unit,
      qtyRequist: Number.isFinite(qtyNum) ? qtyNum : 0,
    });
  }

  if (parsedRows.length === 0) {
    errors.push("ไม่พบแถวข้อมูลการเบิกที่สมบูรณ์ในไฟล์");
  }

  const uniqueDates = [...new Set(parsedRows.map((r) => r.requestDate))].sort();
  const uniqueRequisitions = new Set(parsedRows.map((r) => r.requisitionNo)).size;
  const uniqueDepartments = new Set(parsedRows.map((r) => r.department)).size;
  const uniqueActions = [...new Set(parsedRows.map((r) => r.action))].sort();
  const totalQty = parsedRows.reduce((s, r) => s + r.qtyRequist, 0);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sheetName: fixThaiEncoding(sheetName),
    rows: parsedRows,
    summary: {
      totalRows: parsedRows.length,
      filledDateRows,
      uniqueDates,
      uniqueRequisitions,
      uniqueDepartments,
      uniqueActions,
      totalQty,
    },
  };
}
