import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * API endpoint สำหรับดึงข้อมูลสินค้า + Lot
 */
export async function GET(req: NextRequest) {
  try {
    // ดึงข้อมูลสินค้า + lot
    const { data, error } = await supabase.rpc("get_product_lots");

    if (error) {
      // ถ้ายังไม่มี function ให้ใช้ query แทน
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select(
          `
          id,
          product_code,
          description,
          product_lots(
            id,
            lot_no,
            exp
          )
        `
        )
        .order("product_code", { ascending: true });

      if (productsError) {
        return NextResponse.json(
          { error: productsError.message },
          { status: 500 }
        );
      }

      // ดึงข้อมูลจาก product_lots โดยตรง (qty เก็บไว้ใน product_lots แล้ว)
      const { data: lotsData, error: lotsError } = await supabase
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
        );

      if (lotsError) {
        return NextResponse.json(
          { error: lotsError.message },
          { status: 500 }
        );
      }

      // Group by product_code และ lot_no แล้ว sum qty
      const productLotsMap = new Map<string, any>();

      lotsData?.forEach((lot: any) => {
        if (!lot.products) {
          return; // ข้าม record ที่ไม่มีข้อมูล product
        }
        
        const product = lot.products;
        const key = `${product.product_code}_${lot.lot_no}`;

        if (!productLotsMap.has(key)) {
          productLotsMap.set(key, {
            product_code: product.product_code,
            description: product.description,
            lot_no: lot.lot_no,
            exp: lot.exp,
            qty: 0,
          });
        }

        const item = productLotsMap.get(key);
        item.qty += parseFloat(lot.qty) || 0;
      });

      const productLots = Array.from(productLotsMap.values());

      // Sort by product_code and exp
      productLots.sort((a, b) => {
        if (a.product_code !== b.product_code) {
          return a.product_code.localeCompare(b.product_code);
        }
        return new Date(a.exp).getTime() - new Date(b.exp).getTime();
      });

      return NextResponse.json({
        success: true,
        data: productLots,
      });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error: any) {
    console.error("Get product lots error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

