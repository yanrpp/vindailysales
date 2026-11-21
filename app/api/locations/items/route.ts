import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUser, parseItemTypeId } from "@/lib/location-service";

// GET /api/locations/items?locationIds=id1,id2&itemTypeId=&search=&sortBy=&sortOrder=&page=1&pageSize=50
export async function GET(req: NextRequest) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get("locationId") || null;
    const locationIdsParam = searchParams.get("locationIds") || "";
    const locationIds = locationIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (locationId && !locationIds.includes(locationId)) {
      locationIds.push(locationId);
    }

    const itemTypeId = parseItemTypeId(searchParams.get("itemTypeId"));
    const search = searchParams.get("search")?.trim() || "";
    const excludeNone = searchParams.get("excludeNone") === "true";
    const sortBy = searchParams.get("sortBy") || "";
    const sortOrder: "asc" | "desc" = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(200, Math.max(10, Number(searchParams.get("pageSize")) || 50));

    const where: any = {
      ...(locationIds.length === 1
        ? { locationId: locationIds[0] }
        : locationIds.length > 1
        ? { locationId: { in: locationIds } }
        : {}),
      ...(itemTypeId ? { itemTypeId } : {}),
      ...(excludeNone
        ? { NOT: { location: { name: { equals: "NONE", mode: "insensitive" } } } }
        : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
              { unit: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const orderByMap: Record<string, any[]> = {
      seq: [{ seq: sortOrder }, { createdAt: "asc" }],
      location: [{ location: { name: sortOrder } }, { seq: "asc" }],
      itemTypeId: [{ itemTypeId: sortOrder }, { location: { sortOrder: "asc" } }, { seq: "asc" }],
      code: [{ code: sortOrder }, { seq: "asc" }],
      name: [{ name: sortOrder }, { seq: "asc" }],
      unit: [{ unit: sortOrder }, { seq: "asc" }],
    };

    const defaultOrderBy =
      locationIds.length === 1
        ? [{ seq: "asc" }, { createdAt: "asc" }]
        : [{ location: { itemTypeId: "asc" } }, { location: { sortOrder: "asc" } }, { seq: "asc" }];

    const orderBy = orderByMap[sortBy] || defaultOrderBy;

    const locWhere: any = {
      ...(locationIds.length === 1
        ? { id: locationIds[0] }
        : locationIds.length > 1
        ? { id: { in: locationIds } }
        : {}),
      ...(itemTypeId ? { itemTypeId } : {}),
      ...(excludeNone
        ? { NOT: { name: { equals: "NONE", mode: "insensitive" } } }
        : {}),
      ...(search
        ? {
            items: {
              some: {
                OR: [
                  { code: { contains: search, mode: "insensitive" } },
                  { name: { contains: search, mode: "insensitive" } },
                  { unit: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          }
        : {}),
    };

    const [total, items, itemsByType, locsByType] = await Promise.all([
      prisma.locationItem.count({ where }),
      prisma.locationItem.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { location: { select: { id: true, name: true, itemTypeId: true } } },
      }),
      prisma.locationItem.groupBy({
        by: ["itemTypeId"],
        where,
        _count: { _all: true },
      }),
      prisma.storageLocation.groupBy({
        by: ["itemTypeId"],
        where: locWhere,
        _count: { _all: true },
      }),
    ]);

    const itemCountMap = new Map(itemsByType.map((r) => [r.itemTypeId, r._count._all]));
    const locCountMap = new Map(locsByType.map((r) => [r.itemTypeId, r._count._all]));
    const totalLocations = locsByType.reduce((s, r) => s + r._count._all, 0);

    return NextResponse.json({
      success: true,
      items,
      total,
      page,
      pageSize,
      stats: {
        totalLocations,
        totalItems: total,
        byType: {
          1: { locationCount: locCountMap.get(1) || 0, itemCount: itemCountMap.get(1) || 0 },
          2: { locationCount: locCountMap.get(2) || 0, itemCount: itemCountMap.get(2) || 0 },
        },
      },
    });
  } catch (error: any) {
    console.error("GET /api/locations/items error:", error);
    return NextResponse.json({ error: error.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

// POST /api/locations/items - เพิ่มรายการเข้า Location
export async function POST(req: NextRequest) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    const body = await req.json();
    const locationId = String(body.locationId || "");
    const code = String(body.code || "").trim();
    const name = String(body.name || "").trim();
    if (!locationId) return NextResponse.json({ error: "กรุณาเลือก Location" }, { status: 400 });
    if (!code) return NextResponse.json({ error: "กรุณาระบุรหัส (code)" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "กรุณาระบุชื่อรายการ" }, { status: 400 });

    const location = await prisma.storageLocation.findUnique({ where: { id: locationId } });
    if (!location) return NextResponse.json({ error: "ไม่พบ Location" }, { status: 404 });

    const dup = await prisma.locationItem.findUnique({
      where: { locationId_code: { locationId, code } },
    });
    if (dup) {
      return NextResponse.json({ error: `รหัส "${code}" มีอยู่แล้วใน Location ${location.name}` }, { status: 409 });
    }

    let seq = Number(body.seq);
    if (!Number.isFinite(seq) || seq <= 0) {
      const max = await prisma.locationItem.aggregate({ where: { locationId }, _max: { seq: true } });
      seq = (max._max.seq ?? 0) + 1;
    }

    const item = await prisma.locationItem.create({
      data: {
        locationId,
        itemTypeId: location.itemTypeId,
        seq,
        code,
        name,
        unit: body.unit ? String(body.unit).trim() : null,
        note: body.note ? String(body.note).trim() : null,
      },
      include: { location: { select: { id: true, name: true, itemTypeId: true } } },
    });
    return NextResponse.json({ success: true, item });
  } catch (error: any) {
    console.error("POST /api/locations/items error:", error);
    return NextResponse.json({ error: error.message || "ไม่สามารถเพิ่มรายการได้" }, { status: 500 });
  }
}
