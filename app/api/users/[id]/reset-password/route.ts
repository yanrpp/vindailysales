import { NextResponse } from "next/server";
import { requireAdmin, AuthRequest } from "@/lib/auth/middleware";
import { findUserById, updateUser } from "@/lib/auth/user-storage";
import { hashPassword } from "@/lib/auth/auth-utils";

// POST: รีเซ็ต password เป็น "user1234" (admin only)
export const POST = requireAdmin(async (req: AuthRequest) => {
  try {
    // ดึง id จาก URL path: /api/users/[id]/reset-password
    const urlParts = req.url.split("/");
    const idIndex = urlParts.findIndex((part) => part === "users") + 1;
    const id = urlParts[idIndex];

    if (!id) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    if (!req.user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    // หา user
    const user = await findUserById(id);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // รีเซ็ต password เป็น "user1234"
    const defaultPassword = "user1234";
    const passwordHash = await hashPassword(defaultPassword);

    // อัปเดต password
    const updatedUser = await updateUser(id, {
      passwordHash,
    });

    // ส่ง response (ไม่ส่ง password hash)
    const { passwordHash: _, ...userWithoutPassword } = updatedUser;

    return NextResponse.json(
      {
        success: true,
        message: "Password has been reset to 'user1234'",
        user: userWithoutPassword,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
});

