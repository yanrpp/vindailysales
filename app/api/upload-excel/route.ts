import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import ExcelJS from "exceljs";

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

// Helper: ประมวลผล sheet เดียว
function processSheet(
  raw: unknown[][],
  filename: string,
  sheetName: string,
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
  let reportDate: string | null = null;
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
    if (line.includes("ถึง")) {
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

    items.push({
      item_no: no,
      item_code: (row as string[])[1] || "",
      item_name: (row as string[])[2] || "",
      unit: (row as string[])[3] || "",
      quantity: Number((row as string[])[4] || 0),
      unit_price: Number((row as string[])[5] || 0),
      total_amount: Number((row as string[])[6] || 0),
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
      
      worksheet.eachRow((row, rowNumber) => {
        const rowData: unknown[] = [];
        row.eachCell((cell, colNumber) => {
          rowData[colNumber - 1] = cell.value ?? "";
        });
        raw.push(rowData);
      });

      const {
        category,
        store,
        reportDate,
        printedAt,
        items,
      } = processSheet(raw, file.name, sheetName);

      if (items.length === 0) {
        // ข้าม sheet ที่ไม่มีข้อมูล
        continue;
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

