import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/middleware";
import { parseInventoryFile } from "@/lib/parseInventoryExcel";

// รูปแบบที่รองรับ:
// - non_moving: ไฟล์ "สินค้าไม่เคลื่อนไหวย้อนหลัง 6 เดือน ..." → เติมทั้งสินค้า + lot + qty/store
export const POST = requireAuth(async (req) => {
  try {
    const formData = await req.formData();

    // รองรับทั้ง single file และ multiple files
    const file = formData.get("file") as File | null;
    const files = formData.getAll("files") as File[];

    // รวมไฟล์ทั้งหมด
    const allFiles: File[] = [];
    if (file) {
      allFiles.push(file);
    }
    if (files.length > 0) {
      allFiles.push(...files);
    }

    if (allFiles.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allResults: Array<{
      filename: string;
      product_code: string;
      lot_no: string;
      success: boolean;
      error?: string;
    }> = [];

    let totalRecords = 0;
    let totalSuccess = 0;
    let totalError = 0;

    // ประมวลผลทุกไฟล์
    for (const currentFile of allFiles) {
      try {
        const buffer = await currentFile.arrayBuffer();

        // โหมด non_moving: ไฟล์สินค้าไม่เคลื่อนไหว (สินค้า+lot+qty+store)
        const parsedResult = await parseInventoryFile(buffer);
        const parsed = parsedResult.records;

        if (parsed.length === 0) {
          allResults.push({
            filename: currentFile.name,
            product_code: "",
            lot_no: "",
            success: false,
            error: "No valid records found in the file",
          });
          totalError++;
          continue;
        }

        // จัดการ date_report: สร้างหรือค้นหา record ใน date_report
        let dateReportId: string | null = null;

        if (parsedResult.detail_date) {
          try {
            const existingDateReport = await prisma.dateReport.findUnique({
              where: { detailDate: parsedResult.detail_date },
            });

            if (existingDateReport) {
              dateReportId = existingDateReport.id;
            } else {
              const newDateReport = await prisma.dateReport.create({
                data: { detailDate: parsedResult.detail_date },
              });
              dateReportId = newDateReport.id;
            }
          } catch (err) {
            console.error("❌ Exception while handling date_report:", err);
          }
        }

        totalRecords += parsed.length;

        // บันทึกข้อมูลแบบ Transaction
        await prisma.$transaction(async (tx) => {
          for (const rec of parsed) {
            try {
              if (!rec.product.product_code || !rec.product.product_code.trim()) {
                allResults.push({
                  filename: currentFile.name,
                  product_code: "",
                  lot_no: rec.lot_no || "",
                  success: false,
                  error: "Product code is missing or empty",
                });
                totalError++;
                continue;
              }

              if (!rec.lot_no || !rec.lot_no.trim()) {
                allResults.push({
                  filename: currentFile.name,
                  product_code: rec.product.product_code,
                  lot_no: rec.lot_no || "",
                  success: false,
                  error: "Lot number is missing or empty",
                });
                totalError++;
                continue;
              }

              const storeLocation = rec.product.store_location || null;

              // ค้นหา product ที่ store_location ตรงกัน
              const matchedProduct = await tx.product.findFirst({
                where: {
                  productCode: rec.product.product_code,
                  storeLocation: storeLocation,
                },
              });

              let productId: string;
              if (matchedProduct) {
                await tx.product.update({
                  where: { id: matchedProduct.id },
                  data: {
                    description: rec.product.description || null,
                    um: rec.product.um || null,
                    cost: rec.product.cost || null,
                    itemType: rec.product.item_type || null,
                    idDate: dateReportId,
                  },
                });
                productId = matchedProduct.id;
              } else {
                const newProduct = await tx.product.create({
                  data: {
                    productCode: rec.product.product_code,
                    description: rec.product.description || null,
                    um: rec.product.um || null,
                    cost: rec.product.cost || null,
                    storeLocation: storeLocation,
                    itemType: rec.product.item_type || null,
                    idDate: dateReportId,
                  },
                });
                productId = newProduct.id;
              }

              // จัดการ Lot
              const expDate = rec.exp ? new Date(rec.exp) : null;
              const existingLot = await tx.productLot.findUnique({
                where: {
                  productId_lotNo: {
                    productId: productId,
                    lotNo: rec.lot_no,
                  },
                },
              });

              if (existingLot) {
                await tx.productLot.update({
                  where: { id: existingLot.id },
                  data: {
                    exp: expDate,
                    qty: rec.qty || 0,
                    store: rec.store_location || null,
                  },
                });
              } else {
                await tx.productLot.create({
                  data: {
                    productId: productId,
                    lotNo: rec.lot_no,
                    exp: expDate,
                    qty: rec.qty || 0,
                    store: rec.store_location || null,
                  },
                });
              }

              allResults.push({
                filename: currentFile.name,
                product_code: rec.product.product_code,
                lot_no: rec.lot_no,
                success: true,
              });
              totalSuccess++;
            } catch (err: any) {
              allResults.push({
                filename: currentFile.name,
                product_code: rec.product.product_code,
                lot_no: rec.lot_no,
                success: false,
                error: err.message || "Unknown record error",
              });
              totalError++;
            }
          }
        });
      } catch (fileError: any) {
        allResults.push({
          filename: currentFile.name,
          product_code: "",
          lot_no: "",
          success: false,
          error: fileError.message || "Failed to process file",
        });
        totalError++;
      }
    }

    return NextResponse.json({
      success: true,
      total_files: allFiles.length,
      total_records: totalRecords,
      successCount: totalSuccess,
      errorCount: totalError,
      results: allResults,
      message: `Processed ${allFiles.length} file(s) with ${totalRecords} records: ${totalSuccess} successful, ${totalError} failed`,
    });
  } catch (error: any) {
    console.error("Upload inventory error:", error);
    return NextResponse.json(
      { error: "Upload inventory processing failed" },
      { status: 500 },
    );
  }
});
