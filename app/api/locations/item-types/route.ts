import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureItemTypes, getRequestUser } from "@/lib/location-service";

// GET /api/locations/item-types - ประเภทคลัง พร้อมสถิติจำนวน Location และรายการ
export async function GET(req: NextRequest) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    await ensureItemTypes();
    const types = await prisma.itemType.findMany({
      orderBy: { id: "asc" },
      include: { _count: { select: { locations: true, items: true } } },
    });
    return NextResponse.json({
      success: true,
      itemTypes: types.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        description: t.description,
        locationCount: t._count.locations,
        itemCount: t._count.items,
      })),
    });
  } catch (error: any) {
    console.error("GET /api/locations/item-types error:", error);
    return NextResponse.json({ error: error.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
