import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * API endpoint สำหรับดึงข้อมูลสินค้า + Lot
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateReportId = searchParams.get("date_report_id");
    
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
      // ดึง store_location จาก products ด้วย
      let lotsQuery = supabase
        .from("product_lots")
        .select(
          `
          id,
          lot_no,
          exp,
          qty,
          store,
          product_id,
          products!inner(
            id,
            product_code,
            description,
            store_location,
            id_date,
            date_report:date_report!id_date(
              id,
              detail_date
            )
          )
        `
        );
      
      // Filter by date_report_id ถ้ามี
      if (dateReportId) {
        lotsQuery = lotsQuery.eq("products.id_date", dateReportId);
      }
      
      const { data: lotsData, error: lotsError } = await lotsQuery;

      if (lotsError) {
        return NextResponse.json(
          { error: lotsError.message },
          { status: 500 }
        );
      }

      // Group by product_code, lot_no แล้วรวม qty แยกตาม store
      // เพื่อให้แสดง store และ qty แยกตาม store สำหรับแต่ละ lot
      // เก็บข้อมูลแต่ละ record ก่อนรวมเพื่อแสดงรายละเอียด
      const productLotsMap = new Map<string, any>();

      lotsData?.forEach((lot: any) => {
        if (!lot.products) {
          return; // ข้าม record ที่ไม่มีข้อมูล product
        }
        
        const product = lot.products;
        // ใช้ product_code + lot_no เป็น key (ไม่รวม store เพื่อรวมทุก store ของ lot เดียวกัน)
        const key = `${product.product_code}_${lot.lot_no}`;

        if (!productLotsMap.has(key)) {
          productLotsMap.set(key, {
            product_code: product.product_code,
            description: product.description,
            lot_no: lot.lot_no,
            exp: lot.exp,
            qty: 0,
            storeQty: new Map<string, number[]>(), // เก็บ qty แต่ละ record แยกตาม store (Array)
          });
        }

        const item = productLotsMap.get(key);
        // ใช้ store จาก product_lots ก่อน ถ้าไม่มีให้ใช้ store_location จาก products
        const store = lot.store || lot.products?.store_location || "";
        const qty = parseFloat(lot.qty) || 0;
        
        // รวม qty ทั้งหมด
        item.qty += qty;
        
        // เก็บ qty แต่ละ record แยกตาม store (เก็บเป็น Array เพื่อแสดงแต่ละ record)
        // เก็บข้อมูลแม้ว่า store จะเป็น empty string หรือ null
        // ถ้า store เป็น empty string หรือ null ให้ใช้ "-" แทน
        const storeKey = (store && store.trim() !== "") ? store : "-";
        if (!item.storeQty.has(storeKey)) {
          item.storeQty.set(storeKey, []);
        }
        item.storeQty.get(storeKey)!.push(qty); // เพิ่ม qty แต่ละ record เข้า Array
      });

      // แปลง Map เป็น Array และแปลง storeQty Map เป็น Array
      const productLots = Array.from(productLotsMap.values()).map((item) => {
        // แปลง storeQty Map เป็น Array ของ {store, qtyArray, totalQty}
        // qtyArray = จำนวนแต่ละ record, totalQty = ยอดรวมของ store นั้น
        const storeQtyArray = Array.from(item.storeQty.entries() as Iterable<[string, number[]]>).map(([store, qtyArray]) => ({
          store,
          qtyArray: qtyArray, // จำนวนแต่ละ record ก่อนรวม
          totalQty: qtyArray.reduce((sum, qty) => sum + qty, 0), // ยอดรวมของ store
        }));
        
        return {
          product_code: item.product_code,
          description: item.description,
          lot_no: item.lot_no,
          exp: item.exp,
          qty: item.qty,
          storeQty: storeQtyArray, // Array ของ {store, qtyArray, totalQty}
        };
      });

      // Sort by product_code and exp
      productLots.sort((a, b) => {
        if (a.product_code !== b.product_code) {
          return a.product_code.localeCompare(b.product_code);
        }
        return new Date(a.exp).getTime() - new Date(b.exp).getTime();
      });

      // ดึงข้อมูลวันที่รายงาน
      let dateReportQuery = supabase
        .from("date_report")
        .select("id, detail_date")
        .order("detail_date", { ascending: false });
      
      if (dateReportId) {
        dateReportQuery = dateReportQuery.eq("id", dateReportId);
      }
      
      const { data: dateReports } = await dateReportQuery;
      const selectedDateReport = dateReportId 
        ? dateReports?.[0] 
        : dateReports?.[0]; // ถ้าไม่ระบุให้ใช้ล่าสุด
      
      // ดึงรายการ date_reports ทั้งหมดสำหรับ dropdown
      const { data: allDateReports } = await supabase
        .from("date_report")
        .select("id, detail_date")
        .order("detail_date", { ascending: false });

      return NextResponse.json({
        success: true,
        data: productLots,
        dateReport: selectedDateReport ? selectedDateReport.detail_date : null,
        dateReports: allDateReports || [],
      });
    }

    // ถ้า RPC function return ข้อมูลมา ต้องตรวจสอบว่ามี storeQty หรือไม่
    // ถ้าไม่มี ต้องแปลงข้อมูลให้มี storeQty
    if (data && Array.isArray(data) && data.length > 0) {
      // ตรวจสอบว่าข้อมูลมี storeQty หรือไม่
      const hasStoreQty = data.some((item: any) => item.storeQty !== undefined);
      
      if (!hasStoreQty) {
        // ถ้าไม่มี storeQty ต้องดึงข้อมูลใหม่จาก product_lots
        // ใช้โค้ดเดียวกับที่ใช้ใน error case
        let lotsQuery = supabase
          .from("product_lots")
          .select(
            `
            id,
            lot_no,
            exp,
            qty,
            store,
            product_id,
            products!inner(
              id,
              product_code,
              description,
              store_location,
              id_date,
              date_report:date_report!id_date(
                id,
                detail_date
              )
            )
          `
          );
        
        // Filter by date_report_id ถ้ามี
        if (dateReportId) {
          lotsQuery = lotsQuery.eq("products.id_date", dateReportId);
        }
        
        const { data: lotsData, error: lotsError } = await lotsQuery;

        if (!lotsError && lotsData) {
          const productLotsMap = new Map<string, any>();

          lotsData.forEach((lot: any) => {
            if (!lot.products) {
              return;
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
                storeQty: new Map<string, number[]>(),
              });
            }

            const item = productLotsMap.get(key);
            // ใช้ store จาก product_lots ก่อน ถ้าไม่มีให้ใช้ store_location จาก products
            const store = lot.store || lot.products?.store_location || "";
            const qty = parseFloat(lot.qty) || 0;
            
            item.qty += qty;
            
            const storeKey = (store && store.trim() !== "") ? store : "-";
            if (!item.storeQty.has(storeKey)) {
              item.storeQty.set(storeKey, []);
            }
            item.storeQty.get(storeKey)!.push(qty);
          });

          const productLots = Array.from(productLotsMap.values()).map((item) => {
            const storeQtyArray = Array.from(item.storeQty.entries() as Iterable<[string, number[]]>).map(([store, qtyArray]) => ({
              store,
              qtyArray: qtyArray,
              totalQty: qtyArray.reduce((sum, qty) => sum + qty, 0),
            }));
            
            return {
              product_code: item.product_code,
              description: item.description,
              lot_no: item.lot_no,
              exp: item.exp,
              qty: item.qty,
              storeQty: storeQtyArray,
            };
          });

          productLots.sort((a, b) => {
            if (a.product_code !== b.product_code) {
              return a.product_code.localeCompare(b.product_code);
            }
            return new Date(a.exp).getTime() - new Date(b.exp).getTime();
          });

          // ดึงข้อมูลวันที่รายงาน
          let dateReportQuery = supabase
            .from("date_report")
            .select("id, detail_date")
            .order("detail_date", { ascending: false });
          
          if (dateReportId) {
            dateReportQuery = dateReportQuery.eq("id", dateReportId);
          }
          
          const { data: dateReports } = await dateReportQuery;
          const selectedDateReport = dateReportId 
            ? dateReports?.[0] 
            : dateReports?.[0];
          
          // ดึงรายการ date_reports ทั้งหมดสำหรับ dropdown
          const { data: allDateReports } = await supabase
            .from("date_report")
            .select("id, detail_date")
            .order("detail_date", { ascending: false });

          return NextResponse.json({
            success: true,
            data: productLots,
            dateReport: selectedDateReport ? selectedDateReport.detail_date : null,
            dateReports: allDateReports || [],
          });
        }
      }
    }

    // ดึงข้อมูลวันที่รายงาน
    let dateReportQuery = supabase
      .from("date_report")
      .select("id, detail_date")
      .order("detail_date", { ascending: false });
    
    if (dateReportId) {
      dateReportQuery = dateReportQuery.eq("id", dateReportId);
    }
    
    const { data: dateReports } = await dateReportQuery;
    const selectedDateReport = dateReportId 
      ? dateReports?.[0] 
      : dateReports?.[0];
    
    // ดึงรายการ date_reports ทั้งหมดสำหรับ dropdown
    const { data: allDateReports } = await supabase
      .from("date_report")
      .select("id, detail_date")
      .order("detail_date", { ascending: false });

    return NextResponse.json({
      success: true,
      data: data || [],
      dateReport: selectedDateReport ? selectedDateReport.detail_date : null,
      dateReports: allDateReports || [],
    });
  } catch (error: any) {
    console.error("Get product lots error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

