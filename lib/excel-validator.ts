import * as xlsx from "xlsx";

export type InventoryFileType = "BALANCE" | "DISPENSE" | "SALE" | "USAGE";

export interface ValidationError {
  row?: number;
  column?: string;
  message: string;
  severity: "error" | "warning";
}

export interface BalanceItemParsed {
  itemCode: string;
  itemName: string | null;
  unit: string | null;
  balanceQty: number | null;
  minQty: number | null;
  unitPrice: number | null;
  totalCost: number | null;
}

export interface DispenseItemParsed {
  itemCode: string;
  itemName: string | null;
  unit: string | null;
  rawQty: number;
  adjustedQty: number; // Formula: (rawQty / 3) + rawQty
  unitPrice: number | null;
  totalCost: number | null;
}

export interface SaleItemParsed {
  itemCode: string;
  itemName: string | null;
  unit: string | null;
  rawQty: number | null;
  adjustedQty: number | null; // Formula: (rawQty / 3) + rawQty
  saleAmount: number | null;
  costAmount: number | null;
}

export interface UsageItemParsed {
  itemCode: string;
  itemName: string | null;
  unit: string | null;
  balanceQty?: number | null; // จำนวนคงเหลือ (Col E จาก Sheet เหลือ)
  minQty?: number | null;     // จุดสั่งซื้อ MIN (Col F จาก Sheet เหลือ)
  usageMonth1: number | null; // legacy
  usageMonth2: number | null; // legacy
  usageMonth3: number | null; // legacy
  /** ค่าทุกคอลัมน์เดือนตามหัวในไฟล์ */
  usageMonths?: (number | null)[];
  maxUsage?: number | null;
  avgUsage?: number | null;
  category: string | null;    // หมวด
  supplier: string | null;    // บริษัทคู่ค้า
}

export interface ValidationResult {
  fileType: InventoryFileType;
  isValid: boolean;
  sheetName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: ValidationError[];
  warnings: ValidationError[];
  previewRows: any[];
  parsedData: any[];
  /** หัวคอลัมน์เดือนจากไฟล์ เช่น ["กันยายน 2569","ตุลาคม 2569"] */
  usageMonthLabels?: string[];
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** หาปี พ.ศ. จากข้อความในไฟล์ เช่น "30 ก.ย. 2569" / "กันยายน 2569" */
export function inferBuddhistYearFromWorkbook(wb: xlsx.WorkBook): number | null {
  // จับปีในบริบทวันที่/เดือนไทย หรือรูปแบบ เดือน/ปี
  const contextRe =
    /(?:พ\.?\s*ศ\.?|ม\.?ค\.|ก\.?พ\.|มี\.?ค\.|เม\.?ย\.|พ\.?ค\.|มิ\.?ย\.|ก\.?ค\.|ส\.?ค\.|ก\.?ย\.|ต\.?ค\.|พ\.?ย\.|ธ\.?ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|[\/\-.])\s*(25[5-9]\d)\b|(25[5-9]\d)\s*ปี|\/\s*(25[5-9]\d)\b/i;
  const plainRe = /\b(25[5-9]\d)\b/g;
  const scored = new Map<number, number>();

  const bump = (y: number, w: number) => scored.set(y, (scored.get(y) || 0) + w);

  for (const name of wb.SheetNames.slice(0, 12)) {
    const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const row = rows[r] || [];
      for (let c = 0; c < Math.min(14, row.length); c++) {
        const cell = row[c];
        if (cell === null || cell === undefined || typeof cell === "number") continue;
        const text = String(cell);
        const ctx = text.match(contextRe);
        if (ctx) {
          const y = parseInt(ctx[1] || ctx[2] || ctx[3], 10);
          if (y >= 2550 && y <= 2599) bump(y, 5);
        }
        let m: RegExpExecArray | null;
        plainRe.lastIndex = 0;
        while ((m = plainRe.exec(text)) !== null) {
          const y = parseInt(m[1], 10);
          if (y >= 2550 && y <= 2599) bump(y, 1);
        }
      }
    }
  }

  if (scored.size === 0) return null;
  // เลือกปีที่คะแนนสูงสุด ถ้าเสมอกันใช้ปีล่าสุด
  let bestYear = 0;
  let bestScore = -1;
  for (const [y, s] of scored) {
    if (s > bestScore || (s === bestScore && y > bestYear)) {
      bestYear = y;
      bestScore = s;
    }
  }
  return bestYear || null;
}

/** ปี พ.ศ. ปัจจุบัน (fallback) */
export function currentBuddhistYear(): number {
  return new Date().getFullYear() + 543;
}

/**
 * ตรวจหัวคอลัมน์เดือน เช่น
 * - "9/2569", "9-2569", "09/2569'"
 * - ตัวเลขเดือนอย่างเดียว 9 (ปีจาก yearHint)
 */
export function parseMonthHeaderRaw(
  raw: any,
  yearHint?: number | null
): { month: number; year: number } | null {
  if (raw === null || raw === undefined || raw === "") return null;

  // ตัวเลขเดือนล้วน (Excel มักเก็บหัวคอลัมน์เป็น 8, 9 แทน 8/2569)
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const month = Math.trunc(raw);
    if (month >= 1 && month <= 12) {
      const year = yearHint && yearHint >= 2400 ? yearHint : currentBuddhistYear();
      return { month, year };
    }
    return null;
  }

  const s = String(raw).trim().replace(/['"]/g, "");
  // 9/2569 หรือ 9-2569
  let m = s.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{4})$/);
  if (m) {
    const month = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);
    if (month < 1 || month > 12 || year < 2400) return null;
    return { month, year };
  }
  // 9/69 → ปี พ.ศ. สั้น
  m = s.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{2})$/);
  if (m) {
    const month = parseInt(m[1], 10);
    const year = 2500 + parseInt(m[2], 10);
    if (month < 1 || month > 12) return null;
    return { month, year };
  }
  // ข้อความเป็นเลขเดือนอย่างเดียว "9"
  m = s.match(/^(\d{1,2})$/);
  if (m) {
    const month = parseInt(m[1], 10);
    if (month < 1 || month > 12) return null;
    const year = yearHint && yearHint >= 2400 ? yearHint : currentBuddhistYear();
    return { month, year };
  }
  return null;
}

/** 9/2569 หรือ 9 → กันยายน 2569 */
export function formatThaiMonthHeader(raw: any, yearHint?: number | null): string | null {
  const parsed = parseMonthHeaderRaw(raw, yearHint);
  if (!parsed) return null;
  return `${THAI_MONTHS[parsed.month - 1]} ${parsed.year}`;
}

/**
 * แก้ปัญหาข้อความภาษาไทยเพี้ยน / ภาษาต่างดาว (Mojibake จาก Windows-874 / TIS-620)
 * เช่น '¡ÃÐ´ÒÉ¤ÍÁ¾ÔÇàµÍÃì' -> 'กระดาษคอมพิวเตอร์'
 */
export function fixThaiEncoding(text: any): string {
  if (text === null || text === undefined) return "";
  const str = String(text).trim();
  if (!str) return "";

  // ตรวจสอบว่ามีตัวอักษร mojibake ในช่วง 161 - 251 (0xA1 - 0xFB) หรือไม่
  let hasMojibake = false;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 161 && code <= 251) {
      hasMojibake = true;
      break;
    }
  }

  if (!hasMojibake) return str;

  try {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code <= 255) {
        bytes.push(code);
      } else {
        // หากมีตัวอักษรยูนิโค้ดอื่นผสมอยู่แล้ว ให้คืนค่าเดิมเพื่อไม่ให้ข้อความเสียหาย
        return str;
      }
    }
    const decoded = new TextDecoder("windows-874").decode(new Uint8Array(bytes));
    return decoded.trim();
  } catch {
    return str;
  }
}

/**
 * คำนวณสูตร (x / 3) + x ปัดเศษ 2 ตำแหน่ง
 * ตัวอย่าง: 460 -> (460/3)+460 = 613.3333... -> 613.34 หรือ 613.33
 */
export function calculateAdjustedQty(value: number): number {
  if (value === 0) return 0;
  const calculated = (value / 3) + value;
  return Number(calculated.toFixed(2));
}

/**
 * ตรวจสอบและ Parse ไฟล์ 1.คงเหลือ.xls
 * กฎ:
 * - คอลัมน์ B (รหัสสินค้า), E (จำนวน), H (Min)
 * - เอาเฉพาะแถวที่มีข้อมูลใน คอลัมน์ E หรือ คอลัมน์ H (หรืออย่างใดอย่างหนึ่ง)
 * - คอลัมน์ B เป็นตัวเชื่อม
 */
export function parseAndValidateBalance(buffer: Buffer | ArrayBuffer): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const parsedData: BalanceItemParsed[] = [];
  const previewRows: any[] = [];

  let wb: xlsx.WorkBook;
  try {
    wb = xlsx.read(buffer, { type: "buffer", codepage: 874 });
  } catch (err: any) {
    return {
      fileType: "BALANCE",
      isValid: false,
      sheetName: "",
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: [{ message: "ไม่สามารถอ่านไฟล์ Excel ได้: " + (err.message || "ไฟล์เสียหายหรือไม่ถูกต้อง"), severity: "error" }],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  // ตรวจจับว่านำไฟล์ประเภทอื่นมาอัปโหลดผิดประเภทหรือไม่
  const allSheetNames = wb.SheetNames.map(fixThaiEncoding);
  const hasDailySaleSheet = allSheetNames.some((s) => s.toLowerCase().includes("daily sale"));
  
  // ตรวจสอบ Sheet ที่ตรงกับคงเหลือ
  const sheetNames = wb.SheetNames;
  let rawTargetSheetName = sheetNames.find((s) => {
    const fixed = fixThaiEncoding(s).trim();
    return (
      fixed === "กู้คืน_Sheet1" ||
      fixed.includes("SKBALANCE") ||
      fixed.includes("คงเหลือ") ||
      fixed === "เหลือ" ||
      fixed === "Sheet1"
    );
  });
  if (!rawTargetSheetName) {
    rawTargetSheetName = wb.SheetNames[0];
  }
  const targetSheetName = fixThaiEncoding(rawTargetSheetName);
  if (!rawTargetSheetName || !wb.Sheets[rawTargetSheetName]) {
    return {
      fileType: "BALANCE",
      isValid: false,
      sheetName: "",
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: [{ message: "ไม่พบข้อมูล Sheet ในไฟล์ Excel", severity: "error" }],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  const ws = wb.Sheets[rawTargetSheetName];
  const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });

  if (!rows || rows.length === 0) {
    return {
      fileType: "BALANCE",
      isValid: false,
      sheetName: targetSheetName,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: [{ message: "ไฟล์ Excel ไม่มีข้อมูล (Empty Sheet)", severity: "error" }],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  // ตรวจสอบ Header / ลายเซ็นต์ไฟล์
  const firstRow = rows[0] || [];
  const firstRowStr = firstRow.map((c) => fixThaiEncoding(c)).join(" ");
  
  if (hasDailySaleSheet || firstRowStr.includes("Daily Sales Report")) {
    return {
      fileType: "BALANCE",
      isValid: false,
      sheetName: targetSheetName,
      totalRows: rows.length,
      validRows: 0,
      invalidRows: rows.length,
      errors: [
        {
          message: '❌ ตรวจพบว่าเป็น "3. ไฟล์ขาย (Daily Sale Report)" ไม่ใช่ "1. ไฟล์คงเหลือ" กรุณาเลือกประเภท "3. ไฟล์ขาย" ให้ถูกต้อง',
          severity: "error",
        },
      ],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  if (firstRowStr.includes("รายงานสรุปการเบิกใช้") || firstRowStr.includes("Stock code")) {
    return {
      fileType: "BALANCE",
      isValid: false,
      sheetName: targetSheetName,
      totalRows: rows.length,
      validRows: 0,
      invalidRows: rows.length,
      errors: [
        {
          message: '❌ ตรวจพบว่าเป็น "2. ไฟล์ตัดจ่าย" ไม่ใช่ "1. ไฟล์คงเหลือ" กรุณาเลือกประเภท "2. ไฟล์ตัดจ่าย" ให้ถูกต้อง',
          severity: "error",
        },
      ],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  const isBalanceHeader =
    firstRowStr.includes("รหัสสินค้า") ||
    firstRowStr.includes("SKBALANCE") ||
    firstRowStr.includes("จำนวน") ||
    firstRowStr.includes("ต้นทุนรวม");

  if (!isBalanceHeader) {
    errors.push({
      message: '❌ โครงสร้างหัวตารางไม่ตรงตามรูปแบบไฟล์ "1. คงเหลือ" (ไม่พบคอลัมน์ รหัสสินค้า, จำนวน, หรือต้นทุนรวม)',
      severity: "error",
    });
  }

  let skippedRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const colB = fixThaiEncoding(row[1]);
    const isSheetLuea = targetSheetName === "เหลือ";
    const colE_raw = row[4] !== undefined && row[4] !== null && row[4] !== "" ? Number(row[4]) : null;
    const colMinRaw = isSheetLuea
      ? (row[5] !== undefined && row[5] !== null && row[5] !== "" ? Number(row[5]) : null)
      : (row[7] !== undefined && row[7] !== null && row[7] !== "" ? Number(row[7]) : null);

    // ข้ามแถว Header หรือผลรวม
    if (
      !colB ||
      colB === "รหัสสินค้า" ||
      colB === "Stock code" ||
      colB.startsWith("รวม") ||
      colB.includes("Page -1")
    ) {
      skippedRows++;
      continue;
    }

    const hasE = colE_raw !== null && !isNaN(colE_raw);
    const hasMin = colMinRaw !== null && !isNaN(colMinRaw);

    // เงื่อนไข: เอาเฉพาะแถวที่มีข้อมูลใน คอลัมน์จำนวนคงเหลือ หรือ คอลัมน์ Min
    if (!hasE && !hasMin) {
      skippedRows++;
      continue;
    }

    const itemCode = colB;
    const itemName = row[2] !== undefined && row[2] !== null ? fixThaiEncoding(row[2]) : null;
    const unit = row[3] !== undefined && row[3] !== null ? fixThaiEncoding(row[3]) : null;
    const balanceQty = hasE ? colE_raw : null;
    const minQty = hasMin ? colMinRaw : null;
    const unitPrice = !isSheetLuea && row[5] !== undefined && !isNaN(Number(row[5])) ? Number(row[5]) : null;
    const totalCost = !isSheetLuea && row[6] !== undefined && !isNaN(Number(row[6])) ? Number(row[6]) : null;

    const item: BalanceItemParsed = {
      itemCode,
      itemName,
      unit,
      balanceQty,
      minQty,
      unitPrice,
      totalCost,
    };

    parsedData.push(item);

    if (previewRows.length < 50) {
      previewRows.push({
        rowIndex: i + 1,
        itemCode,
        itemName: itemName || "-",
        unit: unit || "-",
        balanceQty: balanceQty !== null ? balanceQty.toLocaleString() : "-",
        minQty: minQty !== null ? minQty.toLocaleString() : "-",
        unitPrice: unitPrice !== null ? unitPrice.toFixed(2) : "-",
        totalCost: totalCost !== null ? totalCost.toFixed(2) : "-",
      });
    }
  }

  if (parsedData.length === 0 && errors.length === 0) {
    errors.push({
      message: "ไม่พบแถวข้อมูลที่ตรงตามเงื่อนไข (มีรหัสสินค้าใน Col B และมีข้อมูลใน Col E หรือ Col H)",
      severity: "error",
    });
  }

  return {
    fileType: "BALANCE",
    isValid: errors.length === 0,
    sheetName: targetSheetName,
    totalRows: rows.length,
    validRows: parsedData.length,
    invalidRows: skippedRows,
    errors,
    warnings,
    previewRows,
    parsedData,
  };
}

/**
 * ตรวจสอบและ Parse ไฟล์ 2.ตัดจ่าย.xls
 * กฎ:
 * - Sheet 'กู้คืน_Sheet1'
 * - คอลัมน์ B (ตัวเชื่อม / Stock code)
 * - คอลัมน์ G: คำนวณ (G / 3) + G เข้าฐานข้อมูล
 */
export function parseAndValidateDispense(buffer: Buffer | ArrayBuffer): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const parsedData: DispenseItemParsed[] = [];
  const previewRows: any[] = [];

  let wb: xlsx.WorkBook;
  try {
    wb = xlsx.read(buffer, { type: "buffer", codepage: 874 });
  } catch (err: any) {
    return {
      fileType: "DISPENSE",
      isValid: false,
      sheetName: "",
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: [{ message: "ไม่สามารถอ่านไฟล์ Excel ได้: " + (err.message || "ไฟล์เสียหาย"), severity: "error" }],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  // ตรวจจับว่านำไฟล์คงเหลือหรือไฟล์ขายมาอัปโหลดผิดหรือไม่
  const allSheetNames = wb.SheetNames.map(fixThaiEncoding);
  const hasDailySaleSheet = allSheetNames.some((s) => s.toLowerCase().includes("daily sale"));
  if (hasDailySaleSheet) {
    return {
      fileType: "DISPENSE",
      isValid: false,
      sheetName: fixThaiEncoding(wb.SheetNames[0] || ""),
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: [
        {
          message: '❌ ตรวจพบว่าเป็น "3. ไฟล์ขาย (Daily Sale Report)" ไม่ใช่ "2. ไฟล์ตัดจ่าย" กรุณาเลือกประเภทไฟล์ให้ถูกต้อง',
          severity: "error",
        },
      ],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  // หา Sheet 'กู้คืน_Sheet1'
  let rawTargetSheetName = wb.SheetNames.find((s) => {
    const fixed = fixThaiEncoding(s);
    return fixed === "กู้คืน_Sheet1" || fixed.includes("กู้คืน");
  });

  if (!rawTargetSheetName) {
    return {
      fileType: "DISPENSE",
      isValid: false,
      sheetName: fixThaiEncoding(wb.SheetNames[0] || ""),
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: [
        {
          message: '❌ ไฟล์นี้ไม่มี Sheet "กู้คืน_Sheet1" ซึ่งเป็นโครงสร้างของไฟล์ตัดจ่าย',
          severity: "error",
        },
      ],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  const targetSheetName = fixThaiEncoding(rawTargetSheetName);
  const ws = wb.Sheets[rawTargetSheetName];
  const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });

  if (!rows || rows.length === 0) {
    return {
      fileType: "DISPENSE",
      isValid: false,
      sheetName: targetSheetName,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: [{ message: "Sheet ไม่มีข้อมูล (Empty Sheet)", severity: "error" }],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  // ตรวจสอบ Header
  const firstRow = rows[0] || [];
  const firstRowStr = firstRow.map((c) => fixThaiEncoding(c)).join(" ");
  if (firstRowStr.includes("SKBALANCE") || firstRowStr.includes("ต้นทุนรวม")) {
    return {
      fileType: "DISPENSE",
      isValid: false,
      sheetName: targetSheetName,
      totalRows: rows.length,
      validRows: 0,
      invalidRows: rows.length,
      errors: [
        {
          message: '❌ ตรวจพบว่าเป็น "1. ไฟล์คงเหลือ" ไม่ใช่ "2. ไฟล์ตัดจ่าย" กรุณาเลือกประเภท "1. ไฟล์คงเหลือ" ให้ถูกต้อง',
          severity: "error",
        },
      ],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  const isDispenseHeader =
    firstRowStr.includes("Stock code") ||
    firstRowStr.includes("เบิกใช้") ||
    firstRowStr.includes("รายงานสรุป");

  if (!isDispenseHeader) {
    errors.push({
      message: '❌ โครงสร้างหัวตารางไม่ตรงตามรูปแบบไฟล์ตัดจ่าย (ไม่พบคอลัมน์ Stock code หรือรายงานสรุปการเบิกใช้)',
      severity: "error",
    });
  }

  let skippedRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const colB = fixThaiEncoding(row[1]);
    const colG_raw = row[6] !== undefined && row[6] !== null && row[6] !== "" ? Number(row[6]) : null;

    // ข้าม header หรือแถวสรุป
    if (
      !colB ||
      colB === "Stock code" ||
      colB === "รหัสสินค้า" ||
      colB.startsWith("รวม") ||
      colB.includes("รายงาน")
    ) {
      skippedRows++;
      continue;
    }

    if (colG_raw === null || isNaN(colG_raw)) {
      skippedRows++;
      continue;
    }

    const itemCode = colB;
    const itemName = row[2] !== undefined && row[2] !== null ? fixThaiEncoding(row[2]) : null;
    const unit = row[5] !== undefined && row[5] !== null ? fixThaiEncoding(row[5]) : null;
    const rawQty = colG_raw;
    const adjustedQty = calculateAdjustedQty(rawQty);
    const unitPrice = row[7] !== undefined && !isNaN(Number(row[7])) ? Number(row[7]) : null;
    const totalCost = row[8] !== undefined && !isNaN(Number(row[8])) ? Number(row[8]) : null;

    const item: DispenseItemParsed = {
      itemCode,
      itemName,
      unit,
      rawQty,
      adjustedQty,
      unitPrice,
      totalCost,
    };

    parsedData.push(item);

    if (previewRows.length < 50) {
      previewRows.push({
        rowIndex: i + 1,
        itemCode,
        itemName: itemName || "-",
        unit: unit || "-",
        rawQty: rawQty.toLocaleString(),
        formula: `(${rawQty} / 3) + ${rawQty}`,
        adjustedQty: adjustedQty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        unitPrice: unitPrice !== null ? unitPrice.toFixed(2) : "-",
        totalCost: totalCost !== null ? totalCost.toFixed(2) : "-",
      });
    }
  }

  if (parsedData.length === 0 && errors.length === 0) {
    errors.push({
      message: "ไม่พบแถวข้อมูลที่มีรหัสสินค้าใน Col B และยอดตัดจ่ายใน Col G",
      severity: "error",
    });
  }

  return {
    fileType: "DISPENSE",
    isValid: errors.length === 0,
    sheetName: targetSheetName,
    totalRows: rows.length,
    validRows: parsedData.length,
    invalidRows: skippedRows,
    errors,
    warnings,
    previewRows,
    parsedData,
  };
}

/**
 * ตรวจสอบและ Parse ไฟล์ 3.ขาย.xls
 * กฎ:
 * - Sheet 'Daily Sale Report'
 * - คอลัมน์ B (ตัวเชื่อม / Stock code)
 * - คอลัมน์ E: คำนวณ (E / 3) + E
 * - เงื่อนไข: ต้องมีทั้งรหัสสินค้า (Col B) และยอดขาย (Col E)
 * - ข้ามแถวสรุป/หัวหมวด เช่น "1503 Items", "สินค้าฝากขาย", ชื่อบัญชียา
 */
export function parseAndValidateSale(buffer: Buffer | ArrayBuffer): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const parsedData: SaleItemParsed[] = [];
  const previewRows: any[] = [];

  let wb: xlsx.WorkBook;
  try {
    wb = xlsx.read(buffer, { type: "buffer", codepage: 874 });
  } catch (err: any) {
    return {
      fileType: "SALE",
      isValid: false,
      sheetName: "",
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: [{ message: "ไม่สามารถอ่านไฟล์ Excel ได้: " + (err.message || "ไฟล์เสียหาย"), severity: "error" }],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  // หา Sheet 'Daily Sale Report'
  let rawTargetSheetName = wb.SheetNames.find((s) => {
    const fixed = fixThaiEncoding(s).toLowerCase();
    return fixed.includes("daily sale") || fixed.includes("ขาย");
  });

  if (!rawTargetSheetName) {
    return {
      fileType: "SALE",
      isValid: false,
      sheetName: fixThaiEncoding(wb.SheetNames[0] || ""),
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: [
        {
          message: '❌ ไม่พบ Sheet "Daily Sale Report" ซึ่งเป็นโครงสร้างของไฟล์ยอดขาย (3.ขาย.xls)',
          severity: "error",
        },
      ],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  const targetSheetName = fixThaiEncoding(rawTargetSheetName);
  const ws = wb.Sheets[rawTargetSheetName];
  const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });

  if (!rows || rows.length === 0) {
    return {
      fileType: "SALE",
      isValid: false,
      sheetName: targetSheetName,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: [{ message: "Sheet ไม่มีข้อมูล (Empty Sheet)", severity: "error" }],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  // ตรวจสอบ Header
  const firstRow = rows[0] || [];
  const firstRowStr = firstRow.map((c) => fixThaiEncoding(c)).join(" ");
  const isSaleHeader =
    firstRowStr.includes("Daily Sales") ||
    firstRowStr.includes("สโตร์") ||
    firstRowStr.includes("วันที่พิมพ์");

  if (!isSaleHeader) {
    errors.push({
      message: '❌ โครงสร้างหัวตารางไม่ตรงตามรูปแบบไฟล์ "3. ขาย" (ไม่พบ Daily Sales Report หรือ สโตร์)',
      severity: "error",
    });
  }

  let skippedRows = 0;

  const isSaleJunkRow = (code: string, name: string | null) => {
    const codeLower = code.toLowerCase();
    const nameLower = (name || "").toLowerCase().trim();
    if (!code) return true;
    if (code === "Stock code" || code === "รหัสสินค้า") return true;
    if (code.startsWith("รวม") || code.includes("สโตร์") || code.includes("Daily")) return true;
    // แถวสรุปจำนวนรายการ เช่น Col B=1503, Col C=Items
    if (nameLower === "items" || nameLower === "item") return true;
    // หัวหมวดสินค้าในรายงาน (ไม่มีรหัสจริง)
    if (
      code.includes("สินค้าฝากขาย") ||
      code.includes("บัญชียาหลัก") ||
      code.includes("ยานอกบัญชี") ||
      code.includes("ยาในบัญชี")
    ) {
      return true;
    }
    // รหัสที่เป็นแต่ตัวเลขล้วนมักเป็นจำนวนนับในแถวสรุป ไม่ใช่ Stock code
    if (/^\d+$/.test(code) && (!name || nameLower === "items")) return true;
    if (codeLower === "unknown") return true;
    return false;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const colB = fixThaiEncoding(row[1]);
    const colE_raw = row[4] !== undefined && row[4] !== null && row[4] !== "" ? Number(row[4]) : null;
    const itemName = row[2] !== undefined && row[2] !== null ? fixThaiEncoding(row[2]) : null;

    // ข้าม Header / แถวสรุป / หัวหมวด
    if (isSaleJunkRow(colB, itemName)) {
      skippedRows++;
      continue;
    }

    const hasB = Boolean(colB);
    const hasE = colE_raw !== null && !isNaN(colE_raw);

    // ต้องมีทั้งรหัสสินค้าและยอดใน Col E ถึงจะนับเป็นรายการขายจริง
    if (!hasB || !hasE) {
      skippedRows++;
      continue;
    }

    const itemCode = colB;
    const unit = row[5] !== undefined && row[5] !== null ? fixThaiEncoding(row[5]) : null;
    const rawQty = colE_raw;
    const adjustedQty = calculateAdjustedQty(rawQty);
    const saleAmount = row[6] !== undefined && !isNaN(Number(row[6])) ? Number(row[6]) : null;
    const costAmount = row[7] !== undefined && !isNaN(Number(row[7])) ? Number(row[7]) : null;

    const item: SaleItemParsed = {
      itemCode,
      itemName,
      unit,
      rawQty,
      adjustedQty,
      saleAmount,
      costAmount,
    };

    parsedData.push(item);

    if (previewRows.length < 50) {
      previewRows.push({
        rowIndex: i + 1,
        itemCode,
        itemName: itemName || "-",
        unit: unit || "-",
        rawQty: rawQty.toLocaleString(),
        formula: `(${rawQty} / 3) + ${rawQty}`,
        adjustedQty: adjustedQty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        saleAmount: saleAmount !== null ? saleAmount.toFixed(2) : "-",
        costAmount: costAmount !== null ? costAmount.toFixed(2) : "-",
      });
    }
  }

  if (parsedData.length === 0 && errors.length === 0) {
    errors.push({
      message: "ไม่พบแถวข้อมูลที่ตรงตามเงื่อนไข (มีรหัสสินค้าใน Col B และยอดขายใน Col E)",
      severity: "error",
    });
  }

  return {
    fileType: "SALE",
    isValid: errors.length === 0,
    sheetName: targetSheetName,
    totalRows: rows.length,
    validRows: parsedData.length,
    invalidRows: skippedRows,
    errors,
    warnings,
    previewRows,
    parsedData,
  };
}

/**
 * ตรวจสอบและ Parse ไฟล์ 4.ปริมาณการใช้.xls (Sheet ปริมาณการใช้ หรือ Sheet เหลือ)
 * กฎ:
 * - รหัสสินค้า (Col B)
 * - รายการ (Col C), หน่วย (Col D)
 * - ปริมาณการใช้ 3 เดือน (เดือน 6, 7, 8)
 * - หมวดสินค้า (Category) และ บริษัทคู่ค้า (Supplier)
 */
export function parseAndValidateUsage(buffer: Buffer | ArrayBuffer): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const parsedData: UsageItemParsed[] = [];
  const previewRows: any[] = [];

  let wb: xlsx.WorkBook;
  try {
    wb = xlsx.read(buffer, { type: "buffer", codepage: 874 });
  } catch (err: any) {
    return {
      fileType: "USAGE",
      isValid: false,
      sheetName: "",
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: [{ message: "ไม่สามารถอ่านไฟล์ Excel ได้: " + (err.message || "ไฟล์เสียหาย"), severity: "error" }],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  // ใช้ Sheet ปริมาณการใช้ เป็นหลัก (หัวคอลัมน์เป็นเดือนจริง) — ไม่ใช้ "เหลือ" เพราะมีคอลัมน์ย้อนหลังเกิน
  const sheetNames = wb.SheetNames;
  let targetSheetNameRaw = sheetNames.find((s) => {
    const fixed = fixThaiEncoding(s).trim();
    return fixed === "ปริมาณการใช้" || fixed.includes("ปริมาณการใช้");
  });

  if (!targetSheetNameRaw) {
    targetSheetNameRaw = sheetNames.find((s) => {
      const fixed = fixThaiEncoding(s).trim();
      return fixed === "เหลือ";
    });
  }

  if (!targetSheetNameRaw) {
    targetSheetNameRaw = sheetNames.find((s) => {
      const fixed = fixThaiEncoding(s).trim();
      return fixed === "สั่ง" || fixed === "Sheet1";
    });
  }

  if (!targetSheetNameRaw) {
    targetSheetNameRaw = sheetNames[0];
  }

  const targetSheetName = fixThaiEncoding(targetSheetNameRaw);
  const ws = wb.Sheets[targetSheetNameRaw];
  const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });
  const yearHint = inferBuddhistYearFromWorkbook(wb) ?? currentBuddhistYear();

  if (!rows || rows.length === 0) {
    return {
      fileType: "USAGE",
      isValid: false,
      sheetName: targetSheetName,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: [{ message: "Sheet ไม่มีข้อมูล (Empty Sheet)", severity: "error" }],
      warnings: [],
      previewRows: [],
      parsedData: [],
    };
  }

  let skippedRows = 0;

  // หาแถวหัวตาราง และคอลัมน์เดือนจากหัวจริงในไฟล์ (เช่น 9/2569 หรือตัวเลข 9)
  let headerRowIndex = rows.findIndex((r) => {
    const b = fixThaiEncoding(r?.[1]);
    return b === "รหัสสินค้า" || b === "Stock code";
  });
  if (headerRowIndex < 0) headerRowIndex = 0;
  const headerRow = rows[headerRowIndex] || [];

  const isUsageVolumeSheet =
    targetSheetName === "ปริมาณการใช้" ||
    targetSheetName.includes("ปริมาณการใช้") ||
    (targetSheetName !== "เหลือ" && targetSheetName !== "สั่ง");

  const monthColIndexes: number[] = [];
  const usageMonthLabels: string[] = [];

  if (isUsageVolumeSheet) {
    // Sheet ปริมาณการใช้: สแกนจาก Col E (index 4) ไปเรื่อยๆ ถ้าหัวเป็นเดือน
    for (let c = 4; c < headerRow.length; c++) {
      const label = formatThaiMonthHeader(headerRow[c], yearHint);
      if (label) {
        monthColIndexes.push(c);
        usageMonthLabels.push(label);
      } else if (monthColIndexes.length > 0) {
        break; // จบชุดคอลัมน์เดือนแล้ว
      }
    }
    // fallback: Col E,F — แปลงหัวดิบเป็นชื่อเดือนถ้าได้
    if (monthColIndexes.length === 0) {
      for (const c of [4, 5]) {
        const label =
          formatThaiMonthHeader(headerRow[c], yearHint) ||
          (headerRow[c] !== undefined && headerRow[c] !== null && headerRow[c] !== ""
            ? String(headerRow[c]).trim()
            : null);
        if (label) {
          monthColIndexes.push(c);
          usageMonthLabels.push(label);
        }
      }
    }
  } else {
    // Sheet เหลือ/สั่ง: Col G..I เป็นยอดใช้ — ไม่นำคอลัมน์แรก (ย้อนหลัง 2 เดือน) เข้า
    const candidateCols = [6, 7, 8];
    const parsedCols: { c: number; label: string }[] = [];
    for (const c of candidateCols) {
      const label = formatThaiMonthHeader(headerRow[c], yearHint);
      if (label) parsedCols.push({ c, label });
    }
    // ถ้าอ่านหัวเดือนได้ครบ 3 เดือน → ข้ามเดือนเก่าสุด (คอลัมน์แรก)
    const take =
      parsedCols.length >= 3 ? parsedCols.slice(1) : parsedCols.length > 0 ? parsedCols : [];
    for (const item of take) {
      monthColIndexes.push(item.c);
      usageMonthLabels.push(item.label);
    }
    // fallback สุดท้าย: ใช้ H,I (ไม่ใช้ G)
    if (monthColIndexes.length === 0) {
      for (const c of [7, 8]) {
        const label =
          formatThaiMonthHeader(headerRow[c], yearHint) ||
          (headerRow[c] !== undefined && headerRow[c] !== null && String(headerRow[c]).trim() !== ""
            ? String(headerRow[c]).trim()
            : `คอลัมน์ ${String.fromCharCode(65 + c)}`);
        monthColIndexes.push(c);
        usageMonthLabels.push(label);
      }
    }
  }

  // วนลูปอ่านแถวข้อมูล
  for (let i = 0; i < rows.length; i++) {
    if (i === headerRowIndex) {
      skippedRows++;
      continue;
    }
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const colB = fixThaiEncoding(row[1]);

    // ข้ามแถว header / สรุป
    if (
      !colB ||
      colB === "รหัสสินค้า" ||
      colB === "Stock code" ||
      colB.startsWith("รวม") ||
      colB.includes("รายงาน") ||
      colB.includes("SKBALANCE")
    ) {
      skippedRows++;
      continue;
    }

    let itemName = row[2] !== undefined && row[2] !== null ? fixThaiEncoding(row[2]) : null;
    let unit = row[3] !== undefined && row[3] !== null ? fixThaiEncoding(row[3]) : null;
    let balanceQty: number | null = null;
    let minQty: number | null = null;
    let category: string | null = null;
    let supplier: string | null = null;

    const usageMonths: (number | null)[] = monthColIndexes.map((c) => {
      const raw = row[c];
      if (raw === undefined || raw === null || raw === "") return null;
      const n = Number(raw);
      return isNaN(n) ? null : n;
    });

    if (isUsageVolumeSheet) {
      // หลังคอลัมน์เดือน: หน่วยบรรจุ / หมวด / บริษัท (โครงสร้างไฟล์ตัวอย่าง)
      const afterMonth = (monthColIndexes[monthColIndexes.length - 1] ?? 3) + 1;
      // คอลัมน์ถัดไปถ้าไม่ใช่ตัวเลขล้วน มักเป็นข้อมูลบริษัท
      for (let c = afterMonth; c < Math.min(row.length, afterMonth + 4); c++) {
        const cell = row[c];
        if (cell === undefined || cell === null || cell === "") continue;
        const text = fixThaiEncoding(cell);
        if (!text || text === "-") continue;
        if (!isNaN(Number(text)) && String(text).trim() === String(Number(text))) continue;
        if (
          text.includes("บริษัท") ||
          text.includes("หจก") ||
          text.includes("จำกัด") ||
          /^\d{6,}/.test(text.trim())
        ) {
          if (!supplier) supplier = text;
        } else if (!category && text.length < 80 && !text.includes("กล่อง") && !text.includes("ซอง")) {
          category = text;
        }
      }
    } else {
      const colE_raw = row[4] !== undefined && row[4] !== null && row[4] !== "" ? Number(row[4]) : null;
      const colF_raw = row[5] !== undefined && row[5] !== null && row[5] !== "" ? Number(row[5]) : null;
      balanceQty = colE_raw !== null && !isNaN(colE_raw) ? colE_raw : null;
      minQty = colF_raw !== null && !isNaN(colF_raw) ? colF_raw : null;
      if (targetSheetName === "เหลือ") {
        supplier = row[15] !== undefined && row[15] !== null ? fixThaiEncoding(row[15]) : null;
        category = null;
      } else {
        category = row[15] !== undefined && row[15] !== null ? fixThaiEncoding(row[15]) : null;
        supplier = row[16] !== undefined && row[16] !== null ? fixThaiEncoding(row[16]) : null;
      }
    }

    const isCompany = (val: string | null) =>
      val && (
        val.includes("บริษัท") ||
        val.includes("หจก") ||
        val.includes("บจก") ||
        val.includes("จำกัด") ||
        val.includes("มหาชน") ||
        val.includes("ห้างหุ้นส่วน") ||
        /^[A-Z0-9]{2,}\s{2,}/.test(val.trim())
      );

    if (isCompany(category) && (!supplier || supplier === "-" || !isCompany(supplier))) {
      supplier = category;
      category = null;
    }

    if (supplier && !isCompany(supplier) && !isNaN(Number(supplier))) {
      supplier = "-";
    }

    if (!category) {
      if (colB.startsWith("XA")) category = "เวชภัณฑ์ 1.";
      else if (/^[0-9]{4}/.test(colB) || /^[A-Z]{2}[0-9]{2}/.test(colB)) category = "ยา";
      else if (colB.startsWith("1-") || colB.startsWith("2-")) category = "วัสดุเครื่องเขียน";
      else if (colB.startsWith("9-") || colB.startsWith("SET-")) category = "เครื่องใช้สำหรับผู้ป่วย";
      else if (colB.startsWith("3-")) category = "วัสดุสิ้นเปลืองทั่วไป";
      else if (colB.startsWith("10-")) category = "พัสดุ";
      else category = "เวชภัณฑ์/ยา";
    }

    const numericVals = usageMonths.map((v) => (v !== null && !isNaN(v) ? v : 0));
    const maxUsage = numericVals.length ? Math.max(...numericVals) : 0;
    const avgUsage = numericVals.length
      ? Number((numericVals.reduce((a, b) => a + b, 0) / numericVals.length).toFixed(2))
      : 0;

    // map เข้า legacy fields เพื่อเข้ากันกับ overview เดิม (เดือนสุดท้าย = usageMonth2 ถ้ามี 1 คอลัมน์)
    const legacy2 = usageMonths.length >= 1 ? usageMonths[usageMonths.length - 2] ?? usageMonths[0] : null;
    const legacy3 = usageMonths.length >= 1 ? usageMonths[usageMonths.length - 1] : null;

    const item: UsageItemParsed = {
      itemCode: colB,
      itemName,
      unit,
      balanceQty,
      minQty,
      usageMonth1: null,
      usageMonth2: legacy2 !== null && legacy2 !== undefined && !isNaN(legacy2 as number) ? (legacy2 as number) : null,
      usageMonth3: legacy3 !== null && legacy3 !== undefined && !isNaN(legacy3 as number) ? (legacy3 as number) : null,
      usageMonths,
      maxUsage,
      avgUsage,
      category,
      supplier,
    };

    parsedData.push(item);

    if (previewRows.length < 50) {
      const preview: any = {
        rowIndex: i + 1,
        itemCode: colB,
        itemName: itemName || "-",
        unit: unit || "-",
        balanceQty: balanceQty !== null && !isNaN(balanceQty) ? balanceQty.toLocaleString() : "-",
        minQty: minQty !== null && !isNaN(minQty) ? minQty.toLocaleString() : "-",
        maxUsage: Number(maxUsage.toFixed(2)).toLocaleString(),
        avgUsage: avgUsage.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        category: category || "-",
        supplier: supplier || "-",
        usageMonths: usageMonths.map((v) =>
          v !== null && !isNaN(v) ? Number(v.toFixed(2)).toLocaleString() : "-"
        ),
      };
      previewRows.push(preview);
    }
  }

  if (parsedData.length === 0 && errors.length === 0) {
    errors.push({
      message: "ไม่พบแถวข้อมูลปริมาณการใช้หรือรหัสสินค้าในไฟล์นี้",
      severity: "error",
    });
  }

  return {
    fileType: "USAGE",
    isValid: errors.length === 0,
    sheetName: targetSheetName,
    totalRows: rows.length,
    validRows: parsedData.length,
    invalidRows: skippedRows,
    errors,
    warnings,
    previewRows,
    parsedData,
    usageMonthLabels,
  };
}

/**
 * Universal validator function by file type
 */
export function validateAndParseFile(
  fileType: InventoryFileType,
  buffer: Buffer | ArrayBuffer
): ValidationResult {
  switch (fileType) {
    case "BALANCE":
      return parseAndValidateBalance(buffer);
    case "DISPENSE":
      return parseAndValidateDispense(buffer);
    case "SALE":
      return parseAndValidateSale(buffer);
    case "USAGE":
      return parseAndValidateUsage(buffer);
    default:
      return {
        fileType,
        isValid: false,
        sheetName: "",
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        errors: [{ message: "ไม่รู้จักประเภทไฟล์ที่เลือก", severity: "error" }],
        warnings: [],
        previewRows: [],
        parsedData: [],
      };
  }
}
