import { NextResponse } from "next/server";
import { requireAuth, AuthRequest } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";

// GET /api/drive/users - ดึงรายชื่อผู้ใช้ที่อนุมัติแล้วทั้งหมดในระบบ เพื่อใช้เลือกส่ง/แชร์ไฟล์
export const GET = requireAuth(async (req: AuthRequest) => {
  try {
    const currentUserId = req.user!.userId;
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        isApproved: true,
        id: { not: currentUserId },
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
      },
      orderBy: [{ name: "asc" }, { username: "asc" }],
    });

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error: any) {
    console.error("GET /api/drive/users error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถดึงรายชื่อผู้ใช้ได้" },
      { status: 500 }
    );
  }
});
