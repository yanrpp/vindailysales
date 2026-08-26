import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * API endpoint สำหรับดึงข้อมูลสินค้า + Lot
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateReportId = searchParams.get("date_report_id");

    const whereClause: any = {};
    if (dateReportId) {
      whereClause.product = {
        idDate: dateReportId,
      };
    }

    const lotsData = await prisma.productLot.findMany({
      where: whereClause,
      include: {
        product: {
          select: {
            id: true,
            productCode: true,
            description: true,
            storeLocation: true,
            idDate: true,
            dateReport: {
              select: {
                id: true,
                detailDate: true,
              },
            },
          },
        },
      },
    });

    const productLotsMap = new Map<string, any>();

    lotsData.forEach((lot) => {
      if (!lot.product) {
        return;
      }

      const product = lot.product;
      const key = `${product.productCode}_${lot.lotNo}`;

      if (!productLotsMap.has(key)) {
        productLotsMap.set(key, {
          product_code: product.productCode,
          description: product.description || "",
          lot_no: lot.lotNo,
          exp: lot.exp ? lot.exp.toISOString().split("T")[0] : null,
          qty: 0,
          storeQty: new Map<string, number[]>(),
        });
      }

      const item = productLotsMap.get(key);
      const store = lot.store || product.storeLocation || "";
      const qty = Number(lot.qty) || 0;

      item.qty += qty;

      const storeKey = store && store.trim() !== "" ? store : "-";
      if (!item.storeQty.has(storeKey)) {
        item.storeQty.set(storeKey, []);
      }
      item.storeQty.get(storeKey)!.push(qty);
    });

    const productLots = Array.from(productLotsMap.values()).map((item) => {
      const storeQtyArray = Array.from(
        item.storeQty.entries() as Iterable<[string, number[]]>
      ).map(([store, qtyArray]) => ({
        store,
        qtyArray: qtyArray,
        totalQty: qtyArray.reduce((sum: number, q: number) => sum + q, 0),
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
      if (a.exp && b.exp) {
        return new Date(a.exp).getTime() - new Date(b.exp).getTime();
      }
      return 0;
    });

    // ดึงรายการ date_reports ทั้งหมด
    const allDateReports = await prisma.dateReport.findMany({
      select: {
        id: true,
        detailDate: true,
      },
      orderBy: {
        detailDate: "desc",
      },
    });

    const formattedDateReports = allDateReports.map((dr) => ({
      id: dr.id,
      detail_date: dr.detailDate,
    }));

    const selectedDateReport = dateReportId
      ? formattedDateReports.find((dr) => dr.id === dateReportId)
      : formattedDateReports[0];

    return NextResponse.json({
      success: true,
      data: productLots,
      dateReport: selectedDateReport ? selectedDateReport.detail_date : null,
      dateReports: formattedDateReports,
    });
  } catch (error: any) {
    console.error("Get product lots error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
