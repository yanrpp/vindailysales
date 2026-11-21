import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getRequestUser, parseItemTypeId } from "@/lib/location-service";

// GET /api/locations/export?itemTypeId=1 - ส่งออกทะเบียนในรูปแบบเดียวกับไฟล์ต้นฉบับ (นำเข้ากลับได้)
export async function GET(req: NextRequest) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    const itemTypeId = parseItemTypeId(new URL(req.url).searchParams.get("itemTypeId"));

    const locations = await prisma.storageLocation.findMany({
      where: itemTypeId ? { itemTypeId } : {},
      orderBy: [{ itemTypeId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { items: { orderBy: [{ seq: "asc" }, { createdAt: "asc" }] } },
    });

    const rows: (string | number)[][] = [["location", "itemtype", "code", "name", "unit"]];
    for (const loc of locations) {
      rows.push([loc.name, loc.itemTypeId]);
      for (const it of loc.items) {
        rows.push([it.seq, it.itemTypeId, it.code, it.name, it.unit || ""]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 9 }, { wch: 20 }, { wch: 60 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "location");
    const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `location_${itemTypeId ?? "all"}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/locations/export error:", error);
    return NextResponse.json({ error: error.message || "ส่งออกไม่สำเร็จ" }, { status: 500 });
  }
}
