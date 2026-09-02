import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileType = searchParams.get("fileType"); // "BALANCE" | "DISPENSE" | "SALE" | "USAGE" | "ALL"

    if (!fileType) {
      return NextResponse.json(
        { error: "กรุณาระบุประเภทข้อมูลที่ต้องการลบ (BALANCE, DISPENSE, SALE, USAGE, หรือ ALL)" },
        { status: 400 }
      );
    }

    if (fileType === "ALL") {
      // ลบทั้งหมด
      const res = await prisma.importBatch.deleteMany({});
      return NextResponse.json({
        success: true,
        message: `ลบข้อมูลรายงานทั้งหมดในฐานข้อมูลเรียบร้อยแล้ว (${res.count} ชุดข้อมูล)`,
        deletedBatches: res.count,
      });
    }

    if (!["BALANCE", "DISPENSE", "SALE", "USAGE"].includes(fileType)) {
      return NextResponse.json(
        { error: "ประเภทข้อมูลไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const res = await prisma.importBatch.deleteMany({
      where: { fileType },
    });

    const typeName =
      fileType === "BALANCE"
        ? "1. ยอดคงเหลือ"
        : fileType === "DISPENSE"
        ? "2. ยอดตัดจ่าย"
        : fileType === "SALE"
        ? "3. ยอดขาย"
        : "4. ปริมาณการใช้ & คู่ค้า";

    return NextResponse.json({
      success: true,
      message: `ลบข้อมูล "${typeName}" ในฐานข้อมูลเรียบร้อยแล้ว (${res.count} ชุดข้อมูล)`,
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
