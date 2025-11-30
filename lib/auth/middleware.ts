import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getTokenFromRequest } from "./auth-utils";
import { findUserById } from "./user-storage";
import { JWTPayload } from "./auth-utils";

export interface AuthRequest extends NextRequest {
  user?: JWTPayload;
}

// Middleware สำหรับตรวจสอบ authentication
export function requireAuth(
  handler: (req: AuthRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const token = getTokenFromRequest(req.headers);

    if (!token) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    // ตรวจสอบว่า user ยังมีอยู่ในระบบ
    const user = findUserById(payload.userId);
    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "User not found or inactive" },
        { status: 401 }
      );
    }

    // เพิ่ม user info เข้า request
    const authReq = req as AuthRequest;
    authReq.user = payload;

    return handler(authReq);
  };
}

// Middleware สำหรับตรวจสอบ admin role
export function requireAdmin(
  handler: (req: AuthRequest) => Promise<NextResponse>
) {
  return requireAuth(async (req: AuthRequest) => {
    if (!req.user || req.user.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    return handler(req);
  });
}

