import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * API endpoint สำหรับดึงข้อมูลสินค้าที่อัปโหลดไปแล้ว
 * รวมข้อมูล products, product_lots, และ date_report
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateReportId = searchParams.get("date_report_id");
    const storeLocation = searchParams.get("store_location");
    const itemType = searchParams.get("item_type");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "50");

    // สร้าง query base
    let query = supabase
      .from("products")
      .select(`
        id,
        product_code,
        description,
        um,
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
          lot_no,
          exp,
          qty
        )
      `)
      .order("product_code", { ascending: true })
      .limit(10000); // จำกัดจำนวนเพื่อป้องกันการดึงข้อมูลมากเกินไป

    // Filter by date_report_id
    if (dateReportId) {
      query = query.eq("id_date", dateReportId);
    }

    // Filter by store_location
    if (storeLocation) {
      query = query.eq("store_location", storeLocation);
    }

    // Filter by item_type
    if (itemType) {
      query = query.eq("item_type", itemType);
    }

    // Search by product_code or description
    if (search) {
      query = query.or(`product_code.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Get total count with same filters
    // เนื่องจากเราจะ group ตาม product_code เราต้องนับจำนวน product_code ที่ไม่ซ้ำกัน
    let countQuery = supabase
      .from("products")
      .select("product_code", { count: "exact", head: false });

    if (dateReportId) {
      countQuery = countQuery.eq("id_date", dateReportId);
    }

    if (storeLocation) {
      countQuery = countQuery.eq("store_location", storeLocation);
    }

    if (itemType) {
      countQuery = countQuery.eq("item_type", itemType);
    }

    if (search) {
      countQuery = countQuery.or(`product_code.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: countData, error: countError } = await countQuery;

    if (countError) {
      console.error("Count error:", countError);
    }

    // นับจำนวน product_code ที่ไม่ซ้ำกัน
    const uniqueProductCodes = new Set((countData || []).map((p: any) => p.product_code));
    const count = uniqueProductCodes.size;

    // เนื่องจากเราจะ group ตาม product_code เราต้องดึงข้อมูลทั้งหมดก่อนแล้วค่อย group
    // ไม่ใช้ pagination ที่ query level แต่จะทำ pagination หลังจาก group แล้ว
    const { data, error } = await query;

    if (error) {
      console.error("Query error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Group data by product_code
    // เนื่องจาก product_code สามารถซ้ำกันได้ถ้า store_location ต่างกัน
    // เราต้อง group ตาม product_code และ aggregate ข้อมูลจาก store_location ต่างๆ
    const productMap = new Map<string, {
      product_code: string;
      description: string;
      um: string;
      cost: number;
      item_type: string | null;
      date_report: { id: string; detail_date: string } | null;
      stores: Map<string, {
        store_location: string;
        lots: Array<{ id: string; lot_no: string; exp: string | null; qty: number; store: string | null }>;
        total_qty: number;
      }>;
      allLots: Array<{ id: string; lot_no: string; exp: string | null; qty: number; store: string | null }>;
      total_lots: number;
      total_qty: number;
    }>();

    (data || []).forEach((product: any) => {
      const productCode = product.product_code;
      const storeLocation = product.store_location || "";
      
      if (!productMap.has(productCode)) {
        // สร้าง entry ใหม่สำหรับ product_code นี้
        const lots = (product.product_lots || []).map((lot: any) => ({
          id: lot.id,
          lot_no: lot.lot_no,
          exp: lot.exp,
          qty: lot.qty || 0,
          store: product.store_location || null,
        }));

        const storesMap = new Map<string, {
          store_location: string;
          lots: Array<{ id: string; lot_no: string; exp: string | null; qty: number; store: string | null }>;
          total_qty: number;
        }>();

        storesMap.set(storeLocation, {
          store_location: storeLocation,
          lots: lots,
          total_qty: lots.reduce((sum: number, lot: any) => sum + (lot.qty || 0), 0),
        });

        productMap.set(productCode, {
          product_code: productCode,
          description: product.description || "",
          um: product.um || "",
          cost: product.cost || 0,
          item_type: product.item_type,
          date_report: product.date_report ? {
            id: product.date_report.id,
            detail_date: product.date_report.detail_date,
          } : null,
          stores: storesMap,
          allLots: lots,
          total_lots: lots.length,
          total_qty: lots.reduce((sum: number, lot: any) => sum + (lot.qty || 0), 0),
        });
      } else {
        // เพิ่มข้อมูล store_location ใหม่หรือรวมกับที่มีอยู่
        const existingProduct = productMap.get(productCode)!;
        const lots = (product.product_lots || []).map((lot: any) => ({
          id: lot.id,
          lot_no: lot.lot_no,
          exp: lot.exp,
          qty: lot.qty || 0,
          store: product.store_location || null,
        }));

        if (existingProduct.stores.has(storeLocation)) {
          // รวม lots เข้ากับ store ที่มีอยู่
          const existingStore = existingProduct.stores.get(storeLocation)!;
          existingStore.lots.push(...lots);
          existingStore.total_qty = existingStore.lots.reduce((sum: number, lot: any) => sum + (lot.qty || 0), 0);
        } else {
          // เพิ่ม store ใหม่
          existingProduct.stores.set(storeLocation, {
            store_location: storeLocation,
            lots: lots,
            total_qty: lots.reduce((sum: number, lot: any) => sum + (lot.qty || 0), 0),
          });
        }

        // อัปเดตข้อมูลรวม
        existingProduct.allLots.push(...lots);
        existingProduct.total_lots = existingProduct.allLots.length;
        existingProduct.total_qty = existingProduct.allLots.reduce((sum: number, lot: any) => sum + (lot.qty || 0), 0);
      }
    });

    // Get all store locations for column headers
    // ดึงจากข้อมูลที่ group แล้วเพื่อให้ตรงกับข้อมูลที่แสดงจริง
    // นับจำนวน products ที่มีในแต่ละ store เพื่อเรียงลำดับ
    const storeCountMap = new Map<string, number>();
    productMap.forEach((product) => {
      product.stores.forEach((storeData) => {
        if (storeData.store_location) {
          const currentCount = storeCountMap.get(storeData.store_location) || 0;
          storeCountMap.set(storeData.store_location, currentCount + 1);
        }
      });
    });

    // เรียงตามจำนวน products จากมากไปน้อย
    const sortedStores = Array.from(storeCountMap.entries())
      .sort((a, b) => b[1] - a[1]) // เรียงตามจำนวน products จากมากไปน้อย
      .map(([store]) => store);

    // ถ้ามี stores ที่ไม่ได้อยู่ใน sortedStores ให้เพิ่มตามลำดับตัวอักษร
    const allStoreLocationsSet = new Set<string>();
    productMap.forEach((product) => {
      product.stores.forEach((storeData) => {
        if (storeData.store_location) {
          allStoreLocationsSet.add(storeData.store_location);
        }
      });
    });

    const allStoreLocations = Array.from(allStoreLocationsSet).sort();
    const allStores = sortedStores.length > 0
      ? [...sortedStores, ...allStoreLocations.filter(s => !sortedStores.includes(s))]
      : allStoreLocations;

    // Transform to array format
    let transformedData = Array.from(productMap.values()).map((product) => {
      const storesArray = Array.from(product.stores.values());
      
      // สร้าง store_qty array ตามลำดับ allStores
      const storeQtyArray = allStores.map((store) => {
        const storeData = product.stores.get(store);
        return storeData ? storeData.total_qty : 0;
      });
      
      return {
        id: `${product.product_code}-${Date.now()}`, // Generate unique ID
        product_code: product.product_code,
        description: product.description,
        um: product.um,
        cost: product.cost,
        item_type: product.item_type,
        date_report: product.date_report,
        stores: storesArray,
        store_qty: storeQtyArray,
        lots: product.allLots,
        total_lots: product.total_lots,
        total_qty: product.total_qty,
      };
    });

    // Apply pagination after grouping
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    transformedData = transformedData.slice(from, to);

    // Get available date_reports for filter
    const { data: dateReports } = await supabase
      .from("date_report")
      .select("id, detail_date")
      .order("detail_date", { ascending: false });

    // Get unique store_locations
    const { data: storeLocations } = await supabase
      .from("products")
      .select("store_location")
      .not("store_location", "is", null);

    const uniqueStoreLocations = Array.from(
      new Set((storeLocations || []).map((s: any) => s.store_location).filter(Boolean))
    ).sort();

    // Get unique item_types
    const { data: itemTypes } = await supabase
      .from("products")
      .select("item_type")
      .not("item_type", "is", null);

    const uniqueItemTypes = Array.from(
      new Set((itemTypes || []).map((it: any) => it.item_type).filter(Boolean))
    ).sort();

    return NextResponse.json({
      success: true,
      data: transformedData,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
      filters: {
        date_reports: dateReports || [],
        store_locations: uniqueStoreLocations,
        item_types: uniqueItemTypes,
        top_stores: allStores, // All stores for column headers (sorted by product count)
      },
    });
  } catch (error: any) {
    console.error("Get uploaded inventory error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

