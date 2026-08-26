import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";

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

    const whereClause: any = {
      report: {
        reportDate: { in: reportDatesArray },
      },
    };

    if (search) {
      whereClause.OR = [
        { itemCode: { contains: search, mode: "insensitive" } },
        { itemName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (itemType) {
      whereClause.itemType = itemType;
    }

    const allItems = await prisma.dailySaleItem.findMany({
      where: whereClause,
      select: {
        itemCode: true,
        itemName: true,
        itemType: true,
        unit: true,
        quantity: true,
        report: {
          select: {
            reportDate: true,
          },
        },
      },
    });

    // สร้าง map สำหรับเก็บ unique items และ quantity
    const uniqueItemsMap = new Map<
      string,
      { item_code: string; item_name: string; item_type: string | null; unit: string }
    >();
    const quantitiesMap: Record<string, Record<string, number>> = {}; // item_code -> { report_date: quantity }

    // ประมวลผลข้อมูลทั้งหมด
    allItems.forEach((item) => {
      const code = item.itemCode;
      if (!code) return;

      // เก็บ unique items
      if (!uniqueItemsMap.has(code)) {
        uniqueItemsMap.set(code, {
          item_code: code,
          item_name: item.itemName || "",
          item_type: item.itemType || null,
          unit: item.unit || "",
        });
      }

      // รวม quantity ตาม item_code และ report_date
      const reportDate = item.report?.reportDate;
      if (reportDate) {
        if (!quantitiesMap[code]) {
          quantitiesMap[code] = {};
        }
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

    // สร้างข้อมูลสำหรับ table
    const tableData = uniqueItems.map((item, index) => {
      const code = item.item_code;
      const quantities: (number | null)[] = [];
      const monthData: Record<string, { label: string; value: number | string }> = {};

      reportDatesArray.forEach((reportDate, idx) => {
        const hasData = quantitiesMap[code] && quantitiesMap[code][reportDate] !== undefined;

        if (hasData) {
          const qty = quantitiesMap[code][reportDate];
          quantities.push(qty);
          monthData[`month_${idx + 1}`] = {
            label: formatThaiDate(reportDate),
            value: qty,
          };
        } else {
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

      // คำนวณ min / max / quotas
      const validQuantities = quantities.filter((q) => q !== null && q > 0) as number[];
      const minQty = validQuantities.length > 0 ? Math.min(...validQuantities) : 0;

      const numericQuantities = quantities.filter((q) => q !== null) as number[];
      const maxQty = numericQuantities.length > 0 ? Math.max(...numericQuantities) : 0;
      const avgQty = numericQuantities.length > 0 ? calculateAverage(numericQuantities) : 0;
      const maxQuota = Math.round((maxQty / 30) * maxQuotaMultiplier);
      const minQuota = Math.round((maxQty / 30) * minQuotaMultiplier);

      return {
        no: index + 1,
        item_type: item.item_type || null,
        item_code: item.item_code || "",
        item_name: item.item_name || "",
        unit: item.unit || "",
        stock: "",
        month_1: monthData.month_1 || { label: "-", value: 0 },
        month_2: monthData.month_2 || { label: "-", value: 0 },
        month_3: monthData.month_3 || { label: "-", value: 0 },
        min: minQty,
        max: maxQty,
        average: avgQty,
        max_quota: maxQuota,
        min_quota: minQuota,
        packing: "",
        issue_unit: "",
      };
    });

    // Sorting
    const sortedData = [...tableData].sort((a, b) => {
      if (sortBy === "no") {
        return sortOrder === "asc" ? a.no - b.no : b.no - a.no;
      }

      let aVal: any = a[sortBy as keyof typeof a];
      let bVal: any = b[sortBy as keyof typeof b];

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
    const errorMessage = err instanceof Error ? err.message : "Calculation service error";
    console.error("Error in /api/maxmin:", err);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
