import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import ExcelJS from "exceljs";

// Helper: แปลง cell value เป็น string ที่รองรับ UTF-8 และตัวอักษรไทย
function getCellValueAsString(cell: ExcelJS.Cell): string {
  if (!cell || cell.value === null || cell.value === undefined) {
    return "";
  }

  // ถ้าเป็น string อยู่แล้ว ให้ return โดยตรง
  if (typeof cell.value === "string") {
    return cell.value.trim();
  }

  // ถ้าเป็น RichText ให้ดึง text ออกมา
  if (cell.value && typeof cell.value === "object" && "richText" in cell.value) {
    const richText = cell.value as ExcelJS.CellRichTextValue;
    return richText.richText
      .map((rt) => rt.text || "")
      .join("")
      .trim();
  }

  // ถ้าเป็น number, boolean, หรือ date ให้แปลงเป็น string
  if (cell.value instanceof Date) {
    return cell.value.toISOString();
  }

  return String(cell.value).trim();
}

// Helper: แปลงรูปแบบวันที่หลายๆ แบบเป็น YYYY-MM-DD
function parseDateFromCell(cellValue: unknown): string | null {
  if (!cellValue) return null;

  // ถ้าเป็น Date object อยู่แล้ว
  if (cellValue instanceof Date) {
    const year = cellValue.getFullYear();
    const month = String(cellValue.getMonth() + 1).padStart(2, "0");
    const day = String(cellValue.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // ถ้าเป็น number (Excel date serial number)
  if (typeof cellValue === "number") {
    // Excel date serial number: วันที่ 1 มกราคม 1900 = 1
    const excelEpoch = new Date(1899, 11, 30); // Excel epoch (December 30, 1899)
    const date = new Date(excelEpoch.getTime() + cellValue * 24 * 60 * 60 * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // ถ้าเป็น string ให้ลอง parse รูปแบบต่างๆ
  if (typeof cellValue === "string") {
    const trimmed = cellValue.trim();
    if (!trimmed) return null;

    // ลอง parse วันที่ไทยแบบเต็ม (เช่น "30 กันยายน 2568")
    const thaiDateResult = parseThaiDate(trimmed);
    if (thaiDateResult) return thaiDateResult;

    // ลอง parse รูปแบบ DD/MM/YYYY หรือ DD/MM/YYYY (พ.ศ.)
    const slashDateResult = parseSlashDate(trimmed);
    if (slashDateResult) return slashDateResult;

    // ลอง parse รูปแบบ DD-MM-YYYY หรือ DD-MM-YYYY (พ.ศ.)
    const dashDateResult = parseDashDate(trimmed);
    if (dashDateResult) return dashDateResult;

    // ลอง parse รูปแบบ YYYY-MM-DD (ISO format)
    const isoDateResult = parseISODate(trimmed);
    if (isoDateResult) return isoDateResult;

    // ลอง parse ด้วย Date object (fallback)
    const dateObj = new Date(trimmed);
    if (!isNaN(dateObj.getTime())) {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, "0");
      const day = String(dateObj.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

// Helper: แปลงรูปแบบ DD/MM/YYYY หรือ DD/MM/YYYY (พ.ศ.)
function parseSlashDate(str: string): string | null {
  // รูปแบบ: DD/MM/YYYY หรือ DD/MM/YYYY (พ.ศ.)
  const slashPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = str.match(slashPattern);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);

  // ตรวจสอบว่าเป็นปี พ.ศ. (มากกว่า 2500) หรือ ค.ศ.
  if (year > 2500) {
    year = year - 543; // แปลงจาก พ.ศ. เป็น ค.ศ.
  }

  // ตรวจสอบความถูกต้องของวันที่
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Helper: แปลงรูปแบบ DD-MM-YYYY หรือ DD-MM-YYYY (พ.ศ.)
function parseDashDate(str: string): string | null {
  // รูปแบบ: DD-MM-YYYY หรือ DD-MM-YYYY (พ.ศ.)
  const dashPattern = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
  const match = str.match(dashPattern);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);

  // ตรวจสอบว่าเป็นปี พ.ศ. (มากกว่า 2500) หรือ ค.ศ.
  if (year > 2500) {
    year = year - 543; // แปลงจาก พ.ศ. เป็น ค.ศ.
  }

  // ตรวจสอบความถูกต้องของวันที่
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Helper: แปลงรูปแบบ YYYY-MM-DD (ISO format)
function parseISODate(str: string): string | null {
  // รูปแบบ: YYYY-MM-DD
  const isoPattern = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
  const match = str.match(isoPattern);
  if (!match) return null;

  let year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  // ตรวจสอบว่าเป็นปี พ.ศ. (มากกว่า 2500) หรือ ค.ศ.
  if (year > 2500) {
    year = year - 543; // แปลงจาก พ.ศ. เป็น ค.ศ.
  }

  // ตรวจสอบความถูกต้องของวันที่
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Helper: แปลงวันที่ไทยแบบ "30 กันยายน 2568"
function parseThaiDate(str: string): string | null {
  if (!str) return null;

  const thaiMonths: Record<string, number> = {
    "มกราคม": 1,
    "กุมภาพันธ์": 2,
    "มีนาคม": 3,
    "เมษายน": 4,
    "พฤษภาคม": 5,
    "มิถุนายน": 6,
    "กรกฎาคม": 7,
    "สิงหาคม": 8,
    "กันยายน": 9,
    "ตุลาคม": 10,
    "พฤศจิกายน": 11,
    "ธันวาคม": 12,
  };

  const parts = str.split(" ");
  if (parts.length < 3) return null;

  const day = parseInt(parts[0], 10);
  const month = thaiMonths[parts[1]];
  const year = parseInt(parts[2], 10) - 543;

  if (!month) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Helper: ตรวจสอบ duplicate report_date, store, category
async function checkDuplicateReport(
  reportDate: string | null,
  store: string,
  category: string,
): Promise<{ isDuplicate: boolean; existingReport?: any }> {
  if (!reportDate) {
    return { isDuplicate: false };
  }

  const { data, error } = await supabase
    .from("daily_sale_reports")
    .select("id, report_date, store, category, filename")
    .eq("report_date", reportDate)
    .ilike("store", `%${store}%`)
    .ilike("category", `%${category}%`)
    .limit(1);

  if (error) {
    // ถ้ามี error ในการ query ให้ข้ามการตรวจสอบ (ไม่ block การ insert)
    return { isDuplicate: false };
  }

  if (data && data.length > 0) {
    return { isDuplicate: true, existingReport: data[0] };
  }

  return { isDuplicate: false };
}

// Helper: อ่าน report_date จาก column 4 (index 3) แถวแรก
function extractReportDateFromFirstRow(worksheet: ExcelJS.Worksheet): string | null {
  try {
    // อ่านแถวแรก (row 1)
    const firstRow = worksheet.getRow(1);
    if (!firstRow) return null;

    // อ่าน column 4 (index 3, column D)
    const cell = firstRow.getCell(4);
    if (!cell || cell.value === null || cell.value === undefined) {
      return null;
    }

    // ใช้ helper function แปลงเป็น date format
    return parseDateFromCell(cell.value);
  } catch (error) {
    return null;
  }
}

// Helper: ประมวลผล sheet เดียว
function processSheet(
  raw: unknown[][],
  filename: string,
  sheetName: string,
  reportDateFromFirstRow: string | null,
): {
  category: string;
  store: string;
  reportDate: string | null;
  printedAt: string | null;
  items: Array<{
    item_no: number;
    item_code: string;
    item_name: string;
    unit: string;
    quantity: number;
    unit_price: number;
    total_amount: number;
    item_type: string | null;
  }>;
} {
  let category = "";
  let store = "";
  let reportDate: string | null = reportDateFromFirstRow; // ใช้ค่าจาก column 4 แถวแรก
  let printedAt: string | null = null;

  // -----------------------------
  // Extract Header Information
  // -----------------------------
  raw.forEach((row: unknown[]) => {
    if (!row) return;

    const line = (row as string[]).join(" ").trim();

    if (line.includes("วัสดุ") || line.includes("เวชภัณฑ์")) {
      category = line;
    }
    if (line.includes("ห้องจ่ายยา")) {
      store = line.replace("สโตร์ :", "").trim();
    }
    // ไม่ใช้การ parse จาก "ถึง" แล้ว ใช้ค่าจาก column 4 แถวแรกแทน
    // แต่ถ้ายังไม่มีค่า ให้ลอง parse จาก "ถึง" เป็น fallback
    if (!reportDate && line.includes("ถึง")) {
      // เช่น: "ถึง 30 กันยายน 2568"
      const dateStr = line.split("ถึง")[1].trim();
      reportDate = parseThaiDate(dateStr);
    }
    if (line.includes("วันที่พิมพ์")) {
      printedAt = line.replace("วันที่พิมพ์", "").trim();
    }
  });

  // -----------------------------
  // Extract Table Rows
  // -----------------------------
  // หาแถวที่เริ่มมีข้อมูลจริง = มี item_no เป็นตัวเลข
  const items: Array<{
    item_no: number;
    item_code: string;
    item_name: string;
    unit: string;
    quantity: number;
    unit_price: number;
    total_amount: number;
    item_type: string | null;
  }> = [];

  // เก็บ item_type ปัจจุบันเพื่อใช้กับรายการถัดไป
  let currentItemType: string | null = null;

  raw.forEach((row: unknown[], rowIndex: number) => {
    if (!row || (row as unknown[]).length < 5) return;
    
    // ตรวจสอบว่าถ้าเจอแถวว่างและแถวนั้นอยู่ก่อนหน้าแถวที่คอลัมน์ B มีค่า "สินค้าฝากขาย" ให้ข้าม 2 แถวนี้
    if (rowIndex > 0) {
      const previousRow = raw[rowIndex - 1];
      const currentRowB = String((row as string[])[1] || "").trim();
      
      // ตรวจสอบว่าแถวก่อนหน้าว่างเปล่า (คอลัมน์ A ว่าง) และแถวปัจจุบันคอลัมน์ B มีค่า "สินค้าฝากขาย"
      if (previousRow && previousRow.length > 0) {
        const previousRowA = String((previousRow as string[])[0] || "").trim();
        if (!previousRowA && currentRowB === "สินค้าฝากขาย") {
          // ข้าม 2 แถวนี้ (แถวปัจจุบันและแถวก่อนหน้า)
          return;
        }
      }
    }

    const no = parseInt((row as string[])[0], 10);
    if (isNaN(no)) return; // ข้ามหัวตาราง

    // ดึง item_type จากคอลัมน์ A (index 0) ของแถวที่อยู่ 1 แถวก่อนหน้า
    let itemType: string | null = currentItemType; // ใช้ค่าเดิมก่อน
    
    if (rowIndex >= 1) {
      const oneRowBefore = raw[rowIndex - 1];
      if (oneRowBefore && oneRowBefore.length > 0) {
        const cellValue = String((oneRowBefore as string[])[0] || "").trim();
        const colB = String((oneRowBefore as string[])[1] || "").trim();
        const colC = String((oneRowBefore as string[])[2] || "").trim();
        
        // ถ้ามีค่าในคอลัมน์ A และคอลัมน์ B, C ว่างเปล่า (นี่คือ item_type header)
        // หรือมีคำว่า "เวชภัณฑ์" หรือ "วัสดุ"
        if (cellValue) {
          const isEmptyRow = !colB && !colC; // ตรวจสอบว่าคอลัมน์ B, C ว่างเปล่า
          const isItemTypePattern = cellValue.includes("เวชภัณฑ์") || cellValue.includes("วัสดุ");
          
          if (isEmptyRow || isItemTypePattern) {
            itemType = cellValue;
            currentItemType = cellValue; // อัปเดต currentItemType เพื่อใช้กับรายการถัดไป
          }
        } else {
          // ถ้าแถวก่อนหน้าว่างเปล่า ให้ใช้ item_type เดิม (currentItemType)
          itemType = currentItemType;
        }
      }
    }

    // แปลงค่าให้เป็น string ที่รองรับ UTF-8
    const itemCode = String((row as string[])[1] || "").trim();
    const itemName = String((row as string[])[2] || "").trim();
    const unit = String((row as string[])[5] || "").trim();
    const quantity = Number((row as string[])[4] || 0);
    const unitPrice = Number((row as string[])[7] || 0);
    const totalAmount = Number((row as string[])[6] || 0);

    items.push({
      item_no: no,
      item_code: itemCode,
      item_name: itemName,
      unit: unit,
      quantity: quantity,
      unit_price: unitPrice,
      total_amount: totalAmount,
      item_type: itemType,
    });
  });

  if (!reportDate) reportDate = new Date().toISOString().split("T")[0];

  return {
    category,
    store,
    reportDate,
    printedAt,
    items,
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    // รองรับทั้ง single file และ multiple files
    const file = formData.get("file") as File | null;
    const files = formData.getAll("files") as File[];
    
    // รวมไฟล์ทั้งหมด (รองรับทั้งกรณีส่งมาเป็น "file" หรือ "files")
    const allFiles: File[] = [];
    if (file) {
      allFiles.push(file);
    }
    if (files.length > 0) {
      allFiles.push(...files);
    }
    
    if (allFiles.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allResults: Array<{
      filename: string;
      sheet_name: string;
      report_id: number;
      rows: number;
    }> = [];

    // ประมวลผลทุกไฟล์
    for (const currentFile of allFiles) {
      const arrayBuffer = await currentFile.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const fileResults: Array<{
        sheet_name: string;
        report_id: number;
        rows: number;
      }> = [];

    // -----------------------------
    // ประมวลผลทุก sheet
    // -----------------------------
    for (let i = 0; i < workbook.worksheets.length; i++) {
      const worksheet = workbook.worksheets[i];
      const sheetName = worksheet.name;
      const raw: unknown[][] = [];
      
      // อ่าน report_date จาก column 4 (index 3) แถวแรก
      const reportDateFromFirstRow = extractReportDateFromFirstRow(worksheet);

      worksheet.eachRow((row, rowNumber) => {
        const rowData: unknown[] = [];
        row.eachCell((cell, colNumber) => {
          // ใช้ helper function เพื่อรองรับตัวอักษรไทย
          rowData[colNumber - 1] = getCellValueAsString(cell);
        });
        raw.push(rowData);
      });

      const {
        category,
        store,
        reportDate,
        printedAt,
        items,
      } = processSheet(raw, currentFile.name, sheetName, reportDateFromFirstRow);

      if (items.length === 0) {
        // ข้าม sheet ที่ไม่มีข้อมูล
        continue;
      }

      // -----------------------------
      // ตรวจสอบ duplicate report_date
      // -----------------------------
      const duplicateCheck = await checkDuplicateReport(
        reportDate,
        store,
        category,
      );

        if (duplicateCheck.isDuplicate) {
          const existingReport = duplicateCheck.existingReport;
          const errorMessage = `พบรายการซ้ำในระบบ:\n\n` +
            `📅 วันที่รายงาน: ${reportDate}\n` +
            `🏪 ห้องจ่ายยา: ${store}\n` +
            `📦 หมวดหมู่: ${category}\n\n` +
            `รายการที่มีอยู่แล้ว:\n` +
            `  • Report ID: ${existingReport.id}\n` +
            `  • ชื่อไฟล์: ${existingReport.filename || "N/A"}\n\n` +
            `ไฟล์: ${currentFile.name}\n` +
            `Sheet: ${sheetName}`;
          
          return NextResponse.json(
          {
            error: "DUPLICATE_REPORT",
            message: errorMessage,
            duplicate_info: {
              report_date: reportDate,
              store: store,
              category: category,
              existing_report_id: existingReport.id,
              existing_filename: existingReport.filename,
              failed_file: currentFile.name,
              failed_sheet: sheetName,
            },
          },
          { status: 409 }, // 409 Conflict
        );
      }

      // -----------------------------
      // Insert Header -> daily_sale_reports
      // -----------------------------
      const { data: reportData, error: reportErr } = await supabase
        .from("daily_sale_reports")
        .insert({
          report_date: reportDate,
          store,
          category,
          printed_at: printedAt ? new Date(printedAt) : null,
          filename: `${currentFile.name} (${sheetName})`,
        })
        .select()
        .single();

      if (reportErr) throw reportErr;

      const reportId = reportData.id;

      // -----------------------------
      // Insert Items -> daily_sale_items
      // -----------------------------
      const itemsToInsert = items.map((x) => ({
        report_id: reportId,
        ...x,
      }));

      const { error: itemErr } = await supabase
        .from("daily_sale_items")
        .insert(itemsToInsert);

      if (itemErr) throw itemErr;

      fileResults.push({
        sheet_name: sheetName,
        report_id: reportId,
        rows: items.length,
      });
    }

      // เพิ่มผลลัพธ์ของไฟล์นี้เข้าไปใน allResults
      fileResults.forEach((result) => {
        allResults.push({
          filename: currentFile.name,
          sheet_name: result.sheet_name,
          report_id: result.report_id,
          rows: result.rows,
        });
      });
    }

    const totalRows = allResults.reduce((sum, r) => sum + r.rows, 0);
    const totalSheets = allResults.length;
    const totalFiles = allFiles.length;

    return NextResponse.json({
      message: "Import success",
      files_processed: totalFiles,
      sheets_processed: totalSheets,
      total_rows: totalRows,
      details: allResults,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

