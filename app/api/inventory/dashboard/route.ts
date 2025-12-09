import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * API endpoint สำหรับดึงข้อมูลสถิติสำหรับ Dashboard
 * รวมข้อมูลในทุกมิติเพื่อการตัดสินใจ
 */
export async function GET(req: NextRequest) {
  try {
    // ดึงข้อมูลสินค้าทั้งหมด
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select(`
        id,
        product_code,
        description,
        cost,
        store_location,
        item_type,
        id_date,
        date_report:date_report!id_date(
          id,
          detail_date
        ),
        product_lots(
          id,
          qty,
          exp,
          updated_at
        )
      `);

    if (productsError) {
      console.error("Products error:", productsError);
      return NextResponse.json(
        { error: productsError.message },
        { status: 500 }
      );
    }

    // 1. สถิติตามหมวดหมู่ (item_type)
    const categoryStats = new Map<string, { count: number; totalQty: number; totalValue: number }>();
    
    // 2. สถิติตามสถานที่เก็บ (store_location)
    const storeStats = new Map<string, { count: number; totalQty: number; totalValue: number }>();
    
    // 3. สินค้าที่มีมูลค่าสูงสุด
    const highValueProducts: Array<{ product_code: string; description: string; totalValue: number; totalQty: number }> = [];
    
    // 4. สินค้าค้างสต๊อก (ไม่มีการอัปเดต 6 เดือน)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    // 5. สินค้าหมดอายุ
    const today = new Date();
    const expiredProducts: Array<{ product_code: string; description: string; exp: string; qty: number }> = [];
    
    // 6. สถิติตามวันที่รายงาน
    const dateReportStats = new Map<string, { count: number; totalQty: number; totalValue: number }>();

    (products || []).forEach((product: any) => {
      const lots = product.product_lots || [];
      const totalQty = lots.reduce((sum: number, lot: any) => sum + (lot.qty || 0), 0);
      const totalValue = (product.cost || 0) * totalQty;

      // สถิติตามหมวดหมู่
      const itemType = product.item_type || "ไม่ระบุ";
      if (!categoryStats.has(itemType)) {
        categoryStats.set(itemType, { count: 0, totalQty: 0, totalValue: 0 });
      }
      const categoryData = categoryStats.get(itemType)!;
      categoryData.count += 1;
      categoryData.totalQty += totalQty;
      categoryData.totalValue += totalValue;

      // สถิติตามสถานที่เก็บ
      const storeLocation = product.store_location || "ไม่ระบุ";
      if (!storeStats.has(storeLocation)) {
        storeStats.set(storeLocation, { count: 0, totalQty: 0, totalValue: 0 });
      }
      const storeData = storeStats.get(storeLocation)!;
      storeData.count += 1;
      storeData.totalQty += totalQty;
      storeData.totalValue += totalValue;

      // สินค้าที่มีมูลค่าสูงสุด
      if (totalValue > 0) {
        highValueProducts.push({
          product_code: product.product_code,
          description: product.description || "",
          totalValue,
          totalQty,
        });
      }

      // ตรวจสอบสินค้าหมดอายุ
      lots.forEach((lot: any) => {
        if (lot.exp) {
          const expDate = new Date(lot.exp);
          if (expDate < today) {
            expiredProducts.push({
              product_code: product.product_code,
              description: product.description || "",
              exp: lot.exp,
              qty: lot.qty || 0,
            });
          }
        }
      });
    });

    // ดึงข้อมูล date_report
    const { data: dateReports } = await supabase
      .from("date_report")
      .select("id, detail_date")
      .order("detail_date", { ascending: false });

    // สถิติตามวันที่รายงาน
    (dateReports || []).forEach((dr: any) => {
      const productsInReport = (products || []).filter((p: any) => {
        // เช็คว่า product มี id_date ตรงกับ date_report.id หรือไม่
        return p.id_date === dr.id;
      });
      
      let count = 0;
      let totalQty = 0;
      let totalValue = 0;
      const uniqueProductCodes = new Set<string>();
      
      productsInReport.forEach((product: any) => {
        const lots = product.product_lots || [];
        const qty = lots.reduce((sum: number, lot: any) => sum + (lot.qty || 0), 0);
        const value = (product.cost || 0) * qty;
        uniqueProductCodes.add(product.product_code);
        totalQty += qty;
        totalValue += value;
      });
      
      count = uniqueProductCodes.size;
      dateReportStats.set(dr.detail_date, { count, totalQty, totalValue });
    });

    // เรียงลำดับสินค้าที่มีมูลค่าสูงสุด
    highValueProducts.sort((a, b) => b.totalValue - a.totalValue);

    // แปลง Map เป็น Array สำหรับ response
    const categoryData = Array.from(categoryStats.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      totalQty: data.totalQty,
      totalValue: data.totalValue,
    })).sort((a, b) => b.totalValue - a.totalValue);

    const storeData = Array.from(storeStats.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      totalQty: data.totalQty,
      totalValue: data.totalValue,
    })).sort((a, b) => b.totalValue - a.totalValue);

    const dateReportData = Array.from(dateReportStats.entries()).map(([date, data]) => ({
      date,
      count: data.count,
      totalQty: data.totalQty,
      totalValue: data.totalValue,
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return NextResponse.json({
      success: true,
      data: {
        categoryStats: categoryData,
        storeStats: storeData,
        highValueProducts: highValueProducts.slice(0, 10), // Top 10
        expiredProducts: expiredProducts.slice(0, 10), // Top 10
        dateReportStats: dateReportData,
        summary: {
          totalProducts: new Set((products || []).map((p: any) => p.product_code)).size,
          totalLots: (products || []).reduce((sum: number, p: any) => sum + (p.product_lots?.length || 0), 0),
          totalValue: categoryData.reduce((sum, c) => sum + c.totalValue, 0),
          totalQty: categoryData.reduce((sum, c) => sum + c.totalQty, 0),
          expiredCount: expiredProducts.length,
        },
      },
    });
  } catch (error: any) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

