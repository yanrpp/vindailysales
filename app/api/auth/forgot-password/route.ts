import { NextRequest, NextResponse } from "next/server";
import { findUserByUsername, updateUser } from "@/lib/auth/user-storage";
import { hashPassword } from "@/lib/auth/auth-utils";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import crypto from "crypto";

// เก็บ reset tokens ใน memory
const resetTokens = new Map<
  string,
  { userId: string; username: string; expiresAt: number }
>();

// POST: ขอ reset password
export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const rateLimit = checkRateLimit(`forgot_pw_${clientIp}`, 5, 60 * 1000);

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many password reset requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { username } = body;

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    // หา user
    const user = await findUserByUsername(String(username).trim());
    if (!user) {
      // ไม่บอกว่า user ไม่มีอยู่เพื่อความปลอดภัย
      return NextResponse.json({
        success: true,
        message: "If the username exists, a password reset link will be sent.",
      });
    }

    // ตรวจสอบว่า user active หรือไม่
    if (!user.isActive) {
      return NextResponse.json(
        { error: "Account is inactive. Please contact administrator." },
        { status: 403 }
      );
    }

    // สร้าง reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 3600000; // 1 hour

    resetTokens.set(resetToken, {
      userId: user.id,
      username: user.username,
      expiresAt,
    });

    const resetLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;

    return NextResponse.json({
      success: true,
      message: "If the username exists, a password reset link will be sent.",
      resetLink: process.env.NODE_ENV === "development" ? resetLink : undefined,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Password reset service temporarily unavailable" },
      { status: 500 }
    );
  }
}

// GET: ตรวจสอบ reset token
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    const tokenData = resetTokens.get(token);

    if (!tokenData) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 400 }
      );
    }

    if (Date.now() > tokenData.expiresAt) {
      resetTokens.delete(token);
      return NextResponse.json(
        { error: "Token has expired" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      username: tokenData.username,
    });
  } catch (error) {
    console.error("Verify reset token error:", error);
    return NextResponse.json(
      { error: "Verification service temporarily unavailable" },
      { status: 500 }
    );
  }
}

// PUT: Reset password ด้วย token
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: "Token and new password are required" },
        { status: 400 }
      );
    }

    if (String(newPassword).length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const tokenData = resetTokens.get(token);

    if (!tokenData) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 400 }
      );
    }

    if (Date.now() > tokenData.expiresAt) {
      resetTokens.delete(token);
      return NextResponse.json(
        { error: "Token has expired" },
        { status: 400 }
      );
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // อัปเดต password
    await updateUser(tokenData.userId, { passwordHash });

    // ลบ token หลังจากใช้แล้ว
    resetTokens.delete(token);

    return NextResponse.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Password update failed" },
      { status: 500 }
    );
  }
}
