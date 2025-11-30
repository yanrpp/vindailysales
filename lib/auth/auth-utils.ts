import jwt, { SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { User } from "./user-storage";

const JWT_SECRET: string = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || "7d";

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

  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };

  const token = jwt.sign(payload, JWT_SECRET, options);
  return token;
}

// ตรวจสอบและ decode JWT token
export function verifyToken(token: string): JWTPayload | null {
  try {
    if (!JWT_SECRET) {
      return null;
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (typeof decoded === "string") {
      return null;
    }

    return decoded as JWTPayload;
  } catch (error) {
    return null;
  }
}

// ดึง token จาก request headers
export function getTokenFromRequest(
  headers: Headers | Record<string, string | string[] | undefined>
): string | null {
  let authHeader: string | null = null;
  
  if ("get" in headers && typeof headers.get === "function") {
    authHeader = (headers as Headers).get("authorization");
  } else {
    const recordHeaders = headers as Record<string, string | string[] | undefined>;
    const auth = recordHeaders.authorization;
    if (auth) {
      authHeader = Array.isArray(auth) ? auth[0] : auth;
    }
  }

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

