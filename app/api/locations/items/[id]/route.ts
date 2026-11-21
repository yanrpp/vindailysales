import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUser } from "@/lib/location-service";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/locations/items/[id] - แก้ไข / ย้าย Location / เลื่อนลำดับ (move: "up" | "down")
export async function PATCH(req: NextRequest, context: Ctx) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    const { id } = await context.params;
    const body = await req.json();
    const item = await prisma.locationItem.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

    // เลื่อนลำดับขึ้น/ลง (สลับ seq กับรายการข้างเคียง)
    if (body.move === "up" || body.move === "down") {
      const neighbor = await prisma.locationItem.findFirst({
        where: {
          locationId: item.locationId,
          seq: body.move === "up" ? { lt: item.seq } : { gt: item.seq },
        },
        orderBy: { seq: body.move === "up" ? "desc" : "asc" },
      });
      if (!neighbor) return NextResponse.json({ success: true, unchanged: true });
      await prisma.$transaction([
        prisma.locationItem.update({ where: { id: item.id }, data: { seq: neighbor.seq } }),
        prisma.locationItem.update({ where: { id: neighbor.id }, data: { seq: item.seq } }),
      ]);
      return NextResponse.json({ success: true });
    }

    const data: any = {};
    if (typeof body.code === "string" && body.code.trim()) data.code = body.code.trim();
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.unit !== undefined) data.unit = body.unit ? String(body.unit).trim() : null;
    if (body.note !== undefined) data.note = body.note ? String(body.note).trim() : null;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (body.seq !== undefined && Number(body.seq) > 0) data.seq = Number(body.seq);

    const targetLocationId: string =
      body.locationId && body.locationId !== item.locationId ? String(body.locationId) : item.locationId;

    if (targetLocationId !== item.locationId) {
      const target = await prisma.storageLocation.findUnique({ where: { id: targetLocationId } });
      if (!target) return NextResponse.json({ error: "ไม่พบ Location ปลายทาง" }, { status: 404 });
      data.locationId = targetLocationId;
      data.itemTypeId = target.itemTypeId;
      if (data.seq === undefined) {
        const max = await prisma.locationItem.aggregate({
          where: { locationId: targetLocationId },
          _max: { seq: true },
        });
        data.seq = (max._max.seq ?? 0) + 1;
      }
    }

    const newCode = data.code ?? item.code;
    if (newCode !== item.code || targetLocationId !== item.locationId) {
      const dup = await prisma.locationItem.findUnique({
        where: { locationId_code: { locationId: targetLocationId, code: newCode } },
      });
      if (dup && dup.id !== id) {
        return NextResponse.json({ error: `รหัส "${newCode}" มีอยู่แล้วใน Location ปลายทาง` }, { status: 409 });
      }
    }

    const updated = await prisma.locationItem.update({
      where: { id },
      data,
      include: { location: { select: { id: true, name: true, itemTypeId: true } } },
    });
    return NextResponse.json({ success: true, item: updated });
  } catch (error: any) {
    console.error("PATCH /api/locations/items/[id] error:", error);
    return NextResponse.json({ error: error.message || "ไม่สามารถแก้ไขได้" }, { status: 500 });
  }
}

// DELETE /api/locations/items/[id]
export async function DELETE(req: NextRequest, context: Ctx) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    const { id } = await context.params;
    await prisma.locationItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/locations/items/[id] error:", error);
    return NextResponse.json({ error: error.message || "ไม่สามารถลบได้" }, { status: 500 });
  }
}
