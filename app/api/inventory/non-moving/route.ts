import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * API endpoint สำหรับดึงข้อมูลสินค้าค้างสต๊อก 6 เดือน (ไม่มีการเคลื่อนไหว)
 * สินค้าที่ไม่มีการอัปเดตรายงานล่าสุดภายใน 6 เดือน
 */
export async function GET(req: NextRequest) {
  try {
    // ดึงข้อมูลสินค้าที่ไม่มีการเคลื่อนไหว 6 เดือน
    const { data, error } = await supabase.rpc("get_non_moving_items");

    if (error) {
      // ถ้ายังไม่มี function ให้ใช้ query แทน
      // ใช้ product_lots และ products โดยตรง (qty เก็บไว้ใน product_lots แล้ว)
      // ใช้ updated_at จาก product_lots เป็น last_update
      const { data: queryData, error: queryError } = await supabase
        .from("product_lots")
        .select(
          `
          id,
          lot_no,
          exp,
          qty,
          updated_at,
          product_id,
          products!inner(
            id,
            product_code,
            description
          )
        `
        )
        .order("updated_at", { ascending: false });

      if (queryError) {
        return NextResponse.json(
          { error: queryError.message },
          { status: 500 }
        );
      }

      // Group by product_code, lot_no และหาค่าสูงสุดของ updated_at
      const grouped = new Map<string, any>();

      queryData?.forEach((lot: any) => {
        if (!lot.products) {
          return; // ข้าม record ที่ไม่มีข้อมูล
        }
        
        const product = lot.products;
        const key = `${product.product_code}_${lot.lot_no}`;

        // ใช้ updated_at จาก product_lots เป็น last_update
        const lastUpdate = lot.updated_at || new Date().toISOString();

        if (!grouped.has(key)) {
          grouped.set(key, {
            product_code: product.product_code,
            description: product.description || "",
            lot_no: lot.lot_no,
            exp: lot.exp,
            last_update: lastUpdate,
            total_qty: 0,
          });
        }

        const item = grouped.get(key);
        if (item) {
          item.total_qty += parseFloat(lot.qty) || 0;
          if (lastUpdate && new Date(lastUpdate) > new Date(item.last_update)) {
            item.last_update = lastUpdate;
          }
        }
      });

      // Filter เฉพาะที่ last_update < 6 months ago
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const nonMovingItems = Array.from(grouped.values()).filter(
        (item) => new Date(item.last_update) < sixMonthsAgo
      );

      return NextResponse.json({
        success: true,
        data: nonMovingItems.sort(
          (a, b) =>
            new Date(a.last_update).getTime() -
            new Date(b.last_update).getTime()
        ),
      });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error: any) {
    console.error("Get non-moving items error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

