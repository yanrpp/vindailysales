import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { parseInventoryFile } from "@/lib/parseInventoryExcel";

// รูปแบบที่รองรับ:
// - non_moving: ไฟล์ "สินค้าไม่เคลื่อนไหวย้อนหลัง 6 เดือน ..." → เติมทั้งสินค้า + lot + qty/store
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // รองรับทั้ง single file และ multiple files
    const file = formData.get("file") as File | null;
    const files = formData.getAll("files") as File[];

    // กำหนดรูปแบบการ upload เป็น non_moving เท่านั้น
    const uploadFormat = "non_moving" as const;

    // รวมไฟล์ทั้งหมด (รองรับทั้งกรณีส่งมาเป็น "file" หรือ "files")
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

        // ---------- โหมด non_moving: ไฟล์สินค้าไม่เคลื่อนไหว (สินค้า+lot+qty+store) ----------
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
          
          console.log("=== Date Report Processing ===");
          console.log("Parsed detail_date:", parsedResult.detail_date);
          console.log("File name:", currentFile.name);
          
          if (parsedResult.detail_date) {
            try {
              // ค้นหาว่ามี record ใน date_report แล้วหรือไม่
              console.log("Checking for existing date_report with detail_date:", parsedResult.detail_date);
              const { data: existingDateReport, error: dateReportSelectError } = await supabase
                .from("date_report")
                .select("id, detail_date")
                .eq("detail_date", parsedResult.detail_date)
                .maybeSingle(); // ใช้ maybeSingle แทน single เพื่อไม่ throw error เมื่อไม่เจอ

              if (dateReportSelectError) {
                console.error("❌ Error checking date_report:", dateReportSelectError);
                console.error("Error code:", dateReportSelectError.code);
                console.error("Error message:", dateReportSelectError.message);
                console.error("Error hint:", dateReportSelectError.hint);
                
                // ตรวจสอบว่าเป็น error เกี่ยวกับตารางไม่มีหรือไม่
                if (dateReportSelectError.code === "42P01" || dateReportSelectError.message?.includes("does not exist")) {
                  console.error("⚠️ Table 'date_report' does not exist. Please run the migration: supabase-migrations/add_date_report_table.sql");
                }
              } else {
                console.log("✅ Query executed successfully");
              }

              if (existingDateReport) {
                dateReportId = existingDateReport.id;
                console.log("✅ Found existing date_report with id:", dateReportId, "detail_date:", existingDateReport.detail_date);
              } else {
                // สร้าง record ใหม่ใน date_report
                console.log("📝 Creating new date_report with detail_date:", parsedResult.detail_date);
                const { data: newDateReport, error: dateReportInsertError } = await supabase
                  .from("date_report")
                  .insert({
                    detail_date: parsedResult.detail_date,
                  })
                  .select("id, detail_date")
                  .single();

                if (dateReportInsertError) {
                  console.error("❌ Error creating date_report:");
                  console.error("Error code:", dateReportInsertError.code);
                  console.error("Error message:", dateReportInsertError.message);
                  console.error("Error hint:", dateReportInsertError.hint);
                  console.error("Error details:", JSON.stringify(dateReportInsertError, null, 2));
                  
                  // ตรวจสอบว่าเป็น error เกี่ยวกับตารางไม่มีหรือไม่
                  if (dateReportInsertError.code === "42P01" || dateReportInsertError.message?.includes("does not exist")) {
                    console.error("⚠️ Table 'date_report' does not exist. Please run the migration: supabase-migrations/add_date_report_table.sql");
                  }
                } else if (newDateReport) {
                  dateReportId = newDateReport.id;
                  console.log("✅ Successfully created date_report with id:", dateReportId, "detail_date:", newDateReport.detail_date);
                } else {
                  console.error("❌ Failed to create date_report: newDateReport is null");
                }
              }
            } catch (err: any) {
              console.error("❌ Exception while handling date_report:", err);
              console.error("Exception stack:", err.stack);
            }
          } else {
            console.warn("⚠️ No detail_date found in parsed result.");
            console.warn("First row column A might not contain expected format.");
            console.warn("Expected format: 'ประจำวันงวดวันที่ ...' or similar");
          }
          
          console.log("Final dateReportId:", dateReportId);
          console.log("=== End Date Report Processing ===");

          totalRecords += parsed.length;

          for (const rec of parsed) {
            try {
              // ตรวจสอบว่ามีข้อมูลครบถ้วน
              if (!rec.product.product_code || !rec.product.product_code.trim()) {
                allResults.push({
                  filename: currentFile.name,
                  product_code: rec.product.product_code || "",
                  lot_no: rec.lot_no,
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

              // ค้นหา product ด้วย product_code + store_location
              // เนื่องจาก product_code สามารถซ้ำกันได้ถ้า store_location ต่างกัน
              const storeLocation = rec.product.store_location || null;
              
              // ค้นหา product ทั้งหมดที่มี product_code นี้
              const { data: products, error: searchError } = await supabase
                .from("products")
                .select("id, product_code, store_location")
                .eq("product_code", rec.product.product_code);
              
              if (searchError) {
                allResults.push({
                  filename: currentFile.name,
                  product_code: rec.product.product_code,
                  lot_no: rec.lot_no,
                  success: false,
                  error: `Failed to check product: ${searchError.message}`,
                });
                totalError++;
                continue;
              }
              
              // หา product ที่ store_location ตรงกัน
              // เปรียบเทียบโดยแปลง NULL เป็น empty string
              const matchedProduct = products?.find(p => {
                const pStoreLocation = p.store_location || null;
                // เปรียบเทียบโดยคำนึงถึง NULL
                if (storeLocation === null && pStoreLocation === null) return true;
                if (storeLocation === null || pStoreLocation === null) return false;
                return pStoreLocation === storeLocation;
              }) || null;

              let productId: string;
              if (matchedProduct) {
                // อัปเดตข้อมูลสินค้า
                const { error: updateError } = await supabase
                  .from("products")
                  .update({
                    description: rec.product.description,
                    um: rec.product.um,
                    cost: rec.product.cost,
                    store_location: rec.product.store_location || null,
                    item_type: rec.product.item_type || null,
                    id_date: dateReportId, // เพิ่ม id_date จาก date_report
                  })
                  .eq("id", matchedProduct.id);

                if (updateError) {
                  allResults.push({
                    filename: currentFile.name,
                    product_code: rec.product.product_code,
                    lot_no: rec.lot_no,
                    success: false,
                    error: `Failed to update product: ${updateError.message}`,
                  });
                  totalError++;
                  continue;
                }
                productId = matchedProduct.id;
              } else {
                const { data: newProduct, error: insertError } = await supabase
                  .from("products")
                  .insert({
                    product_code: rec.product.product_code,
                    description: rec.product.description,
                    um: rec.product.um,
                    cost: rec.product.cost,
                    store_location: rec.product.store_location || null,
                    item_type: rec.product.item_type || null,
                    id_date: dateReportId, // เพิ่ม id_date จาก date_report
                  })
                  .select("id")
                  .single();

                if (insertError || !newProduct) {
                  allResults.push({
                    filename: currentFile.name,
                    product_code: rec.product.product_code,
                    lot_no: rec.lot_no,
                    success: false,
                    error: `Failed to create product: ${insertError?.message || "Unknown error"}`,
                  });
                  totalError++;
                  continue;
                }
                productId = newProduct.id;
              }

              // ค้นหา lot ด้วย product_id + lot_no
              // หมายเหตุ: product_id สามารถซ้ำกันได้ถ้า lot_no ต่างกัน
              // UNIQUE constraint: (product_id, lot_no) - หมายความว่า:
              // - product_id เดียวกันสามารถมี lot_no หลายตัวได้ (เช่น product_id=1, lot_no="001" และ product_id=1, lot_no="002")
              // - แต่ product_id + lot_no เดียวกันจะซ้ำไม่ได้
              const { data: existingLot, error: lotSelectError } = await supabase
                .from("product_lots")
                .select("id, product_id, lot_no")
                .eq("product_id", productId)
                .eq("lot_no", rec.lot_no)
                .maybeSingle(); // ใช้ maybeSingle แทน single เพื่อไม่ throw error เมื่อไม่เจอ

              if (lotSelectError) {
                // ถ้าเป็น error ที่ไม่ใช่ "not found" ให้ log และ return error
                if (lotSelectError.code !== "PGRST116") {
                  allResults.push({
                    filename: currentFile.name,
                    product_code: rec.product.product_code,
                    lot_no: rec.lot_no,
                    success: false,
                    error: `Failed to check lot: ${lotSelectError.message}`,
                  });
                  totalError++;
                  continue;
                }
              }

              // จัดการ exp: ถ้าเป็น null = ไม่ระบุหมดอายุ
              const expStr = rec.exp ? rec.exp.toISOString().split("T")[0] : null;

              if (existingLot) {
                const { error: updateError } = await supabase
                  .from("product_lots")
                  .update({
                    exp: expStr,
                    qty: rec.qty || 0,
                  })
                  .eq("id", existingLot.id);

                if (updateError) {
                  allResults.push({
                    filename: currentFile.name,
                    product_code: rec.product.product_code,
                    lot_no: rec.lot_no,
                    success: false,
                    error: `Failed to update lot: ${updateError.message}`,
                  });
                  totalError++;
                  continue;
                }
              } else {
                // Insert lot ใหม่
                // product_id สามารถซ้ำกันได้ถ้า lot_no ต่างกัน
                // ตัวอย่าง: product_id=1, lot_no="001" และ product_id=1, lot_no="002" สามารถมีได้ทั้งคู่
                const { error: insertError } = await supabase
                  .from("product_lots")
                  .insert({
                    product_id: productId,
                    lot_no: rec.lot_no,
                    exp: expStr,
                    qty: rec.qty || 0,
                  });

                if (insertError) {
                  // ตรวจสอบว่าเป็น duplicate key error หรือไม่
                  const isDuplicateError = insertError.code === "23505" || insertError.message?.includes("duplicate");
                  const errorMessage = isDuplicateError
                    ? `Duplicate lot: product_id=${productId}, lot_no=${rec.lot_no} already exists`
                    : `Failed to create lot: ${insertError.message}`;
                  
                  allResults.push({
                    filename: currentFile.name,
                    product_code: rec.product.product_code,
                    lot_no: rec.lot_no,
                    success: false,
                    error: errorMessage,
                  });
                  totalError++;
                  continue;
                }
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
                error: err.message || "Unknown error",
              });
              totalError++;
            }
          }
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
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
