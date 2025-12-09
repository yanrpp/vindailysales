import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * API endpoint สำหรับดึงข้อมูลสินค้าหมดอายุ
 * สินค้าที่ exp < CURRENT_DATE
 */
export async function GET(req: NextRequest) {
  try {
    // ดึงข้อมูลสินค้าหมดอายุ
    const { data, error } = await supabase.rpc("get_expired_items");

    if (error) {
      // ถ้ายังไม่มี function ให้ใช้ query แทน
      // ใช้ product_lots โดยตรง (qty เก็บไว้ใน product_lots แล้ว)
      const { data: queryData, error: queryError } = await supabase
        .from("product_lots")
        .select(
          `
          id,
          lot_no,
          exp,
          qty,
          product_id,
          products!inner(
            id,
            product_code,
            description
          )
        `
        )
        .lt("exp", new Date().toISOString().split("T")[0])
        .order("exp", { ascending: true });

      if (queryError) {
        return NextResponse.json(
          { error: queryError.message },
          { status: 500 }
        );
      }

      const expiredItems = (queryData || []).map((lot: any) => ({
        product_code: lot.products.product_code,
        description: lot.products.description,
        lot_no: lot.lot_no,
        exp: lot.exp,
        total_qty: parseFloat(lot.qty) || 0,
      }));

      return NextResponse.json({
        success: true,
        data: expiredItems,
      });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error: any) {
    console.error("Get expired items error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

