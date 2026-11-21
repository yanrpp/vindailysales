import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getTokenFromRequest } from "@/lib/auth/auth-utils";
import { prisma } from "@/lib/prisma";
import { checkItemPermission, deleteLocalDiskBackup } from "@/lib/drive-utils";

// GET /api/drive/[id] - ดูรายละเอียดไฟล์หรือโฟลเดอร์
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const token = getTokenFromRequest(req.headers);
    const user = token ? verifyToken(token) : null;

    const { searchParams } = new URL(req.url);
    const shareToken = searchParams.get("token");
    const sharePassword = searchParams.get("password");

    const access = await checkItemPermission(
      id,
      user?.userId,
      user?.role,
      shareToken,
      sharePassword
    );

    if (!access.allowed) {
      return NextResponse.json(
        {
          error: access.reason || "ไม่มีสิทธิ์เข้าถึง",
          requiresPassword: access.requiresPassword || false,
        },
        { status: access.requiresPassword ? 401 : 403 }
      );
    }

    return NextResponse.json({
      success: true,
      item: access.item,
      permission: access.permission,
    });
  } catch (error: any) {
    console.error("GET /api/drive/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "เกิดข้อผิดพลาด" },
      { status: 500 }
    );
  }
}

// PATCH /api/drive/[id] - แก้ไขชื่อ, คำอธิบาย, ย้ายโฟลเดอร์, ติดดาว, ย้ายลงถังขยะ, กู้คืน, เปลี่ยนสี
export async function PATCH(
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
        { error: "คุณไม่มีสิทธิ์แก้ไขรายการนี้" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const updateData: any = {};

    if (typeof body.name === "string" && body.name.trim()) {
      updateData.name = body.name.trim();
    }
    if (body.description !== undefined) {
      updateData.description = body.description;
    }
    if (body.color !== undefined) {
      updateData.color = body.color;
    }
    if (typeof body.isStarred === "boolean") {
      updateData.isStarred = body.isStarred;
    }
    if (typeof body.isTrashed === "boolean") {
      updateData.isTrashed = body.isTrashed;
      updateData.trashedAt = body.isTrashed ? new Date() : null;
    }
    if (body.parentId !== undefined) {
      // ป้องกันการย้ายโฟลเดอร์เข้าตัวเอง
      if (body.parentId === id) {
        return NextResponse.json(
          { error: "ไม่สามารถย้ายโฟลเดอร์เข้าไปในตัวเองได้" },
          { status: 400 }
        );
      }
      updateData.parentId = body.parentId || null;
    }

    const updated = await prisma.driveItem.update({
      where: { id },
      data: updateData,
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
    });
  } catch (error: any) {
    console.error("PATCH /api/drive/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "ไม่สามารถอัปเดตข้อมูลได้" },
      { status: 500 }
    );
  }
}

// DELETE /api/drive/[id] - ลบถาวร (Permanent Delete)
export async function DELETE(
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
    if (!access.allowed || access.permission !== "OWNER") {
      return NextResponse.json(
        { error: "เฉพาะเจ้าของไฟล์หรือผู้ดูแลระบบเท่านั้นที่สามารถลบถาวรได้" },
        { status: 403 }
      );
    }

    if (access.item?.localPath) {
      await deleteLocalDiskBackup(access.item.localPath);
    }

    await prisma.driveItem.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "ลบรายการถาวรเรียบร้อยแล้ว",
    });
  } catch (error: any) {
    console.error("DELETE /api/drive/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "ไม่สามารถลบรายการได้" },
      { status: 500 }
    );
  }
}
