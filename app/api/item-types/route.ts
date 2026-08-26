import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const data = await prisma.dailySaleItem.findMany({
      where: {
        itemType: { not: null },
      },
      select: {
        itemType: true,
      },
      distinct: ["itemType"],
      orderBy: {
        itemType: "asc",
      },
    });

    const uniqueItemTypes = data
      .map((item) => item.itemType)
      .filter((type): type is string => Boolean(type && type.trim().length > 0));

    return NextResponse.json({ item_types: uniqueItemTypes });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
