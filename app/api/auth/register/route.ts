import { NextRequest, NextResponse } from "next/server";
import { createUser, findUserByUsername } from "@/lib/auth/user-storage";
import { hashPassword } from "@/lib/auth/auth-utils";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const rateLimit = checkRateLimit(`register_${clientIp}`, 5, 60 * 1000); // Max 5 registrations per minute per IP

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { username, password, name } = body;

    // ตรวจสอบ input
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const cleanUsername = String(username).trim();

    if (cleanUsername.length < 3) {
      return NextResponse.json(
        { error: "Username must be at least 3 characters" },
        { status: 400 }
      );
    }

    // ตรวจสอบความยาว password
    if (String(password).length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // ตรวจสอบ username ซ้ำ
    const existingUser = await findUserByUsername(cleanUsername);
    if (existingUser) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // สร้าง user ใหม่ (ป้องกัน Privilege Escalation: สาธารณะสมัครได้เฉพาะ role 'user' เสมอ)
    const newUser = await createUser({
      username: cleanUsername,
      name: name ? String(name).trim() : undefined,
      passwordHash,
      role: "user", // Enforce standard user role
      isActive: true,
      isApproved: false, // ต้องรอการอนุมัติจาก admin
    });

    const { passwordHash: _, ...userWithoutPassword } = newUser;

    return NextResponse.json(
      {
        success: true,
        message: "ลงทะเบียนสำเร็จแล้ว บัญชีของคุณกำลังรอการอนุมัติจากผู้ดูแลระบบ",
        pendingApproval: true,
        user: userWithoutPassword,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Registration service temporarily unavailable" },
      { status: 500 }
    );
  }
}
