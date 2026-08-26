import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    const whereClause: any = {};

    if (dateReportId) {
      whereClause.idDate = dateReportId;
    }

    if (storeLocation) {
      whereClause.storeLocation = storeLocation;
    }

    if (itemType) {
      whereClause.itemType = itemType;
    }

    if (search) {
      whereClause.OR = [
        { productCode: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // ดึงข้อมูล products พร้อม lots และ date_report
    const productsData = await prisma.product.findMany({
      where: whereClause,
      include: {
        dateReport: {
          select: {
            id: true,
            detailDate: true,
          },
        },
        lots: {
          select: {
            id: true,
            lotNo: true,
            exp: true,
            qty: true,
            store: true,
          },
        },
      },
      orderBy: {
        productCode: "asc",
      },
    });

    // Group data by product_code
    const productMap = new Map<
      string,
      {
        product_code: string;
        description: string;
        um: string;
        cost: number;
        item_type: string | null;
        date_report: { id: string; detail_date: string } | null;
        stores: Map<
          string,
          {
            store_location: string;
            lots: Array<{ id: string; lot_no: string; exp: string | null; qty: number; store: string | null }>;
            total_qty: number;
          }
        >;
        allLots: Array<{ id: string; lot_no: string; exp: string | null; qty: number; store: string | null }>;
        total_lots: number;
        total_qty: number;
      }
    >();

    productsData.forEach((product) => {
      const productCode = product.productCode;
      const storeLoc = product.storeLocation || "";

      const lots = (product.lots || []).map((lot) => ({
        id: lot.id,
        lot_no: lot.lotNo,
        exp: lot.exp ? lot.exp.toISOString().split("T")[0] : null,
        qty: Number(lot.qty) || 0,
        store: product.storeLocation || null,
      }));

      if (!productMap.has(productCode)) {
        const storesMap = new Map<
          string,
          {
            store_location: string;
            lots: Array<{ id: string; lot_no: string; exp: string | null; qty: number; store: string | null }>;
            total_qty: number;
          }
        >();

        storesMap.set(storeLoc, {
          store_location: storeLoc,
          lots: lots,
          total_qty: lots.reduce((sum, lot) => sum + (lot.qty || 0), 0),
        });

        productMap.set(productCode, {
          product_code: productCode,
          description: product.description || "",
          um: product.um || "",
          cost: product.cost || 0,
          item_type: product.itemType,
          date_report: product.dateReport
            ? {
                id: product.dateReport.id,
                detail_date: product.dateReport.detailDate,
              }
            : null,
          stores: storesMap,
          allLots: lots,
          total_lots: lots.length,
          total_qty: lots.reduce((sum, lot) => sum + (lot.qty || 0), 0),
        });
      } else {
        const existingProduct = productMap.get(productCode)!;

        if (existingProduct.stores.has(storeLoc)) {
          const existingStore = existingProduct.stores.get(storeLoc)!;
          existingStore.lots.push(...lots);
          existingStore.total_qty = existingStore.lots.reduce((sum, lot) => sum + (lot.qty || 0), 0);
        } else {
          existingProduct.stores.set(storeLoc, {
            store_location: storeLoc,
            lots: lots,
            total_qty: lots.reduce((sum, lot) => sum + (lot.qty || 0), 0),
          });
        }

        existingProduct.allLots.push(...lots);
        existingProduct.total_lots = existingProduct.allLots.length;
        existingProduct.total_qty = existingProduct.allLots.reduce((sum, lot) => sum + (lot.qty || 0), 0);
      }
    });

    // Count unique product codes
    const count = productMap.size;

    // Get all store locations for column headers
    const storeCountMap = new Map<string, number>();
    productMap.forEach((product) => {
      product.stores.forEach((storeData) => {
        if (storeData.store_location) {
          const currentCount = storeCountMap.get(storeData.store_location) || 0;
          storeCountMap.set(storeData.store_location, currentCount + 1);
        }
      });
    });

    const sortedStores = Array.from(storeCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([store]) => store);

    const allStoreLocationsSet = new Set<string>();
    productMap.forEach((product) => {
      product.stores.forEach((storeData) => {
        if (storeData.store_location) {
          allStoreLocationsSet.add(storeData.store_location);
        }
      });
    });

    const allStoreLocations = Array.from(allStoreLocationsSet).sort();
    const allStores =
      sortedStores.length > 0
        ? [...sortedStores, ...allStoreLocations.filter((s) => !sortedStores.includes(s))]
        : allStoreLocations;

    // Transform to array format
    let transformedData = Array.from(productMap.values()).map((product) => {
      const storesArray = Array.from(product.stores.values());

      const storeQtyArray = allStores.map((store) => {
        const storeData = product.stores.get(store);
        return storeData ? storeData.total_qty : 0;
      });

      return {
        id: `${product.product_code}-${Date.now()}`,
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

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    transformedData = transformedData.slice(from, to);

    // Get available date_reports for filter
    const dateReports = await prisma.dateReport.findMany({
      select: { id: true, detailDate: true },
      orderBy: { detailDate: "desc" },
    });

    const formattedDateReports = dateReports.map((dr) => ({
      id: dr.id,
      detail_date: dr.detailDate,
    }));

    // Get unique store_locations
    const storeLocationsData = await prisma.product.findMany({
      where: { storeLocation: { not: null } },
      select: { storeLocation: true },
      distinct: ["storeLocation"],
      orderBy: { storeLocation: "asc" },
    });

    const uniqueStoreLocations = storeLocationsData
      .map((s) => s.storeLocation)
      .filter((loc): loc is string => Boolean(loc));

    // Get unique item_types
    const itemTypesData = await prisma.product.findMany({
      where: { itemType: { not: null } },
      select: { itemType: true },
      distinct: ["itemType"],
      orderBy: { itemType: "asc" },
    });

    const uniqueItemTypes = itemTypesData
      .map((it) => it.itemType)
      .filter((type): type is string => Boolean(type));

    return NextResponse.json({
      success: true,
      data: transformedData,
      pagination: {
        page,
        pageSize,
        total: count,
        totalPages: Math.ceil(count / pageSize),
      },
      filters: {
        date_reports: formattedDateReports,
        store_locations: uniqueStoreLocations,
        item_types: uniqueItemTypes,
        top_stores: allStores,
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
