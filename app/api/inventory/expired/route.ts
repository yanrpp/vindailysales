import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * API endpoint สำหรับดึงข้อมูลสินค้าหมดอายุ
 * สินค้าที่ exp < CURRENT_DATE
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateReportId = searchParams.get("date_report_id");
    const today = new Date();

    const whereClause: any = {
      exp: {
        lt: today,
      },
    };

    if (dateReportId) {
      whereClause.product = {
        idDate: dateReportId,
      };
    }

    const queryData = await prisma.productLot.findMany({
      where: whereClause,
      include: {
        product: {
          select: {
            id: true,
            productCode: true,
            description: true,
            idDate: true,
          },
        },
      },
      orderBy: {
        exp: "asc",
      },
    });

    const expiredItems = queryData.map((lot) => ({
      product_code: lot.product.productCode,
      description: lot.product.description || "",
      lot_no: lot.lotNo,
      exp: lot.exp ? lot.exp.toISOString().split("T")[0] : null,
      total_qty: Number(lot.qty) || 0,
    }));

    // ดึงรายการ date_reports ทั้งหมดสำหรับ dropdown
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

    return NextResponse.json({
      success: true,
      data: expiredItems,
      dateReports: formattedDateReports,
    });
  } catch (error: any) {
    console.error("Get expired items error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
