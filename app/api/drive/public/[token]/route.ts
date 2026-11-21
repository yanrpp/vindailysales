import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/auth-utils";

// GET /api/drive/public/[token] - ดูข้อมูลไฟล์หรือโฟลเดอร์ที่แชร์ผ่านลิงก์สาธารณะ (ไม่ต้องล็อกอิน)
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const { searchParams } = new URL(req.url);
    const password = searchParams.get("password");
    const folderId = searchParams.get("folderId");

    const item = await prisma.driveItem.findUnique({
      where: { shareToken: token },
      include: {
        owner: {
          select: { id: true, username: true, name: true },
        },
      },
    });

    if (!item || !item.isPublic || item.isTrashed) {
      return NextResponse.json(
        { error: "ไม่พบลิงก์แชร์นี้ หรือลิงก์ถูกยกเลิกแล้ว" },
        { status: 404 }
      );
    }

    if (item.shareExpiresAt && new Date(item.shareExpiresAt) < new Date()) {
      return NextResponse.json(
        { error: "ลิงก์แชร์นี้หมดอายุแล้ว" },
        { status: 410 }
      );
    }

    if (item.sharePassword) {
      if (!password) {
        return NextResponse.json(
          {
            error: "ลิงก์นี้ได้รับการป้องกันด้วยรหัสผ่าน",
            requiresPassword: true,
            itemSummary: {
              name: item.name,
              type: item.type,
              ownerName: item.owner.name || item.owner.username,
            },
          },
          { status: 401 }
        );
      }

      const isValid = await verifyPassword(password, item.sharePassword);
      if (!isValid) {
        return NextResponse.json(
          {
            error: "รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง",
            requiresPassword: true,
            itemSummary: {
              name: item.name,
              type: item.type,
              ownerName: item.owner.name || item.owner.username,
            },
          },
          { status: 401 }
        );
      }
    }

    // ถ้าเป็นโฟลเดอร์ ดึงรายการไฟล์ข้างในมาแสดงด้วย
    let children: any[] = [];
    if (item.type === "FOLDER") {
      const targetParentId = folderId || item.id;
      children = await prisma.driveItem.findMany({
        where: {
          parentId: targetParentId,
          isTrashed: false,
        },
        select: {
          id: true,
          name: true,
          type: true,
          mimeType: true,
          size: true,
          extension: true,
          description: true,
          color: true,
          createdAt: true,
          updatedAt: true,
          allowDownload: true,
        },
        orderBy: [{ type: "desc" }, { name: "asc" }],
      });
    }

    return NextResponse.json({
      success: true,
      item: {
        id: item.id,
        name: item.name,
        type: item.type,
        mimeType: item.mimeType,
        size: item.size,
        extension: item.extension,
        description: item.description,
        allowDownload: item.allowDownload,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        owner: item.owner,
      },
      children,
    });
  } catch (error: any) {
    console.error("GET /api/drive/public/[token] error:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการโหลดข้อมูลลิงก์แชร์" },
      { status: 500 }
    );
  }
}
