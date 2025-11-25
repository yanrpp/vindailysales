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

// Helper: แปลง cell value เป็น date format (YYYY-MM-DD)
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

  // ถ้าเป็น string ให้ลอง parse
  if (typeof cellValue === "string") {
    const trimmed = cellValue.trim();
    if (!trimmed) return null;

    // ลอง parse เป็น ISO date string
    const isoDate = new Date(trimmed);
    if (!isNaN(isoDate.getTime())) {
      const year = isoDate.getFullYear();
      const month = String(isoDate.getMonth() + 1).padStart(2, "0");
      const day = String(isoDate.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    // ลอง parse วันที่ไทย
    return parseThaiDate(trimmed);
  }

  return null;
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
  }> = [];

  raw.forEach((row: unknown[]) => {
    if (!row || (row as unknown[]).length < 5) return;
    const no = parseInt((row as string[])[0], 10);
    if (isNaN(no)) return; // ข้ามหัวตาราง

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
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const results: Array<{
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
      } = processSheet(raw, file.name, sheetName, reportDateFromFirstRow);

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
            `  • ชื่อไฟล์: ${existingReport.filename || "N/A"}`;
          
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
          filename: `${file.name} (${sheetName})`,
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

      results.push({
        sheet_name: sheetName,
        report_id: reportId,
        rows: items.length,
      });
    }

    const totalRows = results.reduce((sum, r) => sum + r.rows, 0);

    return NextResponse.json({
      message: "Import success",
      sheets_processed: results.length,
      total_rows: totalRows,
      details: results,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

