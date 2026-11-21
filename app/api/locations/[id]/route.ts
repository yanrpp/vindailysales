import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUser, parseItemTypeId } from "@/lib/location-service";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/locations/[id] - แก้ไข Location
export async function PATCH(req: NextRequest, context: Ctx) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    const { id } = await context.params;
    const body = await req.json();
    const current = await prisma.storageLocation.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "ไม่พบ Location" }, { status: 404 });

    const data: any = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description || null;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (body.itemTypeId !== undefined) {
      const t = parseItemTypeId(body.itemTypeId);
      if (!t) return NextResponse.json({ error: "ประเภทคลังไม่ถูกต้อง" }, { status: 400 });
      data.itemTypeId = t;
    }

    const newName = data.name ?? current.name;
    const newType = data.itemTypeId ?? current.itemTypeId;
    if (newName !== current.name || newType !== current.itemTypeId) {
      const dup = await prisma.storageLocation.findUnique({
        where: { name_itemTypeId: { name: newName, itemTypeId: newType } },
      });
      if (dup && dup.id !== id) {
        return NextResponse.json({ error: `Location "${newName}" มีอยู่แล้วในประเภทนี้` }, { status: 409 });
      }
    }

    const [location] = await prisma.$transaction([
      prisma.storageLocation.update({ where: { id }, data }),
      ...(data.itemTypeId && data.itemTypeId !== current.itemTypeId
        ? [prisma.locationItem.updateMany({ where: { locationId: id }, data: { itemTypeId: data.itemTypeId } })]
        : []),
    ]);
    return NextResponse.json({ success: true, location });
  } catch (error: any) {
    console.error("PATCH /api/locations/[id] error:", error);
    return NextResponse.json({ error: error.message || "ไม่สามารถแก้ไขได้" }, { status: 500 });
  }
}

// POST /api/locations/[id] { action: "renumber" } - เรียงลำดับรายการใหม่ 1..n
export async function POST(req: NextRequest, context: Ctx) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    const { id } = await context.params;
    const body = await req.json();
    if (body.action !== "renumber") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    const items = await prisma.locationItem.findMany({
      where: { locationId: id },
      orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
      select: { id: true, seq: true },
    });
    const updates = items
      .map((it, idx) => ({ id: it.id, seq: idx + 1, old: it.seq }))
      .filter((u) => u.seq !== u.old)
      .map((u) => prisma.locationItem.update({ where: { id: u.id }, data: { seq: u.seq } }));
    if (updates.length) await prisma.$transaction(updates);
    return NextResponse.json({ success: true, updated: updates.length });
  } catch (error: any) {
    console.error("POST /api/locations/[id] error:", error);
    return NextResponse.json({ error: error.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}

// DELETE /api/locations/[id]?moveItemsTo=<locationId> - ลบ Location (ย้ายรายการไป Location อื่นได้)
export async function DELETE(req: NextRequest, context: Ctx) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    const { id } = await context.params;
    const moveTo = new URL(req.url).searchParams.get("moveItemsTo");

    if (moveTo) {
      if (moveTo === id) return NextResponse.json({ error: "ปลายทางต้องไม่ใช่ Location เดิม" }, { status: 400 });
      const target = await prisma.storageLocation.findUnique({ where: { id: moveTo } });
      if (!target) return NextResponse.json({ error: "ไม่พบ Location ปลายทาง" }, { status: 404 });

      const [items, targetItems, maxSeq] = await Promise.all([
        prisma.locationItem.findMany({ where: { locationId: id }, orderBy: { seq: "asc" } }),
        prisma.locationItem.findMany({ where: { locationId: moveTo }, select: { code: true } }),
        prisma.locationItem.aggregate({ where: { locationId: moveTo }, _max: { seq: true } }),
      ]);
      const existingCodes = new Set(targetItems.map((t) => t.code));
      let seq = maxSeq._max.seq ?? 0;
      const moves = items
        .filter((it) => !existingCodes.has(it.code))
        .map((it) =>
          prisma.locationItem.update({
            where: { id: it.id },
            data: { locationId: moveTo, itemTypeId: target.itemTypeId, seq: ++seq },
          })
        );
      await prisma.$transaction([...moves, prisma.storageLocation.delete({ where: { id } })]);
      return NextResponse.json({
        success: true,
        moved: moves.length,
        skipped: items.length - moves.length,
      });
    }

    await prisma.storageLocation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/locations/[id] error:", error);
    return NextResponse.json({ error: error.message || "ไม่สามารถลบได้" }, { status: 500 });
  }
}
