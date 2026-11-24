import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAndParseFile, InventoryFileType } from "@/lib/excel-validator";
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
    const note = (formData.get("note") as string) || null;
    const importMode = (formData.get("importMode") as string) || "OVERWRITE"; // "OVERWRITE" | "APPEND"
    const dataGroup = parseDataGroup(formData.get("dataGroup") as string | null);
    const dataDate = parseDataDate(formData.get("dataDate") as string | null);

    if (!file || !fileType) {
      return NextResponse.json(
        { error: "ข้อมูลไม่ครบถ้วน (ต้องการไฟล์และประเภทไฟล์)" },
        { status: 400 }
      );
    }

    if (!dataDate) {
      return NextResponse.json(
        { error: "กรุณาระบุวันที่ของข้อมูล (ใช้เป็นวันที่ของชุดข้อมูลในงวดนั้น)" },
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

    // วันที่ของข้อมูลเป็นตัวกำหนด — งวดตัดจากวันที่นี้ (fallback เป็น period จากฟอร์ม)
    const rawPeriod = (formData.get("period") as string) || "";
    const now = new Date();
    const currentPeriodStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const periodFromDataDate = `${dataDate.getUTCFullYear()}-${String(dataDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const period = periodFromDataDate || rawPeriod.trim() || currentPeriodStr;

    // OVERWRITE ได้เฉพาะเมื่อมีชุดข้อมูล "วันที่ของข้อมูล" เดียวกันอยู่แล้ว
    // ลบเฉพาะชุดที่วันตรงกัน — คนละวันถือเป็นชุดใหม่ (ไม่ลบของเดิม)
    let replacedBatchCount = 0;
    const sameDateCount = await prisma.importBatch.count({
      where: { fileType, dataGroup, dataDate },
    });
    const effectiveMode =
      importMode === "OVERWRITE" && sameDateCount > 0 ? "OVERWRITE" : "APPEND";

    if (effectiveMode === "OVERWRITE") {
      const deleteResult = await prisma.importBatch.deleteMany({
        where: {
          fileType,
          dataGroup,
          dataDate,
        },
      });
      replacedBatchCount = deleteResult.count;
    }

    const groupLabel = DATA_GROUP_LABELS[dataGroup];
    const usageMonthLabels =
      fileType === "USAGE" && Array.isArray((validation as any).usageMonthLabels)
        ? (validation as any).usageMonthLabels
        : undefined;

    const batch = await prisma.importBatch.create({
      data: {
        fileType,
        period,
        dataGroup,
        dataDate,
        fileName: file.name,
        totalRows: validation.totalRows,
        importedRows: validation.validRows,
        fileSize: file.size,
        usageMonthLabels: usageMonthLabels ?? undefined,
        note: note
          ? `${note} (งวด: ${period}, กลุ่ม: ${groupLabel}, วันที่ข้อมูล: ${dataDate.toISOString().slice(0, 10)}, โหมด: ${effectiveMode === "OVERWRITE" ? "แทนที่วันเดียวกัน" : "ชุดวันใหม่/เพิ่มต่อยอด"})`
          : null,
      },
    });

    const CHUNK_SIZE = 500;
    const dataList = validation.parsedData;

    if (fileType === "BALANCE") {
      for (let i = 0; i < dataList.length; i += CHUNK_SIZE) {
        const chunk = dataList.slice(i, i + CHUNK_SIZE);
        await prisma.inventoryBalance.createMany({
          data: chunk.map((item) => ({
            batchId: batch.id,
            period,
            dataGroup,
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
            period,
            dataGroup,
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
            period,
            dataGroup,
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
          data: chunk.map((item: any) => ({
            batchId: batch.id,
            period,
            dataGroup,
            itemCode: item.itemCode,
            itemName: item.itemName,
            unit: item.unit,
            balanceQty: item.balanceQty ?? null,
            minQty: item.minQty ?? null,
            usageMonth1: null,
            usageMonth2: item.usageMonth2,
            usageMonth3: item.usageMonth3,
            usageMonths: Array.isArray(item.usageMonths) ? item.usageMonths : undefined,
            category: item.category,
            supplier: item.supplier,
          })),
        });
      }
    }

    const dataDateLabel = `${String(dataDate.getUTCDate()).padStart(2, "0")}/${String(dataDate.getUTCMonth() + 1).padStart(2, "0")}/${dataDate.getUTCFullYear()}`;
    const modeText =
      effectiveMode === "OVERWRITE"
        ? `(แทนที่ชุดวันที่ ${dataDateLabel} จำนวน ${replacedBatchCount} ชุด)`
        : sameDateCount > 0
          ? `(เพิ่มต่อยอดชุดวันที่ ${dataDateLabel})`
          : `(ชุดข้อมูลวันใหม่ ${dataDateLabel})`;

    return NextResponse.json({
      success: true,
      message: `นำเข้าข้อมูลวันที่ [${dataDateLabel}] กลุ่ม [${groupLabel}] เรียบร้อยแล้ว จำนวน ${validation.validRows.toLocaleString()} แถว ${modeText}`,
      batchId: batch.id,
      period,
      dataGroup,
      dataDate,
      importedRows: validation.validRows,
      fileType,
      importMode: effectiveMode,
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
