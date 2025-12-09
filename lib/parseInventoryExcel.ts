import ExcelJS from "exceljs";

// สำหรับไฟล์รูปแบบ "สินค้าไม่เคลื่อนไหวย้อนหลัง 6 เดือน" (สินค้า + lot + qty + store)
export interface ParsedInventoryRecord {
  product: {
    no_data_store: string;
    product_code: string;
    description: string;
    um: string;
    cost: number;
    store_location: string; // เก็บ store location จากคอลัม G แถวแรก (ข้อความในวงเล็บ [])
    item_type: string; // เก็บ item_type จากคอลัม A แถวก่อนหน้า (แถวที่มีเฉพาะคอลัม A)
  };
  lot_no: string;
  exp: Date | null; // null = ไม่ระบุหมดอายุ
  qty: number;
  store_location: string;
}

// ผลลัพธ์จากการ parse ไฟล์ inventory
export interface ParsedInventoryFileResult {
  detail_date: string | null; // วันที่รายงานที่ดึงจากคอลัม A แถวแรก (ข้อความหลัง "ประจำวันงวดวันที่")
  records: ParsedInventoryRecord[];
}

// สำหรับไฟล์ products.xlsx
export interface ProductRow {
  product_code: string;
  description: string;
  um: string;
  cost: number;
}

// สำหรับไฟล์ product_lots.xlsx
export interface ProductLotRow {
  product_code: string;
  lot_no: string;
  exp: Date | null;
  store: string | null;
  qty: number | null;
}

/**
 * Parse Excel file สำหรับ Inventory Management
 * โครงสร้างไฟล์:
 * - แถว A row1 (แถวแรก): วันที่รายงาน (ข้อความหลัง "ประจำวันงวดวันที่")
 * - แถว A row2: วันที่รายงาน (report_date)
 * - แถวสินค้า (รหัสสินค้า): product_code, description, um, cost
 * - แถวที่เป็นตัวเลข 6 หลัก: lot_no (format: DDMMYY)
 * - QTY: จำนวนสินค้า
 * - Store Location: สถานที่เก็บ
 */
export async function parseInventoryFile(buffer: ArrayBuffer): Promise<ParsedInventoryFileResult> {
  const workbook = new ExcelJS.Workbook();
  const records: ParsedInventoryRecord[] = [];

  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw new Error(`Failed to load Excel file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  if (workbook.worksheets.length === 0) {
    throw new Error("Excel file has no worksheets");
  }

  const worksheet = workbook.worksheets[0];
  const rows: unknown[][] = [];

  // อ่านข้อมูลจาก worksheet
  worksheet.eachRow((row, rowNumber) => {
    const rowData: unknown[] = [];
    row.eachCell((cell, colNumber) => {
      rowData[colNumber - 1] = getCellValue(cell);
    });
    rows.push(rowData);
  });

  // ดึงวันที่รายงานจากคอลัม A แถวแรก (ข้อความหลัง "ประจำวันงวดวันที่")
  let detailDate: string | null = null;
  if (rows.length > 0) {
    const firstRowColA = rows[0][0];
    if (firstRowColA != null) {
      const firstRowColAStr = String(firstRowColA).trim();
      
      // ลองหลายรูปแบบของข้อความ
      // รูปแบบ 1: "ประจำวันงวดวันที่ ..."
      let match = firstRowColAStr.match(/ประจำวันงวดวันที่\s*(.+)/i);
      if (!match) {
        // รูปแบบ 2: "ประจำวันงวด วันที่ ..."
        match = firstRowColAStr.match(/ประจำวันงวด\s*วันที่\s*(.+)/i);
      }
      if (!match) {
        // รูปแบบ 3: "ประจำงวดวันที่ ..."
        match = firstRowColAStr.match(/ประจำงวดวันที่\s*(.+)/i);
      }
      if (!match) {
        // รูปแบบ 4: "งวดวันที่ ..."
        match = firstRowColAStr.match(/งวดวันที่\s*(.+)/i);
      }
      
      if (match && match[1]) {
        detailDate = match[1].trim();
      } else {
        // ถ้าไม่เจอ pattern ให้ log เพื่อ debug
        console.log("Could not parse detail_date from first row column A:", firstRowColAStr);
      }
    } else {
      console.log("First row column A is null or empty");
    }
  } else {
    console.log("No rows found in Excel file");
  }

  let currentProduct: ParsedInventoryRecord["product"] | null = null;
  // เก็บ store code จากคอลัม G แถวแรก (ข้อความภายในวงเล็บเหลี่ยม [])
  let storeCodeFromFirstRow: string | null = null;
  // เก็บ item_type จากคอลัม A แถวก่อนหน้า (แถวที่มีเฉพาะคอลัม A)
  let currentItemType: string | null = null;

  // ประมวลผลแต่ละแถว (ใช้ for loop เพื่อสามารถดูแถวถัดไปได้)
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const colA = row[0];
    const colB = row[1];
    const colC = row[2];
    const colD = row[3];
    const colE = row[4];
    const colF = row[5];

    const colAStr = colA != null ? String(colA).trim() : "";
    const colBStr = colB != null ? String(colB).trim() : "";
    const colCStr = colC != null ? String(colC).trim() : "";
    const colDStr = colD != null ? String(colD).trim() : "";
    const colEStr = colE != null ? String(colE).trim() : "";
    const colFStr = colF != null ? String(colF).trim() : "";

    // ดึง store code จากคอลัม G แถวแรก (ภายใน [ ])
    if (!storeCodeFromFirstRow) {
      const rawStore = row[6];
      if (typeof rawStore === "string") {
        const match = rawStore.match(/\[([^\]]+)\]/);
        if (match && match[1]) {
          storeCodeFromFirstRow = match[1].trim();
        }
      }
    }

    const colAUpper = colAStr.toUpperCase();
    const colBUpper = colBStr.toUpperCase();

    // ยกเว้น record ที่เป็นแถวสรุปรวม:
    // - มีคำว่า "GRAND TOTAL" ในคอลัม A
    // - หรือมีคำว่า "TOTAL" ตรง ๆ ในคอลัม A หรือ B
    if (
      colAUpper.includes("GRAND TOTAL") ||
      colAUpper === "TOTAL" ||
      colBUpper === "TOTAL"
    ) {
      continue; // ข้าม record นี้ ไม่ให้นับเป็น product/lot
    }

    const hasColA = colAStr !== "";
    const hasColB = colBStr !== "";
    const hasColC = colCStr !== "";
    const hasColD = colDStr !== "";
    const hasColE = colEStr !== "";
    const hasColF = colFStr !== "";

    // ตรวจสอบว่าแถวปัจจุบันมีเฉพาะคอลัม A เท่านั้น (ไม่มีข้อมูลใน B, C, D, E, F)
    const isOnlyColA = colAStr !== "" && !hasColB && !hasColC && !hasColD && !hasColE && !hasColF;

    // ตรวจสอบว่าแถวถัดไปเป็นแถวสินค้าหรือไม่ (A, B, C, D, E, F ครบ)
    let isNextRowProduct = false;
    if (rowIndex + 1 < rows.length) {
      const nextRow = rows[rowIndex + 1];
      const nextColA = nextRow[0] != null ? String(nextRow[0]).trim() : "";
      const nextColB = nextRow[1] != null ? String(nextRow[1]).trim() : "";
      const nextColC = nextRow[2] != null ? String(nextRow[2]).trim() : "";
      const nextColD = nextRow[3] != null ? String(nextRow[3]).trim() : "";
      const nextColE = nextRow[4] != null ? String(nextRow[4]).trim() : "";
      const nextColF = nextRow[5] != null ? String(nextRow[5]).trim() : "";
      isNextRowProduct =
        nextColA !== "" &&
        nextColB !== "" &&
        nextColC !== "" &&
        nextColD !== "" &&
        nextColE !== "" &&
        nextColF !== "";
    }

    // ตรวจพบแถว item_type: แถวที่มีเฉพาะคอลัม A และแถวถัดไปเป็นแถวสินค้า
    // ให้เก็บไว้ใน currentItemType (จะใช้กับ product ที่อยู่ถัดไป)
    if (isOnlyColA && isNextRowProduct) {
      currentItemType = colAStr;
      continue; // ข้ามแถวนี้ ไม่ต้องสร้าง product/lot
    }

    // ตรวจพบแถวสินค้า
    // เงื่อนไข: คอลัม A, B, C, D, E, F ต้องมีข้อมูลทั้งหมด (ไม่ว่าง)
    // Mapping: A=no_data_store, B=product_code, C=description, D=um, E=(ไม่ใช้), F=cost

    // ตรวจสอบว่าทุกคอลัมมีข้อมูลครบถ้วน (รูปแบบปกติ)
    if (hasColA && hasColB && hasColC && hasColD && hasColE && hasColF) {
      const noDataStore = colAStr;
      const productCode = colBStr;
      const description = colCStr;
      const um = colDStr;
      const cost = parseFloat(colFStr) || 0;

      currentProduct = {
        no_data_store: noDataStore,
        product_code: productCode,
        description: description,
        um: um,
        cost: cost,
        store_location: storeCodeFromFirstRow || "", // เก็บ store location จากคอลัม G แถวแรก
        item_type: currentItemType || "", // เก็บ item_type จากแถวก่อนหน้า (ใช้กับทุก product จนกว่าจะเจอ item_type ใหม่)
      };
      // ไม่รีเซ็ต currentItemType เพื่อให้ใช้กับทุก product จนกว่าจะเจอ item_type ใหม่
    }

    // กรณีพิเศษ: แถวที่มีข้อมูลเฉพาะคอลัม A แถวเดียว (เก็บ product_code ไว้ในคอลัม A)
    // ให้ถือว่าเป็นแถวสินค้า โดย map ค่าในคอลัม A ไปทั้ง no_data_store และ product_code
    // แต่ต้องไม่ใช่แถว item_type (ตรวจสอบแล้วว่าไม่ใช่ item_type จากด้านบน)
    if (isOnlyColA && !isNextRowProduct) {
      currentProduct = {
        no_data_store: colAStr,
        product_code: colAStr,
        description: "",
        um: "",
        cost: 0,
        store_location: storeCodeFromFirstRow || "", // เก็บ store location จากคอลัม G แถวแรก
        item_type: currentItemType || "", // เก็บ item_type จากแถวก่อนหน้า (ใช้กับทุก product จนกว่าจะเจอ item_type ใหม่)
      };
      // ไม่รีเซ็ต currentItemType เพื่อให้ใช้กับทุก product จนกว่าจะเจอ item_type ใหม่
      continue;
    }

    // ตรวจพบ lot record: ต้องมี currentProduct และคอลัม C (qty) ไม่ว่าง
    // ใช้ colCStr ที่ประกาศไว้แล้วด้านบน
    const hasQty = colCStr !== "";

    // ตรวจสอบว่าเป็น lot record (มี qty ในคอลัม C)
    // แต่ต้องไม่ใช่แถวสินค้า (แถวสินค้าต้องมี A, B, C, D, E, F ครบ)
    if (hasQty && currentProduct && !(hasColA && hasColB && hasColC && hasColD && hasColE && hasColF)) {
      // คอลัม A: lot_no
      // ถ้าค่า = "." ให้ใช้ "ไม่ระบุ lot"
      // ถ้าเป็นตัวเลข 6 หลัก ให้ใช้เป็น lot_no
      let lotNo: string;
      
      if (colAStr === ".") {
        lotNo = "ไม่ระบุ lot";
      } else if (typeof colA === "string" && /^\d{6}$/.test(colAStr)) {
        lotNo = colAStr;
      } else {
        // ถ้าไม่ใช่รูปแบบที่รู้จัก ให้ใช้ค่าจากคอลัม A โดยตรง
        lotNo = colAStr || "ไม่ระบุ lot";
      }

      // คอลัม B: exp (วันหมดอายุ)
      // ถ้าค่า = 4292552277 ให้ exp = null (ไม่ระบุหมดอายุ)
      // ถ้าเป็นวันที่ ให้แปลงเป็น Date
      let exp: Date | null = null;
      
      if (colBStr === "4292552277") {
        exp = null; // ไม่ระบุหมดอายุ
      } else if (colBStr !== "") {
        // ลองแปลงเป็นวันที่
        // ถ้าเป็นตัวเลข 6 หลัก (DDMMYY)
        if (/^\d{6}$/.test(colBStr)) {
          const dd = colBStr.substring(0, 2);
          const mm = colBStr.substring(2, 4);
          const yy = colBStr.substring(4, 6);
          const expYear = 2000 + parseInt(yy, 10);
          const expMonth = parseInt(mm, 10) - 1; // JavaScript month is 0-indexed
          const expDay = parseInt(dd, 10);
          exp = new Date(expYear, expMonth, expDay);
        } else {
          // ลอง parse เป็น Date จากรูปแบบอื่น
          const parsedDate = parseDate(colBStr);
          if (parsedDate) {
            exp = parsedDate;
          }
        }
      }

      // คอลัม C: qty (ต้องไม่ว่าง)
      const qty = parseFloat(colCStr) || 0;

      // อ่าน store_location:
      // - ถ้ามี storeCodeFromFirstRow ให้ใช้ค่านั้น (ข้อความในวงเล็บ [ ] จากคอลัม G แถวแรก)
      // - ถ้าไม่มีกลับไปใช้ค่าจากคอลัม G ของแถวปัจจุบัน (รองรับกรณีไม่มี template เดิม)
      let storeLocation = "";
      if (storeCodeFromFirstRow) {
        storeLocation = storeCodeFromFirstRow;
      } else {
        let rawStore = String(row[6] || "").trim();
        const match = rawStore.match(/\[([^\]]+)\]/);
        if (match && match[1]) {
          rawStore = match[1].trim();
        }
        storeLocation = rawStore;
      }

      records.push({
        product: currentProduct,
        lot_no: lotNo,
        exp: exp, // null = ไม่ระบุหมดอายุ
        qty: qty,
        store_location: storeLocation,
      });
    }
  }

  return {
    detail_date: detailDate,
    records: records,
  };
}

// Helper: ดึงค่า cell
function getCellValue(cell: ExcelJS.Cell): unknown {
  if (!cell || cell.value === null || cell.value === undefined) {
    return null;
  }

  // ถ้าเป็น string
  if (typeof cell.value === "string") {
    return cell.value.trim();
  }

  // ถ้าเป็น RichText
  if (cell.value && typeof cell.value === "object" && "richText" in cell.value) {
    const richText = cell.value as ExcelJS.CellRichTextValue;
    return richText.richText.map((rt) => rt.text || "").join("").trim();
  }

  // ถ้าเป็น Date
  if (cell.value instanceof Date) {
    return cell.value;
  }

  // ถ้าเป็น number
  if (typeof cell.value === "number") {
    return cell.value;
  }

  return String(cell.value).trim();
}

// Helper: แปลง string เป็น Date
function parseDate(dateString: string): Date | null {
  if (!dateString) return null;

  try {
    // ลอง parse เป็น Date
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // ลอง parse แบบไทย (เช่น "2 มกราคม 2568")
    // สามารถเพิ่ม logic เพิ่มเติมได้ตามต้องการ
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse products.xlsx
 * คาดหวัง header: PRODUCT_CODE | DESCRIPTION | UM | COST
 */
export async function parseProductsFile(buffer: ArrayBuffer): Promise<ProductRow[]> {
  const workbook = new ExcelJS.Workbook();
  const records: ProductRow[] = [];

  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw new Error(`Failed to load Excel file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  if (workbook.worksheets.length === 0) {
    throw new Error("Excel file has no worksheets");
  }

  const worksheet = workbook.worksheets[0];
  const rows: unknown[][] = [];

  worksheet.eachRow((row) => {
    const rowData: unknown[] = [];
    row.eachCell((cell, colNumber) => {
      rowData[colNumber - 1] = getCellValue(cell);
    });
    rows.push(rowData);
  });

  if (rows.length === 0) return records;

  const header = rows[0].map((v) =>
    v ? String(v).trim().toUpperCase() : ""
  );
  const idxCode = header.indexOf("PRODUCT_CODE");
  const idxDesc = header.indexOf("DESCRIPTION");
  const idxUm = header.indexOf("UM");
  const idxCost = header.indexOf("COST");

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const productCode =
      idxCode >= 0 && row[idxCode] != null
        ? String(row[idxCode]).trim()
        : "";
    if (!productCode) continue;

    const description =
      idxDesc >= 0 && row[idxDesc] != null
        ? String(row[idxDesc]).trim()
        : "";
    const um =
      idxUm >= 0 && row[idxUm] != null ? String(row[idxUm]).trim() : "";
    const cost =
      idxCost >= 0 && row[idxCost] != null
        ? parseFloat(String(row[idxCost])) || 0
        : 0;

    records.push({
      product_code: productCode,
      description,
      um,
      cost,
    });
  }

  return records;
}

/**
 * Parse product_lots.xlsx
 * คาดหวัง header: PRODUCT_CODE | LOT_NO | EXP | STORE | QTY
 */
export async function parseProductLotsFile(
  buffer: ArrayBuffer,
): Promise<ProductLotRow[]> {
  const workbook = new ExcelJS.Workbook();
  const records: ProductLotRow[] = [];

  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw new Error(
      `Failed to load Excel file: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }

  if (workbook.worksheets.length === 0) {
    throw new Error("Excel file has no worksheets");
  }

  const worksheet = workbook.worksheets[0];
  const rows: unknown[][] = [];

  worksheet.eachRow((row) => {
    const rowData: unknown[] = [];
    row.eachCell((cell, colNumber) => {
      rowData[colNumber - 1] = getCellValue(cell);
    });
    rows.push(rowData);
  });

  if (rows.length === 0) return records;

  const header = rows[0].map((v) =>
    v ? String(v).trim().toUpperCase() : ""
  );
  const idxCode = header.indexOf("PRODUCT_CODE");
  const idxLot = header.indexOf("LOT_NO");
  const idxExp = header.indexOf("EXP");
  const idxStore = header.indexOf("STORE");
  const idxQty = header.indexOf("QTY");

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const productCode =
      idxCode >= 0 && row[idxCode] != null
        ? String(row[idxCode]).trim()
        : "";
    if (!productCode) continue;

    const lotNo =
      idxLot >= 0 && row[idxLot] != null
        ? String(row[idxLot]).trim()
        : "";
    if (!lotNo) continue;

    let exp: Date | null = null;
    if (idxExp >= 0 && row[idxExp] != null) {
      const v = row[idxExp];
      if (v instanceof Date) {
        exp = v;
      } else if (typeof v === "string") {
        exp = parseDate(v);
      }
    }

    let store: string | null = null;
    if (idxStore >= 0 && row[idxStore] != null) {
      let raw = String(row[idxStore]).trim();
      const bracketMatch = raw.match(/\[([^\]]+)\]/);
      if (bracketMatch && bracketMatch[1]) {
        raw = bracketMatch[1].trim();
      }
      store = raw || null;
    }

    let qty: number | null = null;
    if (idxQty >= 0 && row[idxQty] != null) {
      const n = parseFloat(String(row[idxQty]));
      qty = isNaN(n) ? null : n;
    }

    records.push({
      product_code: productCode,
      lot_no: lotNo,
      exp,
      store,
      qty,
    });
  }

  return records;
}

