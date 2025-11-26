import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getConfig } from "@/lib/config";

interface DataQueryParams {
  report_dates?: string[]; // Array of 3 report dates
  search?: string; // Search keyword
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// Helper: แปลงวันที่เป็นรูปแบบไทย (เช่น ม.ค. 2568)
function formatThaiDate(dateString: string): string {
  const date = new Date(dateString);
  const thaiMonths = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];
  const year = date.getFullYear();
  const month = thaiMonths[date.getMonth()];
  return `${month} ${year}`;
}

// Helper: คำนวณ average และปัดเศษ
function calculateAverage(quantities: number[]): number {
  if (quantities.length === 0) return 0;
  const sum = quantities.reduce((a, b) => a + b, 0);
  const avg = sum / quantities.length;
  // ปัดเศษ: ถ้า >= 0.5 ปัดขึ้น, น้อยกว่า ปัดลง
  return Math.floor(avg + 0.5);
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const reportDates = params.get("report_dates")
      ? params.get("report_dates")!.split(",")
      : [];
    const search = params.get("search") || "";
    const page = parseInt(params.get("page") || "1", 10);
    const pageSize = parseInt(params.get("pageSize") || "20", 10);
    const sortBy = params.get("sortBy") || "item_name";
    const sortOrder = (params.get("sortOrder") || "asc") as "asc" | "desc";
    const maxQuotaMultiplier = parseFloat(params.get("maxQuotaMultiplier") || "10");
    const minQuotaMultiplier = parseFloat(params.get("minQuotaMultiplier") || "5");

    const config = getConfig();

    // ตรวจสอบว่าต้องมี report_dates อย่างน้อย 1 ตัว
    if (reportDates.length === 0) {
      return NextResponse.json({
        data: [],
        total: 0,
        page: 1,
        pageSize: pageSize,
        totalPages: 0,
        config: config,
      });
    }

    // ดึงข้อมูล unique items (item_code, item_name, unit) โดยใช้ distinct
    let itemsQuery = supabase
      .from("daily_sale_items")
      .select("item_code, item_name, unit", { count: "exact" });

    // ถ้ามี search keyword
    if (search) {
      itemsQuery = itemsQuery.or(
        `item_code.ilike.%${search}%,item_name.ilike.%${search}%`,
      );
    }

    const { data: allItems, error: itemsError } = await itemsQuery;

    if (itemsError) {
      console.error("Error fetching items:", itemsError);
      return NextResponse.json(
        { error: itemsError.message },
        { status: 500 },
      );
    }

    // กรอง unique items โดยใช้ item_code เป็น key
    const uniqueItemsMap = new Map<string, { item_code: string; item_name: string; unit: string }>();
    allItems?.forEach((item) => {
      if (item.item_code && !uniqueItemsMap.has(item.item_code)) {
        uniqueItemsMap.set(item.item_code, {
          item_code: item.item_code,
          item_name: item.item_name || "",
          unit: item.unit || "",
        });
      }
    });

    const uniqueItems = Array.from(uniqueItemsMap.values());

    if (!uniqueItems || uniqueItems.length === 0) {
      return NextResponse.json({
        data: [],
        total: 0,
        page: 1,
        pageSize: pageSize,
        totalPages: 0,
        config: config,
      });
    }

    // ดึงข้อมูล quantity สำหรับแต่ละ report_date
    const reportDatesArray = reportDates.slice(0, 3); // ใช้แค่ 3 ตัวแรก
    const quantitiesMap: Record<
      string,
      Record<string, number>
    > = {}; // item_code -> { report_date: quantity }

    // ดึงข้อมูล quantity สำหรับทุก report_date ในครั้งเดียว (ใช้ in filter)
    try {
      const { data: itemsData, error: itemsDataError } = await supabase
        .from("daily_sale_items")
        .select(
          "item_code, quantity, daily_sale_reports!inner(report_date)",
        )
        .in("daily_sale_reports.report_date", reportDatesArray);

      if (itemsDataError) {
        console.error("Error fetching quantities:", itemsDataError);
        // ไม่ return error แต่ให้ continue เพื่อให้แสดงข้อมูลที่ดึงได้แล้ว
      } else if (itemsData && itemsData.length > 0) {
        // รวม quantity ตาม item_code และ report_date
        itemsData.forEach((item: any) => {
          const code = item.item_code;
          if (!code) return; // ข้ามถ้าไม่มี item_code
          
          const reportDate = item.daily_sale_reports?.report_date;
          if (!reportDate) return; // ข้ามถ้าไม่มี report_date
          
          if (!quantitiesMap[code]) {
            quantitiesMap[code] = {};
          }
          // รวม quantity (ถ้ามีหลายแถวของ item_code เดียวกันใน report_date เดียวกัน)
          const currentQty = quantitiesMap[code][reportDate] || 0;
          const newQty = Number(item.quantity) || 0;
          quantitiesMap[code][reportDate] = currentQty + newQty;
        });
      }
    } catch (queryError) {
      console.error("Error in quantity query:", queryError);
      // Continue processing with empty quantitiesMap
    }

    // สร้างข้อมูลสำหรับ table
    const tableData = uniqueItems.map((item, index) => {
      const code = item.item_code;
      const quantities: number[] = [];
      const monthData: Record<string, { label: string; value: number }> = {};

      reportDatesArray.forEach((reportDate, idx) => {
        // ดึง quantity จาก map ที่เราสร้างไว้
        const qty = quantitiesMap[code]?.[reportDate] || 0;
        quantities.push(qty);
        monthData[`month_${idx + 1}`] = {
          label: formatThaiDate(reportDate),
          value: qty,
        };
      });

      // เติม 0 ถ้ามี report_date น้อยกว่า 3 ตัว
      while (quantities.length < 3) {
        quantities.push(0);
        monthData[`month_${quantities.length}`] = {
          label: "-",
          value: 0,
        };
      }

      // คำนวณ min: หาค่าที่น้อยที่สุดจาก 3 เดือนที่เลือก
      // ใช้เฉพาะค่าที่ > 0 เท่านั้น (ไม่นับ 0)
      // แต่ถ้าทุกค่าเป็น 0 ให้แสดง 0
      const validQuantities = quantities.filter((q) => q > 0);
      const minQty = validQuantities.length > 0 
        ? Math.min(...validQuantities) 
        : 0;
      
      // คำนวณ max: หาค่าที่มากที่สุดจาก 3 เดือนทั้งหมด (รวม 0 ด้วย)
      const maxQty = quantities.length > 0 ? Math.max(...quantities) : 0;
      const avgQty = calculateAverage(quantities);
      // Maximum Quota: ใช้ค่าจาก มากสุดใน 3 เดือนที่เลือก มา หาร 30 แล้ว คูณด้วย maxQuotaMultiplier
      const maxQuota = Math.round((maxQty / 30) * maxQuotaMultiplier);
      // Minimum Quota: ใช้ค่าจาก มากสุดใน 3 เดือนที่เลือก มา หาร 30 แล้ว คูณด้วย minQuotaMultiplier
      const minQuota = Math.round((maxQty / 30) * minQuotaMultiplier);

      return {
        no: index + 1,
        item_code: item.item_code || "",
        item_name: item.item_name || "",
        unit: item.unit || "",
        stock: "", // ว่างไว้ตามที่กำหนด
        month_1: monthData.month_1 || { label: "-", value: 0 },
        month_2: monthData.month_2 || { label: "-", value: 0 },
        month_3: monthData.month_3 || { label: "-", value: 0 },
        min: minQty,
        max: maxQty,
        average: avgQty,
        max_quota: maxQuota,
        min_quota: minQuota,
        packing: "", // ว่างไว้ตามที่กำหนด
        issue_unit: "", // ว่างไว้ตามที่กำหนด
      };
    });

    // Sorting
    const sortedData = [...tableData].sort((a, b) => {
      // ถ้าเรียงตาม "no" ให้เรียงตาม no โดยตรง (ตัวเลข)
      if (sortBy === "no") {
        if (sortOrder === "asc") {
          return a.no - b.no;
        } else {
          return b.no - a.no;
        }
      }

      let aVal: any = a[sortBy as keyof typeof a];
      let bVal: any = b[sortBy as keyof typeof b];

      // ถ้าเป็น object (month data) ให้ใช้ value
      if (typeof aVal === "object" && aVal !== null && "value" in aVal) {
        aVal = aVal.value;
      }
      if (typeof bVal === "object" && bVal !== null && "value" in bVal) {
        bVal = bVal.value;
      }

      if (typeof aVal === "string") {
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (sortOrder === "asc") {
        return (aVal || 0) - (bVal || 0);
      } else {
        return (bVal || 0) - (aVal || 0);
      }
    });

    // Pagination
    const total = sortedData.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = sortedData.slice(startIndex, endIndex);

    // คำนวณ "no" ใหม่ตามลำดับในหน้า (page) เพื่อให้แสดงลำดับที่ถูกต้องเสมอ
    const paginatedDataWithCorrectNo = paginatedData.map((row, index) => ({
      ...row,
      no: startIndex + index + 1,
    }));

    return NextResponse.json({
      data: paginatedDataWithCorrectNo,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
      config: config,
      report_dates: reportDatesArray,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Error in /api/data:", err);
    return NextResponse.json(
      { 
        error: errorMessage,
        details: err instanceof Error ? err.stack : undefined
      }, 
      { status: 500 }
    );
  }
}

