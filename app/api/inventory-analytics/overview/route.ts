import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fixThaiEncoding } from "@/lib/excel-validator";
import { parseDataGroup, parseDataDate } from "@/lib/inventory-data-group";
import {
  buildMonthRangeBack,
  computeMaxAvgFromMonthWindow,
  formatBuddhistMonthLabel,
  toBuddhistMonth,
} from "@/lib/usage-month-range";

/** แปลง sortBy จาก UI เป็น Prisma orderBy (ฟิลด์ที่เรียงใน DB ได้) */
function buildPrismaOrderBy(
  sortBy: string,
  sortOrder: "asc" | "desc",
  allowed: string[]
): Record<string, "asc" | "desc"> {
  if (sortBy && sortBy !== "seq" && allowed.includes(sortBy)) {
    return { [sortBy]: sortOrder };
  }
  return { createdAt: "desc" };
}

function compareSortValues(a: any, b: any, sortBy: string, sortOrder: "asc" | "desc") {
  let valA = a?.[sortBy];
  let valB = b?.[sortBy];
  if (valA === null || valA === undefined) valA = sortOrder === "asc" ? Infinity : -Infinity;
  if (valB === null || valB === undefined) valB = sortOrder === "asc" ? Infinity : -Infinity;
  if (typeof valA === "string" || typeof valB === "string") {
    return sortOrder === "asc"
      ? String(valA).localeCompare(String(valB), "th")
      : String(valB).localeCompare(String(valA), "th");
  }
  const numA = Number(valA);
  const numB = Number(valB);
  if (!isNaN(numA) && !isNaN(numB)) {
    return sortOrder === "asc" ? numA - numB : numB - numA;
  }
  return 0;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") || "overview"; // "overview" | "balance" | "dispense" | "sale" | "usage" | "batches" | "upload"
    const search = searchParams.get("search")?.trim() || "";
    const selectedCategory = searchParams.get("category")?.trim() || "";
    const selectedSupplier = searchParams.get("supplier")?.trim() || "";
    const selectedUnit = searchParams.get("unit")?.trim() || "";
    const stockStatus = searchParams.get("stockStatus")?.trim() || "ALL"; // "ALL" | "NEED_ORDER" | "SUFFICIENT"
    // balance tab: "HAS_VALUE" (default) | "MIN_ZERO" (minQty null หรือ 0)
    const minFilter = searchParams.get("minFilter")?.trim() || "HAS_VALUE";
    // overview: กรองคอลัมน์เหลือ / MIN แยกกัน — HAS_VALUE | INCLUDE_EMPTY | EMPTY_ONLY (ดีฟอลต์รวม -)
    const balanceEmpty = searchParams.get("balanceEmpty")?.trim() || "INCLUDE_EMPTY";
    const minEmpty = searchParams.get("minEmpty")?.trim() || "HAS_VALUE";
    // จำนวนเดือนสำหรับ MAX/AVG (ดีฟอลต์ 3)
    const usageMonthCount = Math.max(
      1,
      Math.min(12, parseInt(searchParams.get("usageMonthCount") || "3", 10) || 3)
    );
    const usageEndYear = parseInt(searchParams.get("usageEndYear") || "", 10);
    const usageEndMonth = parseInt(searchParams.get("usageEndMonth") || "", 10);
    const usageRangeEnd =
      usageEndYear >= 2400 && usageEndMonth >= 1 && usageEndMonth <= 12
        ? { year: usageEndYear, month: usageEndMonth }
        : toBuddhistMonth();
    const usageDisplayLabels = buildMonthRangeBack(usageRangeEnd, usageMonthCount).map(
      formatBuddhistMonthLabel
    );
    const sortBy = searchParams.get("sortBy")?.trim() || "seq";
    const sortOrder = searchParams.get("sortOrder")?.toLowerCase() === "desc" ? "desc" : "asc";
    const dataGroup = parseDataGroup(searchParams.get("dataGroup"));

    const isAll = searchParams.get("all") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = isAll
      ? undefined
      : Math.max(10, Math.min(200, parseInt(searchParams.get("limit") || "50")));
    const skip = limit !== undefined ? (page - 1) * limit : undefined;

    // งวดที่แสดง = จากไฟล์นำเข้า คงเหลือ/ตัดจ่าย/ขาย เท่านั้น (ไม่นับปริมาณการใช้ ซึ่งเป็นฐานคำนวณ)
    const periodSourceTypes = ["BALANCE", "DISPENSE", "SALE"] as const;
    const distinctBatches = await prisma.importBatch.findMany({
      where: {
        period: { not: null },
        dataGroup,
        fileType: { in: [...periodSourceTypes] },
      },
      select: { period: true, dataDate: true, createdAt: true },
      orderBy: [{ period: "desc" }, { dataDate: "desc" }, { createdAt: "desc" }],
    });
    const availablePeriods: string[] = [];
    const periodDataDates: Record<string, string> = {};
    for (const b of distinctBatches) {
      const p = b.period as string;
      if (!p) continue;
      if (!availablePeriods.includes(p)) availablePeriods.push(p);
      if (b.dataDate && !periodDataDates[p]) {
        const d = b.dataDate;
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        periodDataDates[p] = `${yyyy}-${mm}-${dd}`;
      }
    }

    const periodParam = searchParams.get("period")?.trim();
    let selectedPeriod: string;
    if (periodParam === "ALL") {
      selectedPeriod = "ALL";
    } else if (periodParam && periodParam !== "LATEST") {
      selectedPeriod = periodParam;
    } else {
      const now = new Date();
      const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      selectedPeriod = availablePeriods.length > 0 ? availablePeriods[0] : currentMonthStr;
    }

    const periodFilter =
      selectedPeriod !== "ALL"
        ? { period: selectedPeriod, dataGroup }
        : { dataGroup };

    // ชื่อไฟล์ล่าสุดที่นำเข้าแยกตามประเภท (ในกลุ่มข้อมูลที่เลือก)
    const fileTypes = ["BALANCE", "DISPENSE", "SALE", "USAGE"] as const;
    const latestFileEntries = await Promise.all(
      fileTypes.map(async (fileType) => {
        const batch = await prisma.importBatch.findFirst({
          where: { fileType, dataGroup },
          orderBy: { createdAt: "desc" },
          select: { fileName: true, createdAt: true, period: true, dataDate: true, dataGroup: true },
        });
        return [
          fileType,
          batch
            ? {
                fileName: batch.fileName,
                createdAt: batch.createdAt,
                period: batch.period,
                dataDate: batch.dataDate,
                dataGroup: batch.dataGroup,
              }
            : null,
        ] as const;
      })
    );
    const latestFiles = Object.fromEntries(latestFileEntries) as Record<
      (typeof fileTypes)[number],
      {
        fileName: string;
        createdAt: Date;
        period: string | null;
        dataDate: Date | null;
        dataGroup: string;
      } | null
    >;

    // Upload tab: ชื่อไฟล์ล่าสุด + นับชุดที่มีวันที่ของข้อมูลตรงกับที่เลือก
    if (tab === "upload") {
      const dataDate = parseDataDate(searchParams.get("dataDate"));
      const sameDateCounts: Record<string, number> = {
        BALANCE: 0,
        DISPENSE: 0,
        SALE: 0,
        USAGE: 0,
      };
      if (dataDate) {
        await Promise.all(
          fileTypes.map(async (fileType) => {
            sameDateCounts[fileType] = await prisma.importBatch.count({
              where: { fileType, dataGroup, dataDate },
            });
          })
        );
      }

      return NextResponse.json({
        latestFiles,
        sameDateCounts,
        selectedPeriod,
        selectedDataGroup: dataGroup,
        availablePeriods,
        periodDataDates,
      });
    }

    // 1. Tab Batches
    if (tab === "batches") {
      const batchWhere: any = { dataGroup };
      if (selectedPeriod !== "ALL") {
        batchWhere.period = selectedPeriod;
      }
      const total = await prisma.importBatch.count({ where: batchWhere });
      const batches = await prisma.importBatch.findMany({
        where: batchWhere,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
      });

      return NextResponse.json({
        batches,
        latestFiles,
        selectedPeriod,
        selectedDataGroup: dataGroup,
        availablePeriods,
        periodDataDates,
        pagination: { total, page, limit: limit ?? total, totalPages: limit ? Math.ceil(total / limit) : 1 },
      });
    }

    // 2. Tab Balance
    if (tab === "balance") {
      const minQtyFilter =
        minFilter === "MIN_ZERO"
          ? { OR: [{ minQty: null }, { minQty: 0 }] }
          : { minQty: { gt: 0 } };

      const where: any = {
        ...periodFilter,
        ...minQtyFilter,
        ...(search
          ? {
              AND: [
                {
                  OR: [
                    { itemCode: { contains: search, mode: "insensitive" } },
                    { itemName: { contains: search, mode: "insensitive" } },
                  ],
                },
              ],
            }
          : {}),
      };

      const total = await prisma.inventoryBalance.count({ where });
      const items = await prisma.inventoryBalance.findMany({
        where,
        orderBy: buildPrismaOrderBy(sortBy, sortOrder, [
          "itemCode",
          "itemName",
          "unit",
          "balanceQty",
          "minQty",
          "unitPrice",
          "totalCost",
          "createdAt",
        ]),
        take: limit,
        skip,
        include: { batch: true },
      });

      return NextResponse.json({
        items: items.map((item, idx) => ({
          ...item,
          seq: (skip || 0) + idx + 1,
          itemName: item.itemName ? fixThaiEncoding(item.itemName) : null,
          unit: item.unit ? fixThaiEncoding(item.unit) : null,
        })),
        selectedPeriod,
        selectedDataGroup: dataGroup,
        availablePeriods,
        periodDataDates,
        pagination: { total, page, limit: limit ?? total, totalPages: limit ? Math.ceil(total / limit) : 1 },
      });
    }

    // 3. Tab Dispense
    if (tab === "dispense") {
      const where: any = {
        ...periodFilter,
        ...(search
          ? {
              OR: [
                { itemCode: { contains: search, mode: "insensitive" } },
                { itemName: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const total = await prisma.inventoryDispense.count({ where });
      const items = await prisma.inventoryDispense.findMany({
        where,
        orderBy: buildPrismaOrderBy(sortBy, sortOrder, [
          "itemCode",
          "itemName",
          "unit",
          "rawQty",
          "adjustedQty",
          "unitPrice",
          "totalCost",
          "createdAt",
        ]),
        take: limit,
        skip,
        include: { batch: true },
      });

      return NextResponse.json({
        items: items.map((item, idx) => ({
          ...item,
          seq: (skip || 0) + idx + 1,
          itemName: item.itemName ? fixThaiEncoding(item.itemName) : null,
          unit: item.unit ? fixThaiEncoding(item.unit) : null,
        })),
        selectedPeriod,
        selectedDataGroup: dataGroup,
        availablePeriods,
        periodDataDates,
        pagination: { total, page, limit: limit ?? total, totalPages: limit ? Math.ceil(total / limit) : 1 },
      });
    }

    // 4. Tab Sale
    if (tab === "sale") {
      const where: any = {
        ...periodFilter,
        ...(search
          ? {
              OR: [
                { itemCode: { contains: search, mode: "insensitive" } },
                { itemName: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const total = await prisma.inventorySale.count({ where });
      const items = await prisma.inventorySale.findMany({
        where,
        orderBy: buildPrismaOrderBy(sortBy, sortOrder, [
          "itemCode",
          "itemName",
          "unit",
          "rawQty",
          "adjustedQty",
          "saleAmount",
          "costAmount",
          "createdAt",
        ]),
        take: limit,
        skip,
        include: { batch: true },
      });

      return NextResponse.json({
        items: items.map((item, idx) => ({
          ...item,
          seq: (skip || 0) + idx + 1,
          itemName: item.itemName ? fixThaiEncoding(item.itemName) : null,
          unit: item.unit ? fixThaiEncoding(item.unit) : null,
        })),
        selectedPeriod,
        selectedDataGroup: dataGroup,
        availablePeriods,
        periodDataDates,
        pagination: { total, page, limit: limit ?? total, totalPages: limit ? Math.ceil(total / limit) : 1 },
      });
    }

    // 5. Tab Usage (ปริมาณการใช้)
    if (tab === "usage") {
      const where: any = {
        ...periodFilter,
        ...(search
          ? {
              OR: [
                { itemCode: { contains: search, mode: "insensitive" } },
                { itemName: { contains: search, mode: "insensitive" } },
                { category: { contains: search, mode: "insensitive" } },
                { supplier: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const dbSortable = ["itemCode", "itemName", "unit", "category", "supplier", "createdAt"];
      const needsMemorySort =
        sortBy.startsWith("usageMonth_") ||
        sortBy.startsWith("month:") ||
        sortBy === "thisMonthUsage" ||
        sortBy === "usageMonth3";

      const [totalCountUsage, rawItems, dispensesForUsage, salesForUsage, latestUsageBatch] =
        await Promise.all([
          prisma.inventoryUsage.count({ where }),
          prisma.inventoryUsage.findMany({
            where,
            orderBy: needsMemorySort
              ? { createdAt: "desc" }
              : buildPrismaOrderBy(sortBy, sortOrder, dbSortable),
            // เรียงคอลัมน์เดือน/เดือนนี้ในหน่วยความจำ — ดึงทั้งหมดก่อนแล้วค่อยตัดหน้า
            ...(needsMemorySort || isAll ? {} : { take: limit, skip }),
            include: { batch: true },
          }),
          prisma.inventoryDispense.findMany({
            where: periodFilter,
            select: { itemCode: true, adjustedQty: true },
          }),
          prisma.inventorySale.findMany({
            where: periodFilter,
            select: { itemCode: true, adjustedQty: true },
          }),
          prisma.importBatch.findFirst({
            where: { fileType: "USAGE", ...periodFilter },
            orderBy: { createdAt: "desc" },
            select: { usageMonthLabels: true },
          }),
        ]);

      const thisMonthByCode = new Map<string, number>();
      const addQty = (code: string, qty: number | null | undefined) => {
        const key = fixThaiEncoding(code).trim();
        if (!key) return;
        thisMonthByCode.set(key, (thisMonthByCode.get(key) || 0) + (qty || 0));
      };
      dispensesForUsage.forEach((d) => addQty(d.itemCode, d.adjustedQty));
      salesForUsage.forEach((s) => addQty(s.itemCode, s.adjustedQty));

      const usageMonthLabels = Array.isArray(latestUsageBatch?.usageMonthLabels)
        ? (latestUsageBatch!.usageMonthLabels as string[])
        : ["ย้อนหลัง 1 เดือน", "เดือนนี้"];

      let mapped = rawItems.map((item) => {
        const months = Array.isArray(item.usageMonths)
          ? (item.usageMonths as (number | null)[])
          : [item.usageMonth2, item.usageMonth3];
        const codeKey = fixThaiEncoding(item.itemCode).trim();
        const thisMonthUsage = thisMonthByCode.has(codeKey)
          ? Number(thisMonthByCode.get(codeKey)!.toFixed(2))
          : null;
        const row: any = {
          ...item,
          itemName: item.itemName ? fixThaiEncoding(item.itemName) : null,
          unit: item.unit ? fixThaiEncoding(item.unit) : null,
          category: item.category ? fixThaiEncoding(item.category) : null,
          supplier: item.supplier ? fixThaiEncoding(item.supplier) : null,
          usageMonths: months,
          thisMonthUsage,
          usageMonth3: thisMonthUsage,
        };
        // ฟิลด์ช่วยเรียงคอลัมน์เดือน (ตาม index และตามชื่อเดือน)
        months.forEach((v, i) => {
          row[`usageMonth_${i}`] = v;
          const label = usageMonthLabels[i];
          if (label) row[`month:${label}`] = v;
        });
        return row;
      });

      if (needsMemorySort) {
        mapped.sort((a, b) => compareSortValues(a, b, sortBy, sortOrder));
      }

      const total = totalCountUsage;
      const pageItems =
        needsMemorySort || isAll
          ? limit !== undefined
            ? mapped.slice(skip || 0, (skip || 0) + limit)
            : mapped
          : mapped;

      return NextResponse.json({
        items: pageItems.map((item, idx) => ({
          ...item,
          seq: (skip || 0) + idx + 1,
        })),
        usageMonthLabels,
        selectedPeriod,
        selectedDataGroup: dataGroup,
        availablePeriods,
        periodDataDates,
        pagination: { total, page, limit: limit ?? total, totalPages: limit ? Math.ceil(total / limit) : 1 },
      });
    }

    // ปริมาณการใช้ = ฐานคำนวณจากชุดนำเข้าล่าสุดของกลุ่ม (ไม่ผูกงวดเดียวกับคงเหลือ/ตัดจ่าย/ขาย)
    const latestUsageBatchForCalc = await prisma.importBatch.findFirst({
      where: { fileType: "USAGE", dataGroup },
      orderBy: { createdAt: "desc" },
      select: { id: true, usageMonthLabels: true },
    });

    // 6. Master Overview: รวมข้อมูล 4 ส่วนตามโครงสร้าง Sheet "เหลือ" + ยอดค้างส่ง
    const [balances, dispenses, sales, usages, pendingList] = await Promise.all([
      prisma.inventoryBalance.findMany({
        where: periodFilter,
        select: {
          itemCode: true,
          itemName: true,
          unit: true,
          balanceQty: true,
          minQty: true,
          unitPrice: true,
          totalCost: true,
        },
      }),
      prisma.inventoryDispense.findMany({
        where: periodFilter,
        select: {
          itemCode: true,
          itemName: true,
          unit: true,
          rawQty: true,
          adjustedQty: true,
          unitPrice: true,
          totalCost: true,
        },
      }),
      prisma.inventorySale.findMany({
        where: periodFilter,
        select: {
          itemCode: true,
          itemName: true,
          unit: true,
          rawQty: true,
          adjustedQty: true,
          saleAmount: true,
          costAmount: true,
        },
      }),
      latestUsageBatchForCalc
        ? prisma.inventoryUsage.findMany({
            where: { batchId: latestUsageBatchForCalc.id, dataGroup },
            select: {
              itemCode: true,
              itemName: true,
              unit: true,
              balanceQty: true,
              minQty: true,
              usageMonth1: true,
              usageMonth2: true,
              usageMonth3: true,
              usageMonths: true,
              category: true,
              supplier: true,
            },
          })
        : Promise.resolve([] as any[]),
      (prisma as any).inventoryPendingDelivery.findMany({
        select: {
          itemCode: true,
          qty: true,
        },
      }),
    ]);

    const overviewUsageMonthLabels = Array.isArray(latestUsageBatchForCalc?.usageMonthLabels)
      ? (latestUsageBatchForCalc!.usageMonthLabels as string[])
      : ["ย้อนหลัง 1 เดือน"];

    const pendingMap = new Map<string, number>();
    (pendingList as any[]).forEach((p) => {
      pendingMap.set(p.itemCode.trim(), p.qty);
    });

    const itemMap = new Map<string, any>();

function inferCategoryByCode(code: string, itemName?: string | null): string {
  const c = code.trim();
  const name = itemName ? itemName.toLowerCase() : "";

  if (c.startsWith("XA")) {
    if (name.includes("glove") || name.includes("ถุงมือ")) return "เวชภัณฑ์ 1. (ถุงมือ)";
    if (name.includes("syringe") || name.includes("เข็ม")) return "เวชภัณฑ์ 1. (กระบอกฉีดยา/เข็ม)";
    if (name.includes("tube") || name.includes("สาย")) return "เวชภัณฑ์ 1. (สายยาง/ท่อ)";
    return "เวชภัณฑ์ 1.";
  }
  if (/^[0-9]{4}/.test(c) || /^[A-Z]{2}[0-9]{2}/.test(c)) {
    if (name.includes("syrup") || name.includes("drop") || name.includes("elixir") || name.includes("suspension")) return "ยาน้ำ";
    if (name.includes("tablet") || name.includes("cap") || name.includes("เม็ด")) return "ยาเม็ด";
    if (name.includes("inj") || name.includes("iv") || name.includes("ฉีด")) return "ยาฉีด";
    if (name.includes("cream") || name.includes("gel") || name.includes("ointment")) return "ยาครีม/ภายนอก";
    return "ยา";
  }
  if (c.startsWith("1-") || c.startsWith("2-")) return "วัสดุเครื่องเขียน";
  if (c.startsWith("9-") || c.startsWith("SET-")) return "เครื่องใช้สำหรับผู้ป่วย";
  if (c.startsWith("3-")) return "วัสดุสิ้นเปลืองทั่วไป";
  if (c.startsWith("10-")) return "พัสดุ";
  if (c.startsWith("AS-")) return "เครื่องมือและอุปกรณ์การแพทย์";
  if (c.startsWith("OT-") || c.startsWith("IS-")) return "เวชภัณฑ์ 1.";

  return "เวชภัณฑ์/ยา";
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

    // Step A: เติม Usage & Category & Supplier จากไฟล์ 4 ก่อน
    usages.forEach((u) => {
      const key = fixThaiEncoding(u.itemCode).trim();
      const fixedName = u.itemName ? fixThaiEncoding(u.itemName) : null;
      const fixedUnit = u.unit ? fixThaiEncoding(u.unit) : null;
      let fixedCat = u.category ? fixThaiEncoding(u.category) : null;
      let fixedSup = u.supplier ? fixThaiEncoding(u.supplier) : null;

      if (isCompany(fixedCat) && (!fixedSup || fixedSup === "-")) {
        fixedSup = fixedCat;
        fixedCat = null;
      }
      if (!fixedCat) {
        fixedCat = inferCategoryByCode(key, fixedName);
      }

      itemMap.set(key, {
        itemCode: key,
        itemName: fixedName,
        unit: fixedUnit,
        balanceQty: u.balanceQty ?? null,
        minQty: u.minQty ?? null,
        usageMonth1: u.usageMonth1,
        usageMonth2: u.usageMonth2,
        usageMonth3: u.usageMonth3,
        usageMonths: Array.isArray(u.usageMonths)
          ? (u.usageMonths as (number | null)[])
          : [u.usageMonth2, u.usageMonth3],
        dispenseRawQty: 0,
        dispenseAdjustedQty: 0,
        saleRawQty: 0,
        saleAdjustedQty: 0,
        pendingDelivery: 0,
        category: fixedCat,
        supplier: fixedSup || "-",
      });
    });

    // Step B: เติม Balance & Min จากไฟล์ 1 (อัปเดตยอดคงเหลือจริงล่าสุดของ Store)
    balances.forEach((b) => {
      const key = fixThaiEncoding(b.itemCode).trim();
      const fixedName = b.itemName ? fixThaiEncoding(b.itemName) : null;
      const fixedUnit = b.unit ? fixThaiEncoding(b.unit) : null;

      if (!itemMap.has(key)) {
        itemMap.set(key, {
          itemCode: key,
          itemName: fixedName,
          unit: fixedUnit,
          balanceQty: b.balanceQty,
          minQty: b.minQty,
          usageMonth1: null,
          usageMonth2: null,
          usageMonth3: null,
          dispenseRawQty: 0,
          dispenseAdjustedQty: 0,
          saleRawQty: 0,
          saleAdjustedQty: 0,
          pendingDelivery: 0,
          category: inferCategoryByCode(key, fixedName),
          supplier: "-",
        });
      } else {
        const curr = itemMap.get(key);
        if (!curr.category || curr.category === "-") curr.category = inferCategoryByCode(key, fixedName || curr.itemName);
        // ไฟล์คงเหลือ (เช่น p271069 / 1.คงเหลือ) เป็นยอดนับจริงล่าสุดของ Store ให้อัปเดตแทนที่
        if (b.balanceQty !== null && b.balanceQty !== undefined) {
          curr.balanceQty = b.balanceQty;
        }
        if (b.minQty !== null && b.minQty !== undefined) {
          curr.minQty = b.minQty;
        }
        if (!curr.itemName && fixedName) curr.itemName = fixedName;
        if (!curr.unit && fixedUnit) curr.unit = fixedUnit;
      }
    });

    // Step C: เติม Dispense จากไฟล์ 2
    dispenses.forEach((d) => {
      const key = fixThaiEncoding(d.itemCode).trim();
      const fixedName = d.itemName ? fixThaiEncoding(d.itemName) : null;
      const fixedUnit = d.unit ? fixThaiEncoding(d.unit) : null;

      if (!itemMap.has(key)) {
        itemMap.set(key, {
          itemCode: key,
          itemName: fixedName,
          unit: fixedUnit,
          balanceQty: null,
          minQty: null,
          usageMonth1: null,
          usageMonth2: null,
          usageMonth3: null,
          dispenseRawQty: d.rawQty,
          dispenseAdjustedQty: d.adjustedQty,
          saleRawQty: 0,
          saleAdjustedQty: 0,
          pendingDelivery: 0,
          category: inferCategoryByCode(key, fixedName),
          supplier: "-",
        });
      } else {
        const curr = itemMap.get(key);
        if (!curr.category || curr.category === "-") curr.category = inferCategoryByCode(key, fixedName || curr.itemName);
        curr.dispenseRawQty = (curr.dispenseRawQty || 0) + d.rawQty;
        curr.dispenseAdjustedQty = (curr.dispenseAdjustedQty || 0) + d.adjustedQty;
        if (!curr.itemName && fixedName) curr.itemName = fixedName;
        if (!curr.unit && fixedUnit) curr.unit = fixedUnit;
      }
    });

    // Step D: เติม Sales จากไฟล์ 3
    sales.forEach((s) => {
      const key = fixThaiEncoding(s.itemCode).trim();
      const fixedName = s.itemName ? fixThaiEncoding(s.itemName) : null;
      const fixedUnit = s.unit ? fixThaiEncoding(s.unit) : null;

      if (!itemMap.has(key)) {
        itemMap.set(key, {
          itemCode: key,
          itemName: fixedName,
          unit: fixedUnit,
          balanceQty: null,
          minQty: null,
          usageMonth1: null,
          usageMonth2: null,
          usageMonth3: null,
          dispenseRawQty: 0,
          dispenseAdjustedQty: 0,
          saleRawQty: s.rawQty || 0,
          saleAdjustedQty: s.adjustedQty || 0,
          pendingDelivery: 0,
          category: inferCategoryByCode(key, fixedName),
          supplier: "-",
        });
      } else {
        const curr = itemMap.get(key);
        if (!curr.category || curr.category === "-") curr.category = inferCategoryByCode(key, fixedName || curr.itemName);
        curr.saleRawQty = (curr.saleRawQty || 0) + (s.rawQty || 0);
        curr.saleAdjustedQty = (curr.saleAdjustedQty || 0) + (s.adjustedQty || 0);
        if (!curr.itemName && fixedName) curr.itemName = fixedName;
        if (!curr.unit && fixedUnit) curr.unit = fixedUnit;
      }
    });

    // Step E: คำนวณสูตร MAX, AVG, เหลือ-MAX, สั่งซื้อ ตาม Sheet เหลือ
    const categorySet = new Set<string>();
    const supplierSet = new Set<string>();
    const unitSet = new Set<string>();

    let allItems = Array.from(itemMap.values()).map((item, index) => {
      if (item.category) categorySet.add(item.category);
      if (item.supplier) supplierSet.add(item.supplier);
      if (item.unit && item.unit !== "-") unitSet.add(item.unit);

      // เดือนนี้ (ตัด+ขาย) = ยอดตัดจ่ายปรับปรุง + ยอดขายปรับปรุง
      const m3 = Number(
        ((item.dispenseAdjustedQty || 0) + (item.saleAdjustedQty || 0)).toFixed(2)
      );

      const sourceMonths = Array.isArray(item.usageMonths)
        ? (item.usageMonths as (number | null)[])
        : [item.usageMonth2, item.usageMonth3];
      const sourceLabels = overviewUsageMonthLabels;

      // MAX/AVG จากจำนวนเดือนที่เลือก (เดือนสุดท้าย = ตัด+ขาย)
      const { maxUsage, avgUsage } = computeMaxAvgFromMonthWindow(
        usageDisplayLabels,
        sourceLabels,
        sourceMonths,
        m3
      );

      const balance = item.balanceQty !== null && item.balanceQty !== undefined ? item.balanceQty : 0;
      const diff = Number((balance - maxUsage).toFixed(2)); // เหลือ - MAX
      const needOrder = diff < 0;

      const pendingDelivery = pendingMap.get(item.itemCode) || 0;
      const rawNeeded = needOrder ? Math.abs(diff) : 0;
      const suggestedOrder = Math.max(0, Math.ceil(rawNeeded - pendingDelivery));

      return {
        seq: index + 1,
        itemCode: item.itemCode,
        itemName: item.itemName || "-",
        unit: item.unit || "-",
        balanceQty: item.balanceQty,
        minQty: item.minQty,
        usageMonth1: null,
        usageMonth2: item.usageMonth2,
        usageMonth3: m3,
        usageMonths: sourceMonths,
        dispenseAdjustedQty: item.dispenseAdjustedQty,
        saleAdjustedQty: item.saleAdjustedQty,
        maxUsage,
        avgUsage,
        usageMonthCount,
        diff, // เหลือ - MAX
        needOrder,
        pendingDelivery,
        suggestedOrder,
        category: item.category || "-",
        supplier: item.supplier || "-",
      };
    });

    // Filtering
    if (search) {
      const s = search.toLowerCase();
      allItems = allItems.filter(
        (item) =>
          item.itemCode.toLowerCase().includes(s) ||
          item.itemName.toLowerCase().includes(s) ||
          item.category.toLowerCase().includes(s) ||
          item.supplier.toLowerCase().includes(s)
      );
    }

    if (selectedCategory && selectedCategory !== "ALL") {
      allItems = allItems.filter((item) => item.category === selectedCategory);
    }

    if (selectedSupplier && selectedSupplier !== "ALL") {
      allItems = allItems.filter((item) => item.supplier === selectedSupplier);
    }

    if (selectedUnit && selectedUnit !== "ALL") {
      allItems = allItems.filter((item) => item.unit === selectedUnit);
    }

    if (stockStatus === "NEED_ORDER") {
      allItems = allItems.filter((item) => item.needOrder);
    } else if (stockStatus === "SUFFICIENT") {
      allItems = allItems.filter((item) => !item.needOrder && item.balanceQty !== null);
    }

    // กรองคอลัมน์เหลือ / MIN ตามตัวเลือกในหัวตาราง (ดีฟอลต์ซ่อน "-")
    const isEmptyVal = (v: any) => v === null || v === undefined;
    if (balanceEmpty === "HAS_VALUE") {
      allItems = allItems.filter((item) => !isEmptyVal(item.balanceQty));
    } else if (balanceEmpty === "EMPTY_ONLY") {
      allItems = allItems.filter((item) => isEmptyVal(item.balanceQty));
    }
    if (minEmpty === "HAS_VALUE") {
      allItems = allItems.filter((item) => !isEmptyVal(item.minQty));
    } else if (minEmpty === "EMPTY_ONLY") {
      allItems = allItems.filter((item) => isEmptyVal(item.minQty));
    }

    // Dynamic Column Sorting
    allItems.sort((a: any, b: any) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (valA === null || valA === undefined || valA === "") {
        valA = sortOrder === "asc" ? Infinity : -Infinity;
      }
      if (valB === null || valB === undefined || valB === "") {
        valB = sortOrder === "asc" ? Infinity : -Infinity;
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc"
          ? valA.localeCompare(valB, "th")
          : valB.localeCompare(valA, "th");
      }

      const numA = Number(valA);
      const numB = Number(valB);

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortOrder === "asc" ? numA - numB : numB - numA;
      }

      return 0;
    });

    // Re-assign sequence based on sorted order
    allItems = allItems.map((item, idx) => ({ ...item, seq: idx + 1 }));

    const total = allItems.length;
    const paginatedItems = limit !== undefined ? allItems.slice(skip || 0, (skip || 0) + limit) : allItems;

    const needOrderCount = allItems.filter((i) => i.needOrder).length;
    const sufficientCount = allItems.filter((i) => !i.needOrder && i.balanceQty !== null).length;

    return NextResponse.json({
      items: paginatedItems,
      usageMonthLabels: overviewUsageMonthLabels,
      selectedPeriod,
      selectedDataGroup: dataGroup,
      availablePeriods,
      periodDataDates,
      metrics: {
        // จำนวนรหัสหลังกรอง (ตรงกับ "ทั้งหมด N รายการ" ในตาราง)
        totalUniqueCodes: allItems.length,
        totalCodesAll: itemMap.size,
        totalBalanceRecords: balances.length,
        totalDispenseRecords: dispenses.length,
        totalSaleRecords: sales.length,
        totalUsageRecords: usages.length,
        needOrderCount,
        sufficientCount,
      },
      latestFiles,
      filterOptions: {
        categories: Array.from(categorySet).sort(),
        suppliers: Array.from(supplierSet).sort(),
        units: Array.from(unitSet).sort(),
      },
      pagination: {
        total,
        page,
        limit: limit ?? total,
        totalPages: limit ? Math.ceil(total / limit) : 1,
      },
    });
  } catch (error: any) {
    console.error("Error fetching overview data:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการดึงข้อมูล: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}
