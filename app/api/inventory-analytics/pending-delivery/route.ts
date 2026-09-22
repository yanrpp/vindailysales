import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { itemCode, qty } = await req.json();

    if (!itemCode) {
      return NextResponse.json({ error: "Missing itemCode" }, { status: 400 });
    }

    const numericQty = Math.max(0, Number(qty) || 0);
    const trimmedCode = String(itemCode).trim();

    const record = await (prisma as any).inventoryPendingDelivery.upsert({
      where: { itemCode: trimmedCode },
      update: { qty: numericQty },
      create: { itemCode: trimmedCode, qty: numericQty },
    });

    return NextResponse.json({ success: true, record });
  } catch (error: any) {
    console.error("Error saving pending delivery:", error);
    return NextResponse.json(
      { error: "Failed to save pending delivery: " + error.message },
      { status: 500 }
    );
  }
}
