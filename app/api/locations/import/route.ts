import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { ensureItemTypes, getRequestUser, parseItemTypeId } from "@/lib/location-service";
import type { ParsedLocation } from "@/lib/location-parser";

export const maxDuration = 120;

const CHUNK = 1000;
function chunk<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// POST /api/locations/import
// body: { mode: "replace" | "merge", locations: ParsedLocation[] } (แยกวิเคราะห์ไฟล์ฝั่ง client ด้วย lib/location-parser)
export async function POST(req: NextRequest) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    await ensureItemTypes();

    const body = await req.json();
    const mode: "replace" | "merge" = body.mode === "merge" ? "merge" : "replace";
    const input: ParsedLocation[] = Array.isArray(body.locations) ? body.locations : [];

    // ตรวจสอบและทำความสะอาดข้อมูล
    const locMap = new Map<string, ParsedLocation>();
    for (const l of input) {
      const name = String(l?.name || "").trim();
      const itemTypeId = parseItemTypeId(l?.itemTypeId);
      if (!name || !itemTypeId) continue;
      const key = `${name}|${itemTypeId}`;
      const loc = locMap.get(key) || { name, itemTypeId, rowNumber: l.rowNumber || 0, items: [] };
      const codes = new Set(loc.items.map((i) => i.code));
      for (const it of Array.isArray(l.items) ? l.items : []) {
        const code = String(it?.code || "").trim();
        if (!code || codes.has(code)) continue;
        codes.add(code);
        loc.items.push({
          seq: Number(it.seq) || loc.items.length + 1,
          itemTypeId: parseItemTypeId(it.itemTypeId) || itemTypeId,
          code,
          name: String(it.name || code).trim(),
          unit: it.unit ? String(it.unit).trim() : null,
        });
      }
      locMap.set(key, loc);
    }
    const locations = [...locMap.values()];
    if (!locations.length) {
      return NextResponse.json({ error: "ไม่พบข้อมูล Location ในไฟล์" }, { status: 400 });
    }
    const typeIds = [...new Set(locations.map((l) => l.itemTypeId))];

    if (mode === "replace") {
      const locRows = locations.map((l, idx) => ({
        id: crypto.randomUUID(),
        name: l.name,
        itemTypeId: l.itemTypeId,
        sortOrder: idx + 1,
      }));
      const itemRows = locations.flatMap((l, idx) =>
        l.items.map((it) => ({
          locationId: locRows[idx].id,
          itemTypeId: it.itemTypeId,
          seq: it.seq,
          code: it.code,
          name: it.name,
          unit: it.unit,
        }))
      );

      await prisma.$transaction(
        async (tx) => {
          await tx.locationItem.deleteMany({ where: { location: { itemTypeId: { in: typeIds } } } });
          await tx.storageLocation.deleteMany({ where: { itemTypeId: { in: typeIds } } });
          for (const part of chunk(locRows)) await tx.storageLocation.createMany({ data: part });
          for (const part of chunk(itemRows)) await tx.locationItem.createMany({ data: part });
        },
        { timeout: 110_000, maxWait: 20_000 }
      );

      return NextResponse.json({
        success: true,
        mode,
        locationsCreated: locRows.length,
        itemsCreated: itemRows.length,
        itemsUpdated: 0,
      });
    }

    // ---- merge: เพิ่ม/อัปเดต โดยไม่ลบข้อมูลเดิม ----
    const existingLocs = await prisma.storageLocation.findMany({
      where: { itemTypeId: { in: typeIds } },
      select: { id: true, name: true, itemTypeId: true },
    });
    const locIdByKey = new Map(existingLocs.map((l) => [`${l.name}|${l.itemTypeId}`, l.id]));
    const maxSort = await prisma.storageLocation.aggregate({ _max: { sortOrder: true } });
    let sort = maxSort._max.sortOrder ?? 0;

    const newLocs = locations
      .filter((l) => !locIdByKey.has(`${l.name}|${l.itemTypeId}`))
      .map((l) => {
        const id = crypto.randomUUID();
        locIdByKey.set(`${l.name}|${l.itemTypeId}`, id);
        return { id, name: l.name, itemTypeId: l.itemTypeId, sortOrder: ++sort };
      });
    for (const part of chunk(newLocs)) await prisma.storageLocation.createMany({ data: part });

    const locIds = locations.map((l) => locIdByKey.get(`${l.name}|${l.itemTypeId}`)!);
    const existingItems = await prisma.locationItem.findMany({
      where: { locationId: { in: locIds } },
      select: { id: true, locationId: true, code: true, seq: true, name: true, unit: true, itemTypeId: true },
    });
    const itemByKey = new Map(existingItems.map((i) => [`${i.locationId}|${i.code}`, i]));

    const creates: any[] = [];
    const updates: { id: string; data: any }[] = [];
    locations.forEach((l, idx) => {
      const locationId = locIds[idx];
      for (const it of l.items) {
        const ex = itemByKey.get(`${locationId}|${it.code}`);
        if (!ex) {
          creates.push({ locationId, itemTypeId: it.itemTypeId, seq: it.seq, code: it.code, name: it.name, unit: it.unit });
        } else if (ex.seq !== it.seq || ex.name !== it.name || (ex.unit || null) !== it.unit || ex.itemTypeId !== it.itemTypeId) {
          updates.push({ id: ex.id, data: { seq: it.seq, name: it.name, unit: it.unit, itemTypeId: it.itemTypeId } });
        }
      }
    });

    for (const part of chunk(creates)) await prisma.locationItem.createMany({ data: part, skipDuplicates: true });
    for (const part of chunk(updates, 200)) {
      await prisma.$transaction(part.map((u) => prisma.locationItem.update({ where: { id: u.id }, data: u.data })));
    }

    return NextResponse.json({
      success: true,
      mode,
      locationsCreated: newLocs.length,
      itemsCreated: creates.length,
      itemsUpdated: updates.length,
    });
  } catch (error: any) {
    console.error("POST /api/locations/import error:", error);
    return NextResponse.json({ error: error.message || "นำเข้าข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
