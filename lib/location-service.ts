import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ITEM_TYPES } from "@/lib/location-parser";
import { getTokenFromRequest, verifyToken, JWTPayload } from "@/lib/auth/auth-utils";

let itemTypesEnsured = false;

// สร้างข้อมูลประเภทคลังเริ่มต้น (1 = Mainstore, 2 = พัสดุ)
export async function ensureItemTypes() {
  if (itemTypesEnsured) return;
  await prisma.itemType.createMany({
    data: ITEM_TYPES.map((t) => ({ id: t.id, code: t.code, name: t.name })),
    skipDuplicates: true,
  });
  itemTypesEnsured = true;
}

export function getRequestUser(req: NextRequest): JWTPayload | null {
  const token = getTokenFromRequest(req.headers);
  return token ? verifyToken(token) : null;
}

export function parseItemTypeId(v: unknown): number | null {
  const n = Number(v);
  return ITEM_TYPES.some((t) => t.id === n) ? n : null;
}
