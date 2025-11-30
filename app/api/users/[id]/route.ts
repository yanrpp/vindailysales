import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/auth/middleware";
import {
  findUserById,
  updateUser,
  deleteUser,
} from "@/lib/auth/user-storage";
import { hashPassword } from "@/lib/auth/auth-utils";

// GET: ดึงข้อมูล user โดย ID
export const GET = requireAuth(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || req.url.split("/").pop();

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // ตรวจสอบสิทธิ์: user สามารถดูข้อมูลตัวเองได้ หรือ admin ดูได้ทุกคน
    if (!req.user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    if (req.user.userId !== id && req.user.role !== "admin") {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const user = await findUserById(id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
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

// PUT: อัปเดต user
export const PUT = requireAuth(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || req.url.split("/").pop();

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    if (!req.user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { username, role, isActive, password } = body;

    // ตรวจสอบสิทธิ์: user สามารถแก้ไขข้อมูลตัวเองได้ (ยกเว้น role) หรือ admin แก้ไขได้ทุกคน
    if (req.user.userId !== id && req.user.role !== "admin") {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // User ปกติไม่สามารถเปลี่ยน role หรือ isActive ได้
    if (req.user.role !== "admin") {
      if (role !== undefined || isActive !== undefined) {
        return NextResponse.json(
          { error: "Only admin can change role or active status" },
          { status: 403 }
        );
      }
    }

    const user = await findUserById(id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // เตรียมข้อมูลสำหรับอัปเดต
    const updates: any = {};
    if (username !== undefined) updates.username = username;
    if (role !== undefined && req.user.role === "admin") updates.role = role;
    if (isActive !== undefined && req.user.role === "admin")
      updates.isActive = isActive;
    if (password !== undefined) {
      if (password.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters" },
          { status: 400 }
        );
      }
      updates.passwordHash = await hashPassword(password);
    }

    // อัปเดต user
    const updatedUser = await updateUser(id, updates);

    // ส่ง response (ไม่ส่ง password hash)
    const { passwordHash: _, ...userWithoutPassword } = updatedUser;

    return NextResponse.json({
      success: true,
      user: userWithoutPassword,
    });
  } catch (error: any) {
    console.error("Update user error:", error);
    if (error.message.includes("already exists")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

// DELETE: ลบ user (admin only)
export const DELETE = requireAdmin(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || req.url.split("/").pop();

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    if (!req.user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    // ไม่ให้ลบตัวเอง
    if (req.user.userId === id) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    deleteUser(id);

    return NextResponse.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete user error:", error);
    if (error.message.includes("not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

