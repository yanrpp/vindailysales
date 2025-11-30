import { NextRequest, NextResponse } from "next/server";
import { createUser, findUserByUsername, findUserByEmail } from "@/lib/auth/user-storage";
import { hashPassword, generateToken } from "@/lib/auth/auth-utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, email, password, role } = body;

    // ตรวจสอบ input
    if (!username || !email || !password) {
      return NextResponse.json(
        { error: "Username, email, and password are required" },
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

    // ตรวจสอบ email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // ตรวจสอบ username ซ้ำ
    if (findUserByUsername(username)) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 409 }
      );
    }

    // ตรวจสอบ email ซ้ำ
    if (findUserByEmail(email)) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // สร้าง user ใหม่ (default role เป็น 'user' ถ้าไม่ระบุ)
    const newUser = createUser({
      username,
      email,
      passwordHash,
      role: role === "admin" ? "admin" : "user",
      isActive: true,
    });

    // สร้าง token
    const token = generateToken(newUser);

    // ส่ง response (ไม่ส่ง password hash)
    const { passwordHash: _, ...userWithoutPassword } = newUser;

    return NextResponse.json(
      {
        success: true,
        token,
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

