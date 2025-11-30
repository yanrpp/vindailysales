import { NextRequest, NextResponse } from "next/server";
import { findUserByUsername, updateLastLogin } from "@/lib/auth/user-storage";
import { verifyPassword, generateToken, isUserActive } from "@/lib/auth/auth-utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    // ตรวจสอบ input
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    // หา user
    const user = findUserByUsername(username);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // ตรวจสอบว่า user active หรือไม่
    if (!isUserActive(user)) {
      return NextResponse.json(
        { error: "Account is inactive. Please contact administrator." },
        { status: 403 }
      );
    }

    // ตรวจสอบ password
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // อัปเดต last login
    updateLastLogin(user.id);

    // สร้าง token
    const token = generateToken(user);

    // ส่ง response (ไม่ส่ง password hash)
    const { passwordHash, ...userWithoutPassword } = user;

    return NextResponse.json({
      success: true,
      token,
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
