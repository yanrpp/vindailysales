import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUser, parseItemTypeId } from "@/lib/location-service";

export interface LinkedStoreItem {
  code: string;
  name: string;
  unit: string | null;
  itemTypeId: number;
  itemTypeName: string;
  locationName: string;
  locations: string[];
}

export async function lookupStoreItems(codes: string[]): Promise<Map<string, LinkedStoreItem>> {
  const uniqueCodes = [...new Set(codes.filter(Boolean))];
  if (!uniqueCodes.length) return new Map();

  const rows = await prisma.locationItem.findMany({
    where: { code: { in: uniqueCodes } },
    include: {
      location: { select: { name: true, itemTypeId: true } },
      itemType: { select: { id: true, name: true } },
    },
    orderBy: [{ itemTypeId: "asc" }, { seq: "asc" }],
  });

  const map = new Map<string, LinkedStoreItem>();
  for (const r of rows) {
    const existing = map.get(r.code);
    const locName = r.location?.name || "NONE";
    if (!existing) {
      map.set(r.code, {
        code: r.code,
        name: r.name,
        unit: r.unit,
        itemTypeId: r.itemTypeId,
        itemTypeName: r.itemType?.name || (r.itemTypeId === 1 ? "Mainstore" : "พัสดุ"),
        locationName: locName,
        locations: [locName],
      });
    } else {
      if (!existing.locations.includes(locName)) existing.locations.push(locName);
      // ให้ความสำคัญกับ Location ที่ไม่ใช่ NONE เป็นตัวหลัก
      if (existing.locationName.toUpperCase() === "NONE" && locName.toUpperCase() !== "NONE") {
        existing.locationName = locName;
        existing.name = r.name;
        existing.unit = r.unit;
        existing.itemTypeId = r.itemTypeId;
        existing.itemTypeName = r.itemType?.name || existing.itemTypeName;
      }
    }
  }
  return map;
}

// GET /api/requisitions
// Query: dateFrom, dateTo, departments (comma-sep), action, itemTypeId (1|2), search, sortBy, sortOrder, page, pageSize
export async function GET(req: NextRequest) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom")?.trim() || "";
    const dateTo = searchParams.get("dateTo")?.trim() || "";
    const departmentsParam = searchParams.get("departments") || "";
    const departments = departmentsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const action = searchParams.get("action")?.trim() || "";
    const itemTypeId = parseItemTypeId(searchParams.get("itemTypeId"));
    const search = searchParams.get("search")?.trim() || "";
    const sortBy = searchParams.get("sortBy") || "";
    const sortOrder: "asc" | "desc" = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(200, Math.max(10, Number(searchParams.get("pageSize")) || 50));

    const andConditions: any[] = [];

    if (dateFrom) {
      andConditions.push({ requestDate: { gte: new Date(`${dateFrom}T00:00:00.000Z`) } });
    }
    if (dateTo) {
      andConditions.push({ requestDate: { lte: new Date(`${dateTo}T23:59:59.999Z`) } });
    }
    if (departments.length === 1) {
      andConditions.push({ department: departments[0] });
    } else if (departments.length > 1) {
      andConditions.push({ department: { in: departments } });
    }
    if (action) {
      andConditions.push({ action });
    }

    // กรองตามประเภทคลังจากทะเบียน ITEMSTORE (location_items)
    if (itemTypeId) {
      const typeCodes = await prisma.locationItem.findMany({
        where: { itemTypeId },
        select: { code: true },
        distinct: ["code"],
      });
      andConditions.push({ code: { in: typeCodes.map((c) => c.code) } });
    }

    // ค้นหาครอบคลุมทั้งใบเบิก หน่วยงาน รหัส ชื่อในไฟล์ และชื่อในทะเบียน ITEMSTORE
    if (search) {
      const matchedStore = await prisma.locationItem.findMany({
        where: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { location: { name: { contains: search, mode: "insensitive" } } },
          ],
        },
        select: { code: true },
        distinct: ["code"],
        take: 500,
      });
      const matchedCodes = matchedStore.map((m) => m.code);
      andConditions.push({
        OR: [
          { requisitionNo: { contains: search, mode: "insensitive" } },
          { department: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          ...(matchedCodes.length ? [{ code: { in: matchedCodes } }] : []),
        ],
      });
    }

    const where = andConditions.length ? { AND: andConditions } : {};

    const orderByMap: Record<string, any[]> = {
      requestDate: [{ requestDate: sortOrder }, { requisitionNo: "asc" }, { suf: "asc" }],
      requisitionNo: [{ requisitionNo: sortOrder }, { suf: "asc" }],
      department: [{ department: sortOrder }, { requestDate: "desc" }, { requisitionNo: "asc" }],
      action: [{ action: sortOrder }, { requestDate: "desc" }],
      code: [{ code: sortOrder }, { requestDate: "desc" }],
      qtyRequist: [{ qtyRequist: sortOrder }, { requestDate: "desc" }],
    };
    const orderBy = orderByMap[sortBy] || [
      { requestDate: "desc" },
      { requisitionNo: "asc" },
      { suf: "asc" },
    ];

    const [
      total,
      records,
      qtyAgg,
      distinctReqs,
      distinctDepts,
      allDepts,
      allActions,
      allDates,
      batches,
    ] = await Promise.all([
      prisma.departmentRequisition.count({ where }),
      prisma.departmentRequisition.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.departmentRequisition.aggregate({
        where,
        _sum: { qtyRequist: true },
      }),
      prisma.departmentRequisition.groupBy({
        by: ["requisitionNo"],
        where,
      }),
      prisma.departmentRequisition.groupBy({
        by: ["department"],
        where,
      }),
      prisma.departmentRequisition.groupBy({
        by: ["department"],
        _count: { _all: true },
        orderBy: { department: "asc" },
      }),
      prisma.departmentRequisition.groupBy({
        by: ["action"],
        _count: { _all: true },
        orderBy: { action: "asc" },
      }),
      prisma.departmentRequisition.groupBy({
        by: ["requestDate"],
        _count: { _all: true },
        orderBy: { requestDate: "desc" },
      }),
      prisma.requisitionBatch.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const storeMap = await lookupStoreItems(records.map((r) => r.code));

    const enriched = records.map((r) => {
      const store = storeMap.get(r.code) || null;
      return {
        id: r.id,
        requisitionNo: r.requisitionNo,
        requestDate: r.requestDate.toISOString().slice(0, 10),
        requestDateText: r.requestDateText,
        department: r.department,
        suf: r.suf,
        action: r.action,
        code: r.code,
        qtyRequist: r.qtyRequist,
        // เชื่อมโยงการแสดงผลจากทะเบียน ITEMSTORE (location_items) พร้อมค่าสำรองจากไฟล์
        itemName: store?.name || r.description || r.code,
        unit: store?.unit || r.unit || "-",
        locationName: store?.locationName || null,
        locations: store?.locations || [],
        itemTypeId: store?.itemTypeId || null,
        itemTypeName: store?.itemTypeName || null,
        inRegistry: Boolean(store),
      };
    });

    return NextResponse.json({
      success: true,
      items: enriched,
      total,
      page,
      pageSize,
      stats: {
        totalRows: total,
        totalRequisitions: distinctReqs.length,
        totalDepartments: distinctDepts.length,
        totalQty: qtyAgg._sum.qtyRequist || 0,
      },
      filters: {
        departments: allDepts.map((d) => ({ name: d.department, count: d._count._all })),
        actions: allActions.map((a) => ({ name: a.action, count: a._count._all })),
        dates: allDates.map((d) => ({
          date: d.requestDate.toISOString().slice(0, 10),
          count: d._count._all,
        })),
      },
      batches,
    });
  } catch (error: any) {
    console.error("GET /api/requisitions error:", error);
    return NextResponse.json({ error: error.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

// DELETE /api/requisitions?id=... | ?batchId=... | ?date=YYYY-MM-DD
export async function DELETE(req: NextRequest) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const batchId = searchParams.get("batchId");
    const date = searchParams.get("date");

    if (id) {
      await prisma.departmentRequisition.delete({ where: { id } });
      return NextResponse.json({ success: true, deleted: 1 });
    }
    if (batchId) {
      const res = await prisma.departmentRequisition.deleteMany({ where: { batchId } });
      await prisma.requisitionBatch.delete({ where: { id: batchId } }).catch(() => {});
      return NextResponse.json({ success: true, deleted: res.count });
    }
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(`${date}T23:59:59.999Z`);
      const res = await prisma.departmentRequisition.deleteMany({
        where: { requestDate: { gte: start, lte: end } },
      });
      return NextResponse.json({ success: true, deleted: res.count });
    }
    return NextResponse.json({ error: "กรุณาระบุ id, batchId หรือ date" }, { status: 400 });
  } catch (error: any) {
    console.error("DELETE /api/requisitions error:", error);
    return NextResponse.json({ error: error.message || "ไม่สามารถลบข้อมูลได้" }, { status: 500 });
  }
}
