import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";
import { findUserById, updateUser } from "@/lib/auth/user-storage";

// POST: อนุมัติหรือปฏิเสธผู้ใช้
export const POST = requireAdmin(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { userId, approved } = body;

    if (!userId || typeof approved !== "boolean") {
      return NextResponse.json(
        { error: "userId and approved (boolean) are required" },
        { status: 400 }
      );
    }

    // หา user
    const user = await findUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // อัปเดตสถานะการอนุมัติ
    const updatedUser = await updateUser(userId, {
      isApproved: approved,
    });

    // ส่ง response (ไม่ส่ง password hash)
    const { passwordHash: _, ...userWithoutPassword } = updatedUser;

    return NextResponse.json(
      {
        success: true,
        message: approved 
          ? "User has been approved successfully" 
          : "User approval has been revoked",
        user: userWithoutPassword,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Approve user error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
});

