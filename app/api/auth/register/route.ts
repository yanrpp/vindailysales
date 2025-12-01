import { NextRequest, NextResponse } from "next/server";
import { createUser, findUserByUsername } from "@/lib/auth/user-storage";
import { hashPassword, generateToken } from "@/lib/auth/auth-utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password, role } = body;

    // ตรวจสอบ input
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    // ตรวจสอบความยาว password
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // ตรวจสอบ username ซ้ำ
    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // สร้าง user ใหม่ (default role เป็น 'user' ถ้าไม่ระบุ)
    // ผู้ใช้ที่สมัครใหม่ต้องรอการอนุมัติจาก admin (isApproved = false)
    const newUser = await createUser({
      username,
      passwordHash,
      role: role === "admin" ? "admin" : "user",
      isActive: true,
      isApproved: false, // ต้องรอการอนุมัติจาก admin
    });

    // ไม่สร้าง token ให้ผู้ใช้ที่ยังไม่ได้รับการอนุมัติ
    // ส่ง response (ไม่ส่ง password hash)
    const { passwordHash: _, ...userWithoutPassword } = newUser;

    return NextResponse.json(
      {
        success: true,
        message: "✅ “ลงทะเบียนสำเร็จแล้ว บัญชีของคุณกำลังรอการอนุมัติจากผู้ดูแลระบบ”",
        pendingApproval: true,
        user: userWithoutPassword,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

