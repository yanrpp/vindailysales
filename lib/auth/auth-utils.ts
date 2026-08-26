import jwt, { SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { User } from "./user-storage";

export const AUTH_COOKIE_NAME = "auth_token";

const JWT_SECRET: string = process.env.JWT_SECRET || "vin-super-secret-key-2025-production-jwt-auth";
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || "7d";

export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

// Hash password (10 salt rounds with bcrypt)
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

// Verify password
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

// Create JWT token
export function generateToken(user: User): string {
  const payload: JWTPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
  };

  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, JWT_SECRET, options);
}

// Verify & decode JWT token
export function verifyToken(token: string): JWTPayload | null {
  try {
    if (!token) return null;
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string") return null;
    return decoded as JWTPayload;
  } catch {
    return null;
  }
}

// Extract token from request headers or cookies
export function getTokenFromRequest(
  headersOrReq: Headers | Record<string, string | string[] | undefined> | any
): string | null {
  // 1. Check Authorization Bearer header
  let authHeader: string | null = null;

  if (headersOrReq && "get" in headersOrReq && typeof headersOrReq.get === "function") {
    authHeader = headersOrReq.get("authorization");
  } else if (headersOrReq) {
    const recordHeaders = headersOrReq as Record<string, string | string[] | undefined>;
    const auth = recordHeaders.authorization;
    if (auth) {
      authHeader = Array.isArray(auth) ? auth[0] : auth;
    }
  }

  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }

  // 2. Check Cookie header
  let cookieHeader: string | null = null;
  if (headersOrReq && "get" in headersOrReq && typeof headersOrReq.get === "function") {
    cookieHeader = headersOrReq.get("cookie");
  } else if (headersOrReq) {
    const recordHeaders = headersOrReq as Record<string, string | string[] | undefined>;
    const cookie = recordHeaders.cookie;
    if (cookie) {
      cookieHeader = Array.isArray(cookie) ? cookie[0] : cookie;
    }
  }

  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    const authCookie = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
    if (authCookie) {
      return authCookie.substring(AUTH_COOKIE_NAME.length + 1).trim();
    }
  }

  return null;
}

// Check admin role
export function isAdmin(user: User | JWTPayload): boolean {
  return user.role === "admin";
}

// Check active status
export function isUserActive(user: User): boolean {
  return user.isActive;
}
