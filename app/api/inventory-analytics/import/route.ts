import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAndParseFile, InventoryFileType } from "@/lib/excel-validator";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const fileType = formData.get("fileType") as InventoryFileType | null;
    const note = (formData.get("note") as string) || null;
    const importMode = (formData.get("importMode") as string) || "OVERWRITE"; // "OVERWRITE" | "APPEND"

    if (!file || !fileType) {
      return NextResponse.json(
        { error: "ข้อมูลไม่ครบถ้วน (ต้องการไฟล์และประเภทไฟล์)" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate ก่อนบันทึกจริง
    const validation = validateAndParseFile(fileType, buffer);

    if (!validation.isValid || validation.parsedData.length === 0) {
      return NextResponse.json(
        {
          error: "โครงสร้างไฟล์ไม่ถูกต้อง ไม่อนุญาตให้นำเข้า",
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    // หากเลือกโหมดแทนที่ (OVERWRITE) ให้ลบข้อมูลชุดเดิมของประเภทนี้ออกก่อน
    let replacedBatchCount = 0;
    if (importMode === "OVERWRITE") {
      const deleteResult = await prisma.importBatch.deleteMany({
        where: { fileType },
      });
      replacedBatchCount = deleteResult.count;
    }

    // บันทึกรอบนำเข้าใหม่เข้า Database
    const batch = await prisma.importBatch.create({
      data: {
        fileType,
        fileName: file.name,
        totalRows: validation.totalRows,
        importedRows: validation.validRows,
        fileSize: file.size,
        note: note ? `${note} (โหมด: ${importMode === "OVERWRITE" ? "แทนที่ข้อมูลเดิม" : "เพิ่มเป็นรอบใหม่"})` : null,
      },
    });

    // Chunk records into batches of 500 to avoid payload limits
    const CHUNK_SIZE = 500;
    const dataList = validation.parsedData;

    if (fileType === "BALANCE") {
      for (let i = 0; i < dataList.length; i += CHUNK_SIZE) {
        const chunk = dataList.slice(i, i + CHUNK_SIZE);
        await prisma.inventoryBalance.createMany({
          data: chunk.map((item) => ({
            batchId: batch.id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            unit: item.unit,
            balanceQty: item.balanceQty,
            minQty: item.minQty,
            unitPrice: item.unitPrice,
            totalCost: item.totalCost,
          })),
        });
      }
    } else if (fileType === "DISPENSE") {
      for (let i = 0; i < dataList.length; i += CHUNK_SIZE) {
        const chunk = dataList.slice(i, i + CHUNK_SIZE);
        await prisma.inventoryDispense.createMany({
          data: chunk.map((item) => ({
            batchId: batch.id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            unit: item.unit,
            rawQty: item.rawQty,
            adjustedQty: item.adjustedQty,
            unitPrice: item.unitPrice,
            totalCost: item.totalCost,
          })),
        });
      }
    } else if (fileType === "SALE") {
      for (let i = 0; i < dataList.length; i += CHUNK_SIZE) {
        const chunk = dataList.slice(i, i + CHUNK_SIZE);
        await prisma.inventorySale.createMany({
          data: chunk.map((item) => ({
            batchId: batch.id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            unit: item.unit,
            rawQty: item.rawQty,
            adjustedQty: item.adjustedQty,
            saleAmount: item.saleAmount,
            costAmount: item.costAmount,
          })),
        });
      }
    } else if (fileType === "USAGE") {
      for (let i = 0; i < dataList.length; i += CHUNK_SIZE) {
        const chunk = dataList.slice(i, i + CHUNK_SIZE);
        await prisma.inventoryUsage.createMany({
          data: chunk.map((item) => ({
            batchId: batch.id,
            itemCode: item.itemCode,
            itemName: item.itemName,
            unit: item.unit,
            usageMonth1: item.usageMonth1,
            usageMonth2: item.usageMonth2,
            usageMonth3: item.usageMonth3,
            category: item.category,
            supplier: item.supplier,
          })),
        });
      }
    }

    const modeText = importMode === "OVERWRITE" ? `(แทนที่ข้อมูลเดิม ${replacedBatchCount} ชุด)` : "(เพิ่มเป็นชุดใหม่)";

    return NextResponse.json({
      success: true,
      message: `นำเข้าข้อมูลเรียบร้อยแล้ว จำนวน ${validation.validRows.toLocaleString()} แถว ${modeText}`,
      batchId: batch.id,
      importedRows: validation.validRows,
      fileType,
      importMode,
      replacedBatchCount,
    });
  } catch (error: any) {
    console.error("Error importing inventory data:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + (error.message || "Database error") },
      { status: 500 }
    );
  }
}
