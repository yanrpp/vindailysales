import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/middleware";
import {
  getAllUsers,
  createUser,
  findUserByUsername,
} from "@/lib/auth/user-storage";
import { hashPassword } from "@/lib/auth/auth-utils";

// GET: ดึงรายการ users ทั้งหมด (admin only)
export const GET = requireAdmin(async (req) => {
  try {
    const users = getAllUsers();

    // ไม่ส่ง password hash
    const usersWithoutPassword = users.map(({ passwordHash, ...user }) => user);

    return NextResponse.json({
      success: true,
      users: usersWithoutPassword,
      total: usersWithoutPassword.length,
    });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

// POST: สร้าง user ใหม่ (admin only)
export const POST = requireAdmin(async (req) => {
  try {
    const body = await req.json();
    const { username, password, role, isActive } = body;

    // ตรวจสอบ input
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // ตรวจสอบ username ซ้ำ
    const existingUser = findUserByUsername(username);
    if (existingUser) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // สร้าง user
    const newUser = createUser({
      username,
      passwordHash,
      role: role === "admin" ? "admin" : "user",
      isActive: isActive !== undefined ? isActive : true,
    });

    // ส่ง response (ไม่ส่ง password hash)
    const { passwordHash: _, ...userWithoutPassword } = newUser;

    return NextResponse.json(
      {
        success: true,
        user: userWithoutPassword,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Create user error:", error);
    if (error.message.includes("already exists")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

