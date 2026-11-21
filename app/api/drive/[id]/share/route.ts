import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getTokenFromRequest, hashPassword } from "@/lib/auth/auth-utils";
import { prisma } from "@/lib/prisma";
import { checkItemPermission } from "@/lib/drive-utils";
import crypto from "crypto";

// POST /api/drive/[id]/share - แชร์/ส่งไฟล์ให้ผู้ใช้ในระบบ หรือ ตั้งค่าลิงก์แชร์สาธารณะ
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const token = getTokenFromRequest(req.headers);
    const user = token ? verifyToken(token) : null;

    if (!user) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    }

    const access = await checkItemPermission(id, user.userId, user.role);
    if (!access.allowed || (access.permission !== "OWNER" && access.permission !== "EDIT")) {
      return NextResponse.json(
        { error: "คุณไม่มีสิทธิ์จัดการการแชร์รายการนี้" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { action } = body;

    // 1. แชร์/ส่งไฟล์ให้ผู้ใช้ในระบบ (Share with user)
    if (action === "share-user") {
      const { targetUserId, permission = "VIEW", note = null } = body;

      if (!targetUserId) {
        return NextResponse.json(
          { error: "กรุณาเลือกผู้รับไฟล์" },
          { status: 400 }
        );
      }

      if (targetUserId === access.item.ownerId) {
        return NextResponse.json(
          { error: "ไม่สามารถแชร์ให้เจ้าของไฟล์เองได้" },
          { status: 400 }
        );
      }

      const share = await prisma.driveShare.upsert({
        where: {
          itemId_sharedWithUserId: {
            itemId: id,
            sharedWithUserId: targetUserId,
          },
        },
        create: {
          itemId: id,
          sharedWithUserId: targetUserId,
          sharedByUserId: user.userId,
          permission: permission === "EDIT" ? "EDIT" : "VIEW",
          note,
        },
        update: {
          permission: permission === "EDIT" ? "EDIT" : "VIEW",
          note,
        },
        include: {
          sharedWithUser: {
            select: { id: true, username: true, name: true },
          },
        },
      });

      return NextResponse.json({
        success: true,
        share,
        message: `ส่งไฟล์และแชร์ให้ ${share.sharedWithUser.name || share.sharedWithUser.username} สำเร็จ`,
      });
    }

    // 2. ยกเลิกการแชร์ให้ผู้ใช้ (Remove user share)
    if (action === "unshare-user") {
      const { targetUserId } = body;
      await prisma.driveShare.deleteMany({
        where: {
          itemId: id,
          sharedWithUserId: targetUserId,
        },
      });

      return NextResponse.json({
        success: true,
        message: "ยกเลิกการแชร์เรียบร้อยแล้ว",
      });
    }

    // 3. ตั้งค่าลิงก์แชร์สาธารณะ (Public Share Link)
    if (action === "update-public-link") {
      const {
        isPublic,
        password, // string | null (ส่ง "" เพื่อลบรหัสผ่าน, ส่งค่าใหม่เพื่อตั้งรหัส)
        clearPassword,
        expiresAt, // ISO string | null
        allowDownload = true,
        regenerateToken = false,
      } = body;

      let shareToken = access.item.shareToken;
      if (isPublic && (!shareToken || regenerateToken)) {
        shareToken = crypto.randomBytes(16).toString("hex");
      }

      let sharePassword = access.item.sharePassword;
      if (clearPassword) {
        sharePassword = null;
      } else if (typeof password === "string" && password.trim().length > 0) {
        sharePassword = await hashPassword(password.trim());
      }

      const updated = await prisma.driveItem.update({
        where: { id },
        data: {
          isPublic: Boolean(isPublic),
          shareToken: isPublic ? shareToken : access.item.shareToken,
          sharePassword,
          shareExpiresAt: expiresAt ? new Date(expiresAt) : null,
          allowDownload: Boolean(allowDownload),
        },
        include: {
          owner: { select: { id: true, username: true, name: true } },
          shares: {
            include: {
              sharedWithUser: { select: { id: true, username: true, name: true } },
            },
          },
        },
      });

      return NextResponse.json({
        success: true,
        item: updated,
        hasPassword: Boolean(updated.sharePassword),
        message: isPublic ? "เปิดใช้งานลิงก์แชร์สาธารณะแล้ว" : "ปิดลิงก์แชร์สาธารณะแล้ว",
      });
    }

    return NextResponse.json({ error: "Invalid share action" }, { status: 400 });
  } catch (error: any) {
    console.error("POST /api/drive/[id]/share error:", error);
    return NextResponse.json(
      { error: error.message || "เกิดข้อผิดพลาดในการตั้งค่าการแชร์" },
      { status: 500 }
    );
  }
}
