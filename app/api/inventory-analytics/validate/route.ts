import { NextRequest, NextResponse } from "next/server";
import { validateAndParseFile, InventoryFileType } from "@/lib/excel-validator";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const fileType = formData.get("fileType") as InventoryFileType | null;

    if (!file) {
      return NextResponse.json(
        { error: "กรุณาเลือกไฟล์ที่ต้องการอัปโหลด" },
        { status: 400 }
      );
    }

    if (!fileType || !["BALANCE", "DISPENSE", "SALE", "USAGE"].includes(fileType)) {
      return NextResponse.json(
        { error: "กรุณาระบุประเภทไฟล์ (BALANCE, DISPENSE, SALE, หรือ USAGE)" },
        { status: 400 }
      );
    }

    // ตรวจสอบนามสกุลไฟล์
    const fileName = file.name;
    const isExcel =
      fileName.endsWith(".xls") ||
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".csv");

    if (!isExcel) {
      return NextResponse.json(
        {
          isValid: false,
          errors: [
            {
              message: `ไฟล์ "${fileName}" ไม่ใช่นามสกุล .xls หรือ .xlsx`,
              severity: "error",
            },
          ],
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ทำการ Validate และ Parse
    const result = validateAndParseFile(fileType, buffer);

    // ตรวจสอบประวัติการนำเข้าเดิมในฐานข้อมูล (Duplicate Check)
    let existingBatchCount = 0;
    let latestBatch: any = null;
    let isDuplicate = false;
    let duplicateMessage = "";

    try {
      existingBatchCount = await prisma.importBatch.count({
        where: { fileType },
      });

      if (existingBatchCount > 0) {
        latestBatch = await prisma.importBatch.findFirst({
          where: { fileType },
          orderBy: { createdAt: "desc" },
        });

        isDuplicate = true;
        const typeName =
          fileType === "BALANCE"
            ? "1. ยอดคงเหลือ"
            : fileType === "DISPENSE"
            ? "2. ยอดตัดจ่าย"
            : fileType === "SALE"
            ? "3. ยอดขาย"
            : "4. ปริมาณการใช้ & คู่ค้า";

        const dateStr = latestBatch?.createdAt
          ? new Date(latestBatch.createdAt).toLocaleString("th-TH")
          : "";

        duplicateMessage = `ตรวจพบข้อมูลประเภท "${typeName}" ในฐานข้อมูลแล้ว (${existingBatchCount} รอบ, ล่าสุดไฟล์ "${latestBatch?.fileName || "-"}" เมื่อ ${dateStr})`;
      }
    } catch (dbErr) {
      console.warn("Could not check duplicate batches from DB:", dbErr);
    }

    return NextResponse.json({
      success: true,
      fileName,
      fileSize: file.size,
      duplicateInfo: {
        isDuplicate,
        existingBatchCount,
        latestBatch,
        duplicateMessage,
      },
      ...result,
    });
  } catch (error: any) {
    console.error("Error validating file:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการตรวจสอบไฟล์: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}
