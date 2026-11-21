import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureItemTypes, getRequestUser, parseItemTypeId } from "@/lib/location-service";

// GET /api/locations?itemTypeId=1&search=1F - รายการ Location พร้อมจำนวนรายการ
export async function GET(req: NextRequest) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const itemTypeId = parseItemTypeId(searchParams.get("itemTypeId"));
    const search = searchParams.get("search")?.trim() || "";

    const locations = await prisma.storageLocation.findMany({
      where: {
        ...(itemTypeId ? { itemTypeId } : {}),
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: [{ itemTypeId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { items: true } } },
    });

    return NextResponse.json({
      success: true,
      locations: locations.map((l) => ({
        id: l.id,
        name: l.name,
        itemTypeId: l.itemTypeId,
        description: l.description,
        isActive: l.isActive,
        sortOrder: l.sortOrder,
        itemCount: l._count.items,
      })),
    });
  } catch (error: any) {
    console.error("GET /api/locations error:", error);
    return NextResponse.json({ error: error.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

// POST /api/locations - เพิ่ม Location ใหม่
export async function POST(req: NextRequest) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    await ensureItemTypes();
    const body = await req.json();
    const name = String(body.name || "").trim();
    const itemTypeId = parseItemTypeId(body.itemTypeId);
    if (!name) return NextResponse.json({ error: "กรุณาระบุชื่อ Location" }, { status: 400 });
    if (!itemTypeId) return NextResponse.json({ error: "ประเภทคลังไม่ถูกต้อง" }, { status: 400 });

    const exists = await prisma.storageLocation.findUnique({
      where: { name_itemTypeId: { name, itemTypeId } },
    });
    if (exists) {
      return NextResponse.json({ error: `Location "${name}" มีอยู่แล้วในประเภทนี้` }, { status: 409 });
    }

    const maxSort = await prisma.storageLocation.aggregate({
      where: { itemTypeId },
      _max: { sortOrder: true },
    });

    const location = await prisma.storageLocation.create({
      data: {
        name,
        itemTypeId,
        description: body.description ? String(body.description) : null,
        isActive: body.isActive !== false,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json({ success: true, location: { ...location, itemCount: 0 } });
  } catch (error: any) {
    console.error("POST /api/locations error:", error);
    return NextResponse.json({ error: error.message || "ไม่สามารถเพิ่ม Location ได้" }, { status: 500 });
  }
}
