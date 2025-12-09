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
      .order("product_code", { ascending: true });

    // Filter by date_report_id
    if (dateReportId) {
      query = query.eq("id_date", dateReportId);
    }

    // Filter by store_location
    if (storeLocation) {
      query = query.eq("store_location", storeLocation);
    }

    // Search by product_code or description
    if (search) {
      query = query.or(`product_code.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Get total count with same filters
    let countQuery = supabase
      .from("products")
      .select("*", { count: "exact", head: true });

    if (dateReportId) {
      countQuery = countQuery.eq("id_date", dateReportId);
    }

    if (storeLocation) {
      countQuery = countQuery.eq("store_location", storeLocation);
    }

    if (search) {
      countQuery = countQuery.or(`product_code.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error("Count error:", countError);
    }

    // Apply pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error } = await query;

    if (error) {
      console.error("Query error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Transform data to include lot details
    const transformedData = (data || []).map((product: any) => {
      const lots = (product.product_lots || []).map((lot: any) => ({
        id: lot.id,
        lot_no: lot.lot_no,
        exp: lot.exp,
        qty: lot.qty || 0,
        store: product.store_location || null, // ใช้ store_location จาก products แทน
      }));

      return {
        id: product.id,
        product_code: product.product_code,
        description: product.description,
        um: product.um,
        cost: product.cost,
        store_location: product.store_location,
        item_type: product.item_type,
        date_report: product.date_report ? {
          id: product.date_report.id,
          detail_date: product.date_report.detail_date,
        } : null,
        lots: lots,
        total_lots: lots.length,
        total_qty: lots.reduce((sum: number, lot: any) => sum + (lot.qty || 0), 0),
      };
    });

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

