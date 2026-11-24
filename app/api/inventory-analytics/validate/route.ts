import { NextRequest, NextResponse } from "next/server";
import { validateAndParseFile, InventoryFileType } from "@/lib/excel-validator";
import { prisma } from "@/lib/prisma";
import {
  parseDataDate,
  parseDataGroup,
  DATA_GROUP_LABELS,
} from "@/lib/inventory-data-group";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const fileType = formData.get("fileType") as InventoryFileType | null;
    const dataGroup = parseDataGroup(formData.get("dataGroup") as string | null);
    const dataDate = parseDataDate(formData.get("dataDate") as string | null);

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

    const result = validateAndParseFile(fileType, buffer);

    const rawPeriod = (formData.get("period") as string) || "";
    const now = new Date();
    const currentPeriodStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const period = rawPeriod.trim() || currentPeriodStr;

    let existingBatchCount = 0;
    let sameDateBatchCount = 0;
    let latestBatch: any = null;
    let isDuplicate = false;
    let duplicateMessage = "";

    try {
      // แทนที่/เพิ่มต่อยอด ใช้กับ "วันที่ของข้อมูล" เดียวกันเท่านั้น
      sameDateBatchCount = dataDate
        ? await prisma.importBatch.count({
            where: { fileType, dataGroup, dataDate },
          })
        : 0;

      existingBatchCount = sameDateBatchCount;

      if (sameDateBatchCount > 0) {
        latestBatch = await prisma.importBatch.findFirst({
          where: { fileType, dataGroup, dataDate: dataDate! },
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
            : "4. ปริมาณการใช้";

        const dataDateLabel = dataDate
          ? `${String(dataDate.getUTCDate()).padStart(2, "0")}/${String(dataDate.getUTCMonth() + 1).padStart(2, "0")}/${dataDate.getUTCFullYear()}`
          : "-";

        duplicateMessage = `ตรวจพบข้อมูลประเภท "${typeName}" กลุ่ม [${DATA_GROUP_LABELS[dataGroup]}] วันที่ของข้อมูล [${dataDateLabel}] อยู่แล้ว (${sameDateBatchCount} ชุด, ล่าสุดไฟล์ "${latestBatch?.fileName || "-"}") — ใช้โหมดแทนที่หรือเพิ่มต่อยอดได้`;
      }
    } catch (dbErr) {
      console.warn("Could not check duplicate batches from DB:", dbErr);
    }

    return NextResponse.json({
      success: true,
      fileName,
      fileSize: file.size,
      period,
      dataGroup,
      dataDate,
      duplicateInfo: {
        isDuplicate,
        existingBatchCount,
        sameDateBatchCount,
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
