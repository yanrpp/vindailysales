import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileType = searchParams.get("fileType"); // "BALANCE" | "DISPENSE" | "SALE" | "USAGE" | "ALL"
    const period = searchParams.get("period")?.trim(); // งวด เช่น "2026-10"

    if (!fileType) {
      return NextResponse.json(
        { error: "กรุณาระบุประเภทข้อมูลที่ต้องการลบ (BALANCE, DISPENSE, SALE, USAGE, หรือ ALL)" },
        { status: 400 }
      );
    }

    const whereClause: any = {};
    if (fileType !== "ALL") {
      if (!["BALANCE", "DISPENSE", "SALE", "USAGE"].includes(fileType)) {
        return NextResponse.json(
          { error: "ประเภทข้อมูลไม่ถูกต้อง" },
          { status: 400 }
        );
      }
      whereClause.fileType = fileType;
    }
    if (period && period !== "ALL") {
      whereClause.period = period;
    }

    const res = await prisma.importBatch.deleteMany({
      where: whereClause,
    });

    const typeName =
      fileType === "ALL"
        ? "ทั้งหมด"
        : fileType === "BALANCE"
        ? "1. ยอดคงเหลือ"
        : fileType === "DISPENSE"
        ? "2. ยอดตัดจ่าย"
        : fileType === "SALE"
        ? "3. ยอดขาย"
        : "4. ปริมาณการใช้ & คู่ค้า";

    const periodText = period && period !== "ALL" ? ` ในงวด [${period}]` : "";

    return NextResponse.json({
      success: true,
      message: `ลบข้อมูล "${typeName}"${periodText} เรียบร้อยแล้ว (${res.count} ชุดข้อมูล)`,
      deletedBatches: res.count,
    });
  } catch (error: any) {
    console.error("Error clearing inventory data:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการลบข้อมูล: " + (error.message || "Database error") },
      { status: 500 }
    );
  }
}
