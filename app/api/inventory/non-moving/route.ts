import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * API endpoint สำหรับดึงข้อมูลสินค้าค้างสต๊อก 6 เดือน (ไม่มีการเคลื่อนไหว)
 * สินค้าที่ไม่มีการอัปเดตรายงานล่าสุดภายใน 6 เดือน
 */
export async function GET(req: NextRequest) {
  try {
    const queryData = await prisma.productLot.findMany({
      include: {
        product: {
          select: {
            id: true,
            productCode: true,
            description: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Group by product_code, lot_no และหาค่าสูงสุดของ updatedAt
    const grouped = new Map<string, any>();

    queryData.forEach((lot) => {
      if (!lot.product) {
        return;
      }

      const product = lot.product;
      const key = `${product.productCode}_${lot.lotNo}`;
      const lastUpdate = lot.updatedAt ? lot.updatedAt.toISOString() : new Date().toISOString();

      if (!grouped.has(key)) {
        grouped.set(key, {
          product_code: product.productCode,
          description: product.description || "",
          lot_no: lot.lotNo,
          exp: lot.exp ? lot.exp.toISOString().split("T")[0] : null,
          last_update: lastUpdate,
          total_qty: 0,
        });
      }

      const item = grouped.get(key);
      if (item) {
        item.total_qty += Number(lot.qty) || 0;
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
        (a, b) => new Date(a.last_update).getTime() - new Date(b.last_update).getTime()
      ),
    });
  } catch (error: any) {
    console.error("Get non-moving items error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
