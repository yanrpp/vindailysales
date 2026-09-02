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
  usageMonth1: number | null; // เดือน 6
  usageMonth2: number | null; // เดือน 7
  usageMonth3: number | null; // เดือน 8
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
  
  // ตรวจสอบ Sheet แรก
  const rawTargetSheetName = wb.SheetNames[0];
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
    const colE_raw = row[4] !== undefined && row[4] !== null && row[4] !== "" ? Number(row[4]) : null;
    const colH_raw = row[7] !== undefined && row[7] !== null && row[7] !== "" ? Number(row[7]) : null;

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
    const hasH = colH_raw !== null && !isNaN(colH_raw);

    // เงื่อนไข: เอาเฉพาะแถวที่มีข้อมูลใน คอลัมน์ E หรือ คอลัมน์ H
    if (!hasE && !hasH) {
      skippedRows++;
      continue;
    }

    const itemCode = colB;
    const itemName = row[2] !== undefined && row[2] !== null ? fixThaiEncoding(row[2]) : null;
    const unit = row[3] !== undefined && row[3] !== null ? fixThaiEncoding(row[3]) : null;
    const balanceQty = hasE ? colE_raw : null;
    const minQty = hasH ? colH_raw : null;
    const unitPrice = row[5] !== undefined && !isNaN(Number(row[5])) ? Number(row[5]) : null;
    const totalCost = row[6] !== undefined && !isNaN(Number(row[6])) ? Number(row[6]) : null;

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
 * - คอลัมน์ B (ตัวเชื่อม)
 * - คอลัมน์ E: คำนวณ (E / 3) + E
 * - เงื่อนไข: เอาเฉพาะแถวที่มีข้อมูลใน คอลัมน์ B หรือ คอลัมน์ E (หรืออย่างใดอย่างหนึ่ง)
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

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const colB = fixThaiEncoding(row[1]);
    const colE_raw = row[4] !== undefined && row[4] !== null && row[4] !== "" ? Number(row[4]) : null;

    // ข้าม Header
    if (
      colB === "Stock code" ||
      colB === "รหัสสินค้า" ||
      colB.startsWith("รวม") ||
      colB.includes("สโตร์") ||
      colB.includes("Daily")
    ) {
      skippedRows++;
      continue;
    }

    const hasB = Boolean(colB);
    const hasE = colE_raw !== null && !isNaN(colE_raw);

    // เอาเฉพาะแถวที่มีข้อมูลใน คอลัมน์ B หรือ คอลัมน์ E (หรืออย่างใดอย่างหนึ่ง)
    if (!hasB && !hasE) {
      skippedRows++;
      continue;
    }

    const itemCode = hasB ? colB : "UNKNOWN";
    const itemName = row[2] !== undefined && row[2] !== null ? fixThaiEncoding(row[2]) : null;
    const unit = row[5] !== undefined && row[5] !== null ? fixThaiEncoding(row[5]) : null;
    const rawQty = hasE ? colE_raw : null;
    const adjustedQty = rawQty !== null ? calculateAdjustedQty(rawQty) : null;
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
        rawQty: rawQty !== null ? rawQty.toLocaleString() : "-",
        formula: rawQty !== null ? `(${rawQty} / 3) + ${rawQty}` : "-",
        adjustedQty: adjustedQty !== null ? adjustedQty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-",
        saleAmount: saleAmount !== null ? saleAmount.toFixed(2) : "-",
        costAmount: costAmount !== null ? costAmount.toFixed(2) : "-",
      });
    }
  }

  if (parsedData.length === 0 && errors.length === 0) {
    errors.push({
      message: "ไม่พบแถวข้อมูลที่ตรงตามเงื่อนไข (มีข้อมูลใน Col B หรือ Col E)",
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

  // หา Sheet 'ปริมาณการใช้' หรือ Sheet 'เหลือ' หรือ Sheet แรกที่เข้าข่าย
  const sheetNames = wb.SheetNames;
  let targetSheetNameRaw = sheetNames.find((s) => {
    const fixed = fixThaiEncoding(s);
    return fixed === "ปริมาณการใช้" || fixed.includes("ปริมาณการใช้");
  });

  let isUsageSheet = true;

  if (!targetSheetNameRaw) {
    targetSheetNameRaw = sheetNames.find((s) => {
      const fixed = fixThaiEncoding(s);
      return fixed === "เหลือ" || fixed === "สั่ง";
    });
    isUsageSheet = false;
  }

  if (!targetSheetNameRaw) {
    targetSheetNameRaw = sheetNames[0];
  }

  const targetSheetName = fixThaiEncoding(targetSheetNameRaw);
  const ws = wb.Sheets[targetSheetNameRaw];
  const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });

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

  // วนลูปอ่านแถวข้อมูล
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const colB = fixThaiEncoding(row[1]);

    // ข้ามแถว header
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
    let m1: number | null = null;
    let m2: number | null = null;
    let m3: number | null = null;
    let category: string | null = null;
    let supplier: string | null = null;

    if (targetSheetName === "ปริมาณการใช้" || row.length <= 10) {
      // โครงสร้าง Sheet ปริมาณการใช้:
      // Col B: รหัส, Col C: รายการ, Col D: หน่วย, Col E: 6, Col F: 7, Col G: 8, Col H: หมวด, Col I: บริษัท
      m1 = row[4] !== undefined && row[4] !== null && row[4] !== "" ? Number(row[4]) : null;
      m2 = row[5] !== undefined && row[5] !== null && row[5] !== "" ? Number(row[5]) : null;
      m3 = row[6] !== undefined && row[6] !== null && row[6] !== "" ? Number(row[6]) : null;
      category = row[7] !== undefined && row[7] !== null ? fixThaiEncoding(row[7]) : null;
      supplier = row[8] !== undefined && row[8] !== null ? fixThaiEncoding(row[8]) : null;
    } else {
      // โครงสร้าง Sheet เหลือ หรือ สั่ง:
      // Col B: รหัส, Col C: รายการ, Col D: หน่วย, Col G: 6, Col H: 7, Col I: 8, Col P: หมวด, Col Q: บริษัท
      m1 = row[6] !== undefined && row[6] !== null && row[6] !== "" ? Number(row[6]) : null;
      m2 = row[7] !== undefined && row[7] !== null && row[7] !== "" ? Number(row[7]) : null;
      m3 = row[8] !== undefined && row[8] !== null && row[8] !== "" ? Number(row[8]) : null;
      category = row[15] !== undefined && row[15] !== null ? fixThaiEncoding(row[15]) : (row[7] ? fixThaiEncoding(row[7]) : null);
      supplier = row[16] !== undefined && row[16] !== null ? fixThaiEncoding(row[16]) : (row[8] ? fixThaiEncoding(row[8]) : null);
    }

    const val1 = m1 !== null && !isNaN(m1) ? m1 : 0;
    const val2 = m2 !== null && !isNaN(m2) ? m2 : 0;
    const val3 = m3 !== null && !isNaN(m3) ? m3 : 0;

    const maxUsage = Math.max(val1, val2, val3);
    const avgUsage = Number(((val1 + val2 + val3) / 3).toFixed(2));

    const item: UsageItemParsed = {
      itemCode: colB,
      itemName,
      unit,
      usageMonth1: m1 !== null && !isNaN(m1) ? m1 : null,
      usageMonth2: m2 !== null && !isNaN(m2) ? m2 : null,
      usageMonth3: m3 !== null && !isNaN(m3) ? m3 : null,
      maxUsage,
      avgUsage,
      category,
      supplier,
    };

    parsedData.push(item);

    if (previewRows.length < 50) {
      previewRows.push({
        rowIndex: i + 1,
        itemCode: colB,
        itemName: itemName || "-",
        unit: unit || "-",
        usageMonth1: m1 !== null && !isNaN(m1) ? Number(m1.toFixed(2)).toLocaleString() : "-",
        usageMonth2: m2 !== null && !isNaN(m2) ? Number(m2.toFixed(2)).toLocaleString() : "-",
        usageMonth3: m3 !== null && !isNaN(m3) ? Number(m3.toFixed(2)).toLocaleString() : "-",
        maxUsage: Number(maxUsage.toFixed(2)).toLocaleString(),
        avgUsage: avgUsage.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        category: category || "-",
        supplier: supplier || "-",
      });
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
