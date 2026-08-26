import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const data = await prisma.dailySaleReport.findMany({
      where: {
        reportDate: { not: null },
      },
      select: {
        reportDate: true,
      },
      distinct: ["reportDate"],
      orderBy: {
        reportDate: "desc",
      },
    });

    const uniqueDates = data
      .map((item) => item.reportDate)
      .filter((date): date is string => Boolean(date));

    return NextResponse.json({ dates: uniqueDates });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
