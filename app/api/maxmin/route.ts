import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getConfig } from "@/lib/config";

interface MaxMinQueryParams {
  report_dates?: string[]; // Array of 3 report dates
  search?: string; // Search keyword
  item_type?: string; // Filter by item_type
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
    const itemType = params.get("item_type") || "";
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

    // ดึงข้อมูล quantity สำหรับแต่ละ report_date ก่อน
    const reportDatesArray = reportDates.slice(0, 3); // ใช้แค่ 3 ตัวแรก
    
    // ดึงข้อมูล items และ quantity สำหรับทุก report_date ในครั้งเดียว
    // โดย filter ตาม report_date ที่เลือก
    // Supabase มี default limit ที่ 1000 rows ดังนั้นต้องดึงข้อมูลทั้งหมดโดยใช้ pagination
    let allItems: any[] = [];
    let hasMore = true;
    let pageIndex = 0;
    const pageSizeLimit = 1000; // Supabase default limit

    while (hasMore) {
      let itemsQuery = supabase
        .from("daily_sale_items")
        .select(
          "item_code, item_name, item_type, unit, quantity, daily_sale_reports!inner(report_date)",
          { count: "exact" }
        )
        .in("daily_sale_reports.report_date", reportDatesArray)
        .range(pageIndex * pageSizeLimit, (pageIndex + 1) * pageSizeLimit - 1);

      // ถ้ามี search keyword
      if (search) {
        itemsQuery = itemsQuery.or(
          `item_code.ilike.%${search}%,item_name.ilike.%${search}%`,
        );
      }

      // ถ้ามี item_type filter
      if (itemType) {
        itemsQuery = itemsQuery.eq("item_type", itemType);
      }

      const { data: itemsData, error: itemsError, count } = await itemsQuery;

      if (itemsError) {
        console.error("Error fetching items:", itemsError);
        return NextResponse.json(
          { error: itemsError.message },
          { status: 500 },
        );
      }

      if (itemsData && itemsData.length > 0) {
        allItems = allItems.concat(itemsData);
      }

      // ตรวจสอบว่ายังมีข้อมูลอีกหรือไม่
      const totalFetched = (pageIndex + 1) * pageSizeLimit;
      hasMore = itemsData && itemsData.length === pageSizeLimit && (count === null || totalFetched < count);
      pageIndex++;
      
      // Log สำหรับ debug
      if (process.env.NODE_ENV === "development") {
        console.log(`Fetched page ${pageIndex}: ${itemsData?.length || 0} items, total so far: ${allItems.length}, count: ${count}`);
      }
    }
    
    // สร้าง map สำหรับเก็บ unique items และ quantity
    const uniqueItemsMap = new Map<string, { item_code: string; item_name: string; item_type: string | null; unit: string }>();
    const quantitiesMap: Record<string, Record<string, number>> = {}; // item_code -> { report_date: quantity }

    // ประมวลผลข้อมูลทั้งหมด
    allItems.forEach((item: any) => {
      const code = item.item_code;
      if (!code) return; // ข้ามถ้าไม่มี item_code

      // เก็บ unique items
      if (!uniqueItemsMap.has(code)) {
        uniqueItemsMap.set(code, {
          item_code: code,
          item_name: item.item_name || "",
          item_type: item.item_type || null,
          unit: item.unit || "",
        });
      }

      // รวม quantity ตาม item_code และ report_date
      const reportDate = item.daily_sale_reports?.report_date;
      if (reportDate) {
        if (!quantitiesMap[code]) {
          quantitiesMap[code] = {};
        }
        // ตรวจสอบ quantity อย่างระมัดระวัง
        // ถ้า quantity เป็น null, undefined, หรือ NaN ให้ถือว่าเป็น 0
        // แต่ถ้าเป็น string ว่างหรือ "0" ให้ถือว่าเป็น 0
        let newQty = 0;
        if (item.quantity !== null && item.quantity !== undefined) {
          const parsedQty = Number(item.quantity);
          if (!isNaN(parsedQty)) {
            newQty = parsedQty;
          }
        }
        
        const currentQty = quantitiesMap[code][reportDate] || 0;
        quantitiesMap[code][reportDate] = currentQty + newQty;
      }
    });

    const uniqueItems = Array.from(uniqueItemsMap.values());
    
    // Log สำหรับ debug
    if (process.env.NODE_ENV === "development") {
      console.log(`Total items fetched: ${allItems.length}, Unique items: ${uniqueItems.length}`);
      
      // ตรวจสอบ quantity ที่เป็น 0 หรือ null
      let zeroQuantityCount = 0;
      let nullQuantityCount = 0;
      let validQuantityCount = 0;
      allItems.forEach((item: any) => {
        if (item.quantity === null || item.quantity === undefined) {
          nullQuantityCount++;
        } else if (Number(item.quantity) === 0) {
          zeroQuantityCount++;
        } else {
          validQuantityCount++;
        }
      });
      console.log(`Quantity stats: valid=${validQuantityCount}, zero=${zeroQuantityCount}, null=${nullQuantityCount}`);
      
      // ตรวจสอบ quantitiesMap
      let itemsWithZeroQty = 0;
      let itemsWithValidQty = 0;
      Object.keys(quantitiesMap).forEach((code) => {
        const qtyMap = quantitiesMap[code];
        const totalQty = Object.values(qtyMap).reduce((sum, qty) => sum + qty, 0);
        if (totalQty === 0) {
          itemsWithZeroQty++;
        } else {
          itemsWithValidQty++;
        }
      });
      console.log(`QuantitiesMap stats: items with valid qty=${itemsWithValidQty}, items with zero qty=${itemsWithZeroQty}`);
    }

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

    // quantitiesMap ถูกสร้างไว้แล้วในส่วนบน

    // สร้างข้อมูลสำหรับ table
    const tableData = uniqueItems.map((item, index) => {
      const code = item.item_code;
      const quantities: (number | null)[] = [];
      const monthData: Record<string, { label: string; value: number | string }> = {};

      reportDatesArray.forEach((reportDate, idx) => {
        // ตรวจสอบว่ามีข้อมูลใน quantitiesMap หรือไม่
        // ถ้ามีข้อมูลใน map แสดงว่ามี record ใน report_date นี้
        // ถ้าไม่มีข้อมูลใน map แสดงว่าไม่มี record ใน report_date นี้ ให้แสดง "-"
        const hasData = quantitiesMap[code] && quantitiesMap[code][reportDate] !== undefined;
        
        if (hasData) {
          const qty = quantitiesMap[code][reportDate];
          quantities.push(qty);
          monthData[`month_${idx + 1}`] = {
            label: formatThaiDate(reportDate),
            value: qty,
          };
        } else {
          // ไม่มีข้อมูลใน report_date นี้ ให้แสดง "-"
          quantities.push(null);
          monthData[`month_${idx + 1}`] = {
            label: formatThaiDate(reportDate),
            value: "-",
          };
        }
      });

      // เติม "-" ถ้ามี report_date น้อยกว่า 3 ตัว
      while (quantities.length < 3) {
        quantities.push(null);
        monthData[`month_${quantities.length}`] = {
          label: "-",
          value: "-",
        };
      }

      // คำนวณ min: หาค่าที่น้อยที่สุดจาก 3 เดือนที่เลือก
      // ใช้เฉพาะค่าที่ > 0 และไม่ใช่ null เท่านั้น
      // แต่ถ้าทุกค่าเป็น null หรือ 0 ให้แสดง 0
      const validQuantities = quantities.filter((q) => q !== null && q > 0) as number[];
      const minQty = validQuantities.length > 0 
        ? Math.min(...validQuantities) 
        : 0;
      
      // คำนวณ max: หาค่าที่มากที่สุดจาก 3 เดือนทั้งหมด (ไม่นับ null)
      const numericQuantities = quantities.filter((q) => q !== null) as number[];
      const maxQty = numericQuantities.length > 0 ? Math.max(...numericQuantities) : 0;
      const avgQty = numericQuantities.length > 0 ? calculateAverage(numericQuantities) : 0;
      // Maximum Quota: ใช้ค่าจาก มากสุดใน 3 เดือนที่เลือก มา หาร 30 แล้ว คูณด้วย maxQuotaMultiplier
      const maxQuota = Math.round((maxQty / 30) * maxQuotaMultiplier);
      // Minimum Quota: ใช้ค่าจาก มากสุดใน 3 เดือนที่เลือก มา หาร 30 แล้ว คูณด้วย minQuotaMultiplier
      const minQuota = Math.round((maxQty / 30) * minQuotaMultiplier);

      return {
        no: index + 1,
        item_type: item.item_type || null,
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
    console.error("Error in /api/maxmin:", err);
    return NextResponse.json(
      { 
        error: errorMessage,
        details: err instanceof Error ? err.stack : undefined
      }, 
      { status: 500 }
    );
  }
}

