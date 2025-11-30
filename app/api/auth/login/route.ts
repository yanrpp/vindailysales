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
    console.log("🔍 Debug - Searching for username:", username);
    const user = await findUserByUsername(username);
    console.log("🔍 Debug - User found:", user ? "YES" : "NO");
    if (user) {
      console.log("🔍 Debug - User details:", {
        id: user.id,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        hasPasswordHash: !!user.passwordHash,
        passwordHashLength: user.passwordHash?.length,
      });
    }
    
    if (!user) {
      console.log("❌ Debug - User not found for username:", username);
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // ตรวจสอบว่า user active หรือไม่
    if (!isUserActive(user)) {
      console.log("❌ Debug - User is inactive:", user.username);
      return NextResponse.json(
        { error: "Account is inactive. Please contact administrator." },
        { status: 403 }
      );
    }

    // ตรวจสอบ password
    console.log("🔍 Debug - Verifying password...");
    console.log("🔍 Debug - Password provided length:", password.length);
    console.log("🔍 Debug - Stored hash preview:", user.passwordHash?.substring(0, 20) + "...");
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    console.log("🔍 Debug - Password valid:", isValidPassword);
    
    if (!isValidPassword) {
      console.log("❌ Debug - Password verification failed for user:", user.username);
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
