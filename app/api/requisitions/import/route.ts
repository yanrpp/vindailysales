import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUser } from "@/lib/location-service";
import { parseRequisitionWorkbook } from "@/lib/requisition-parser";

export const maxDuration = 60;

// POST /api/requisitions/import (multipart/form-data: file, mode = "replace_dates" | "append")
// ตรวจสอบโครงสร้างไฟล์ที่ฝั่งเซิร์ฟเวอร์อย่างเข้มงวด (ไม่สนใจชื่อไฟล์)
export async function POST(req: NextRequest) {
  try {
    const user = getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const mode = formData.get("mode") === "append" ? "append" : "replace_dates";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "กรุณาอัปโหลดไฟล์ Excel" }, { status: 400 });
    }

    const buf = await file.arrayBuffer();
    const parsed = parseRequisitionWorkbook(buf);

    if (!parsed.valid) {
      return NextResponse.json(
        {
          error: "โครงสร้างไฟล์ไม่ตรงตามรูปแบบที่กำหนด ไม่อนุญาตให้นำเข้า",
          details: parsed.errors,
        },
        { status: 400 }
      );
    }

    const uniqueDates = parsed.summary.uniqueDates;
    const dateFrom = uniqueDates.length ? new Date(`${uniqueDates[0]}T00:00:00.000Z`) : null;
    const dateTo = uniqueDates.length
      ? new Date(`${uniqueDates[uniqueDates.length - 1]}T00:00:00.000Z`)
      : null;

    let replacedCount = 0;

    const batch = await prisma.$transaction(
      async (tx) => {
        if (mode === "replace_dates" && uniqueDates.length > 0) {
          const delRes = await tx.departmentRequisition.deleteMany({
            where: {
              requestDate: {
                in: uniqueDates.map((d) => new Date(`${d}T00:00:00.000Z`)),
              },
            },
          });
          replacedCount = delRes.count;
        }

        const createdBatch = await tx.requisitionBatch.create({
          data: {
            fileName: file.name,
            dateFrom,
            dateTo,
            totalRows: parsed.rows.length,
            uploadedBy: user.username,
          },
        });

        const CHUNK = 500;
        for (let i = 0; i < parsed.rows.length; i += CHUNK) {
          const part = parsed.rows.slice(i, i + CHUNK);
          await tx.departmentRequisition.createMany({
            data: part.map((r) => ({
              batchId: createdBatch.id,
              requisitionNo: r.requisitionNo,
              requestDate: new Date(`${r.requestDate}T00:00:00.000Z`),
              requestDateText: r.requestDateText,
              department: r.department,
              suf: r.suf,
              action: r.action,
              code: r.code,
              description: r.description,
              unit: r.unit,
              qtyRequist: r.qtyRequist,
            })),
          });
        }

        return createdBatch;
      },
      { timeout: 55_000 }
    );

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      importedRows: parsed.rows.length,
      replacedCount,
      summary: parsed.summary,
    });
  } catch (error: any) {
    console.error("POST /api/requisitions/import error:", error);
    return NextResponse.json({ error: error.message || "นำเข้าข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
