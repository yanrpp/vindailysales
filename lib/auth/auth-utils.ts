import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { User } from "./user-storage";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

// ตรวจสอบ password
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// สร้าง JWT token
export function generateToken(user: User): string {
  const payload: JWTPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

// ตรวจสอบและ decode JWT token
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

// ดึง token จาก request headers
export function getTokenFromRequest(
  headers: Headers | Record<string, string | string[] | undefined>
): string | null {
  const authHeader =
    "get" in headers
      ? headers.get("authorization")
      : (headers.authorization as string | undefined);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.substring(7);
}

// ตรวจสอบว่า user มีสิทธิ์ admin หรือไม่
export function isAdmin(user: User | JWTPayload): boolean {
  return user.role === "admin";
}

// ตรวจสอบว่า user active หรือไม่
export function isUserActive(user: User): boolean {
  return user.isActive;
}

