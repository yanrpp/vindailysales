import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing batch ID" }, { status: 400 });
    }

    await prisma.importBatch.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "ลบประวัติและข้อมูลการนำเข้าเรียบร้อยแล้ว",
    });
  } catch (error: any) {
    console.error("Error deleting batch:", error);
    return NextResponse.json(
      { error: "ไม่สามารถลบข้อมูลได้: " + (error.message || "Database error") },
      { status: 500 }
    );
  }
}
