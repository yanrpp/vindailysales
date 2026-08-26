import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getTokenFromRequest, JWTPayload } from "./auth-utils";
import { findUserById } from "./user-storage";

export interface AuthRequest extends NextRequest {
  user?: JWTPayload;
}

// Middleware สำหรับตรวจสอบ authentication (Token via Header or Cookie)
export function requireAuth(
  handler: (req: AuthRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
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
          { error: "Invalid or expired session. Please log in again." },
          { status: 401 }
        );
      }

      // ตรวจสอบสถานะ User ในฐานข้อมูล
      const user = await findUserById(payload.userId);
      if (!user || !user.isActive) {
        return NextResponse.json(
          { error: "User account not found or deactivated" },
          { status: 401 }
        );
      }

      // เพิ่ม user payload เข้า request
      const authReq = req as AuthRequest;
      authReq.user = payload;

      return handler(authReq);
    } catch (error) {
      console.error("Auth Middleware Error:", error);
      return NextResponse.json(
        { error: "Internal server authentication error" },
        { status: 500 }
      );
    }
  };
}

// Middleware สำหรับตรวจสอบ admin role
export function requireAdmin(
  handler: (req: AuthRequest) => Promise<NextResponse>
) {
  return requireAuth(async (req: AuthRequest) => {
    if (!req.user || req.user.role !== "admin") {
      return NextResponse.json(
        { error: "Access denied. Administrator privileges required." },
        { status: 403 }
      );
    }

    return handler(req);
  });
}
