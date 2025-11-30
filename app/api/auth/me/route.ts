import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { findUserById } from "@/lib/auth/user-storage";

export const GET = requireAuth(async (req) => {
  try {
    if (!req.user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    const user = findUserById(req.user.userId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // ส่ง response (ไม่ส่ง password hash)
    const { passwordHash, ...userWithoutPassword } = user;

    return NextResponse.json({
      success: true,
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

