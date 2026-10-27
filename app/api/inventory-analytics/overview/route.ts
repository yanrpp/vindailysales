import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fixThaiEncoding } from "@/lib/excel-validator";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") || "overview"; // "overview" | "balance" | "dispense" | "sale" | "usage" | "batches"
    const search = searchParams.get("search")?.trim() || "";
    const selectedCategory = searchParams.get("category")?.trim() || "";
    const selectedSupplier = searchParams.get("supplier")?.trim() || "";
    const selectedUnit = searchParams.get("unit")?.trim() || "";
    const stockStatus = searchParams.get("stockStatus")?.trim() || "ALL"; // "ALL" | "NEED_ORDER" | "SUFFICIENT"
    const sortBy = searchParams.get("sortBy")?.trim() || "seq";
    const sortOrder = searchParams.get("sortOrder")?.toLowerCase() === "desc" ? "desc" : "asc";

    const isAll = searchParams.get("all") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = isAll
      ? undefined
      : Math.max(10, Math.min(200, parseInt(searchParams.get("limit") || "50")));
    const skip = limit !== undefined ? (page - 1) * limit : undefined;

    // หา Available Periods ทั้งหมดที่มีในระบบ
    const distinctBatches = await prisma.importBatch.findMany({
      where: { period: { not: null } },
      select: { period: true },
      distinct: ["period"],
      orderBy: { period: "desc" },
    });
    const availablePeriods = distinctBatches
      .map((b) => b.period as string)
      .filter(Boolean);

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

    const periodFilter = selectedPeriod !== "ALL" ? { period: selectedPeriod } : {};

    // 1. Tab Batches
    if (tab === "batches") {
      const batchWhere: any = {};
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
        selectedPeriod,
        availablePeriods,
        pagination: { total, page, limit: limit ?? total, totalPages: limit ? Math.ceil(total / limit) : 1 },
      });
    }

    // 2. Tab Balance
    if (tab === "balance") {
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

      const total = await prisma.inventoryBalance.count({ where });
      const items = await prisma.inventoryBalance.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
        include: { batch: true },
      });

      return NextResponse.json({
        items: items.map((item) => ({
          ...item,
          itemName: item.itemName ? fixThaiEncoding(item.itemName) : null,
          unit: item.unit ? fixThaiEncoding(item.unit) : null,
        })),
        selectedPeriod,
        availablePeriods,
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
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
        include: { batch: true },
      });

      return NextResponse.json({
        items: items.map((item) => ({
          ...item,
          itemName: item.itemName ? fixThaiEncoding(item.itemName) : null,
          unit: item.unit ? fixThaiEncoding(item.unit) : null,
        })),
        selectedPeriod,
        availablePeriods,
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
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
        include: { batch: true },
      });

      return NextResponse.json({
        items: items.map((item) => ({
          ...item,
          itemName: item.itemName ? fixThaiEncoding(item.itemName) : null,
          unit: item.unit ? fixThaiEncoding(item.unit) : null,
        })),
        selectedPeriod,
        availablePeriods,
        pagination: { total, page, limit: limit ?? total, totalPages: limit ? Math.ceil(total / limit) : 1 },
      });
    }

    // 5. Tab Usage (ปริมาณการใช้ & คู่ค้า)
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

      const total = await prisma.inventoryUsage.count({ where });
      const items = await prisma.inventoryUsage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
        include: { batch: true },
      });

      return NextResponse.json({
        items: items.map((item) => ({
          ...item,
          itemName: item.itemName ? fixThaiEncoding(item.itemName) : null,
          unit: item.unit ? fixThaiEncoding(item.unit) : null,
          category: item.category ? fixThaiEncoding(item.category) : null,
          supplier: item.supplier ? fixThaiEncoding(item.supplier) : null,
        })),
        selectedPeriod,
        availablePeriods,
        pagination: { total, page, limit: limit ?? total, totalPages: limit ? Math.ceil(total / limit) : 1 },
      });
    }

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
      prisma.inventoryUsage.findMany({
        where: periodFilter,
        select: {
          itemCode: true,
          itemName: true,
          unit: true,
          usageMonth1: true,
          usageMonth2: true,
          usageMonth3: true,
          category: true,
          supplier: true,
        },
      }),
      (prisma as any).inventoryPendingDelivery.findMany({
        select: {
          itemCode: true,
          qty: true,
        },
      }),
    ]);

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
        balanceQty: null,
        minQty: null,
        usageMonth1: u.usageMonth1,
        usageMonth2: u.usageMonth2,
        usageMonth3: u.usageMonth3,
        dispenseRawQty: 0,
        dispenseAdjustedQty: 0,
        saleRawQty: 0,
        saleAdjustedQty: 0,
        pendingDelivery: 0,
        category: fixedCat,
        supplier: fixedSup || "-",
      });
    });

    // Step B: เติม Balance & Min จากไฟล์ 1
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
        curr.balanceQty = (curr.balanceQty || 0) + (b.balanceQty || 0);
        curr.minQty = b.minQty || curr.minQty;
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

      // ถ้าไม่มี usageMonth3 ในไฟล์ 4 ให้นำ (ตัดจ่ายปรับปรุง + ขายปรับปรุง) มาใช้เป็นปริมาณการใช้เดือนล่าสุด
      const currentPeriodUsage = (item.dispenseAdjustedQty || 0) + (item.saleAdjustedQty || 0);
      const m3 = item.usageMonth3 !== null && item.usageMonth3 !== undefined ? item.usageMonth3 : (currentPeriodUsage > 0 ? currentPeriodUsage : null);

      const u1 = item.usageMonth1 !== null && item.usageMonth1 !== undefined ? item.usageMonth1 : 0;
      const u2 = item.usageMonth2 !== null && item.usageMonth2 !== undefined ? item.usageMonth2 : 0;
      const u3 = m3 !== null && m3 !== undefined ? m3 : 0;

      const maxUsage = Math.max(u1, u2, u3);
      const avgUsage = Number(((u1 + u2 + u3) / 3).toFixed(2));
      
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
        usageMonth1: item.usageMonth1,
        usageMonth2: item.usageMonth2,
        usageMonth3: m3,
        dispenseAdjustedQty: item.dispenseAdjustedQty,
        saleAdjustedQty: item.saleAdjustedQty,
        maxUsage,
        avgUsage,
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
      selectedPeriod,
      availablePeriods,
      metrics: {
        totalUniqueCodes: itemMap.size,
        totalBalanceRecords: balances.length,
        totalDispenseRecords: dispenses.length,
        totalSaleRecords: sales.length,
        totalUsageRecords: usages.length,
        needOrderCount,
        sufficientCount,
      },
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
