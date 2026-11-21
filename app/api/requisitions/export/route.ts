import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getRequestUser, parseItemTypeId } from "@/lib/location-service";
import { lookupStoreItems } from "@/app/api/requisitions/route";

// GET /api/requisitions/export - ส่งออกข้อมูลการเบิกตามตัวกรองปัจจุบันเป็น Excel
export async function GET(req: NextRequest) {
  try {
    if (!getRequestUser(req)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom")?.trim() || "";
    const dateTo = searchParams.get("dateTo")?.trim() || "";
    const departments = (searchParams.get("departments") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const action = searchParams.get("action")?.trim() || "";
    const itemTypeId = parseItemTypeId(searchParams.get("itemTypeId"));
    const search = searchParams.get("search")?.trim() || "";

    const andConditions: any[] = [];
    if (dateFrom) andConditions.push({ requestDate: { gte: new Date(`${dateFrom}T00:00:00.000Z`) } });
    if (dateTo) andConditions.push({ requestDate: { lte: new Date(`${dateTo}T23:59:59.999Z`) } });
    if (departments.length === 1) andConditions.push({ department: departments[0] });
    else if (departments.length > 1) andConditions.push({ department: { in: departments } });
    if (action) andConditions.push({ action });
    if (itemTypeId) {
      const typeCodes = await prisma.locationItem.findMany({
        where: { itemTypeId },
        select: { code: true },
        distinct: ["code"],
      });
      andConditions.push({ code: { in: typeCodes.map((c) => c.code) } });
    }
    if (search) {
      andConditions.push({
        OR: [
          { requisitionNo: { contains: search, mode: "insensitive" } },
          { department: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const records = await prisma.departmentRequisition.findMany({
      where: andConditions.length ? { AND: andConditions } : {},
      orderBy: [{ requestDate: "desc" }, { requisitionNo: "asc" }, { suf: "asc" }],
      take: 50000,
    });

    const storeMap = await lookupStoreItems(records.map((r) => r.code));

    const rows: (string | number)[][] = [
      [
        "วันที่ขอเบิก",
        "เลขที่ใบเบิก (requisition_no)",
        "หน่วยงาน (department)",
        "Suf",
        "Act (action)",
        "รหัสสินค้า (code)",
        "ชื่อสินค้า (ITEMSTORE)",
        "Location",
        "ประเภทคลัง",
        "จำนวนขอเบิก (qty_requist)",
        "หน่วย",
      ],
    ];

    for (const r of records) {
      const store = storeMap.get(r.code);
      rows.push([
        r.requestDateText || r.requestDate.toISOString().slice(0, 10),
        r.requisitionNo,
        r.department,
        r.suf ?? "",
        r.action,
        r.code,
        store?.name || r.description || r.code,
        store?.locationName || "-",
        store?.itemTypeName || "-",
        r.qtyRequist,
        store?.unit || r.unit || "-",
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 14 },
      { wch: 16 },
      { wch: 30 },
      { wch: 6 },
      { wch: 8 },
      { wch: 18 },
      { wch: 48 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "requisitions");
    const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `requisitions_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/requisitions/export error:", error);
    return NextResponse.json({ error: error.message || "ส่งออกไม่สำเร็จ" }, { status: 500 });
  }
}
