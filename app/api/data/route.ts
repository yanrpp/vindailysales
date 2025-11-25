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
    const sortBy = params.get("sortBy") || "item_code";
    const sortOrder = (params.get("sortOrder") || "asc") as "asc" | "desc";

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

    // ดึงข้อมูล unique items (item_code, item_name, unit)
    let itemsQuery = supabase
      .from("daily_sale_items")
      .select("item_code, item_name, unit")
      .order("item_code", { ascending: true });

    // ถ้ามี search keyword
    if (search) {
      itemsQuery = itemsQuery.or(
        `item_code.ilike.%${search}%,item_name.ilike.%${search}%`,
      );
    }

    const { data: allItems, error: itemsError } = await itemsQuery;

    if (itemsError) {
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

    for (const reportDate of reportDatesArray) {
      const { data: itemsData, error: itemsDataError } = await supabase
        .from("daily_sale_items")
        .select(
          "item_code, quantity, daily_sale_reports!inner(report_date)",
        )
        .eq("daily_sale_reports.report_date", reportDate);

      if (itemsDataError) {
        console.error(`Error fetching data for ${reportDate}:`, itemsDataError);
        continue;
      }

      if (itemsData) {
        // รวม quantity ตาม item_code สำหรับ report_date นี้
        itemsData.forEach((item: any) => {
          const code = item.item_code;
          if (!quantitiesMap[code]) {
            quantitiesMap[code] = {};
          }
          quantitiesMap[code][reportDate] =
            (quantitiesMap[code][reportDate] || 0) + (item.quantity || 0);
        });
      }
    }

    // สร้างข้อมูลสำหรับ table
    const tableData = uniqueItems.map((item, index) => {
      const code = item.item_code;
      const quantities: number[] = [];
      const monthData: Record<string, { label: string; value: number }> = {};

      reportDatesArray.forEach((reportDate, idx) => {
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

      const minQty = Math.min(...quantities.filter((q) => q > 0), 0);
      const maxQty = Math.max(...quantities);
      const avgQty = calculateAverage(quantities);
      const maxQuota = Math.round((avgQty / config.c_monthAvg) * config.b_max);
      const minQuota = avgQty * config.a_min;

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

    return NextResponse.json({
      data: paginatedData,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
      config: config,
      report_dates: reportDatesArray,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

