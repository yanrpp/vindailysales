import { NextRequest, NextResponse } from "next/server";
import { findUserByUsername, updateLastLogin } from "@/lib/auth/user-storage";
import { verifyPassword, generateToken, isUserActive, AUTH_COOKIE_NAME } from "@/lib/auth/auth-utils";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const rateLimit = checkRateLimit(`login_${clientIp}`, 5, 60 * 1000); // 5 attempts per minute

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait 1 minute before trying again." },
        { status: 429 }
      );
    }

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
    const user = await findUserByUsername(username.trim());

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

    // ตรวจสอบว่า user ได้รับการอนุมัติหรือไม่
    if (!user.isApproved) {
      return NextResponse.json(
        {
          error: "บัญชีของคุณกำลังรอการอนุมัติ โปรดรอผู้ดูแลระบบอนุมัติก่อนจึงจะสามารถเข้าใช้งานระบบได้",
          pendingApproval: true,
        },
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
    await updateLastLogin(user.id);

    // สร้าง token
    const token = generateToken(user);

    // ส่ง response (ไม่ส่ง password hash)
    const { passwordHash, ...userWithoutPassword } = user;

    const response = NextResponse.json({
      success: true,
      token,
      user: userWithoutPassword,
    });

    // ตั้งค่า HttpOnly Cookie เพื่อความปลอดภัย
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Authentication service temporarily unavailable" },
      { status: 500 }
    );
  }
}
