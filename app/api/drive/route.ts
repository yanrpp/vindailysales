import { NextResponse } from "next/server";
import { requireAuth, AuthRequest } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";
import { getFolderBreadcrumbs, saveBackupToLocalDisk } from "@/lib/drive-utils";
import crypto from "crypto";

// GET /api/drive - ดึงรายการไฟล์และโฟลเดอร์ตามหมวดหมู่ (My Drive, Shared with me, Shared by me, Starred, Trash, Recent)
export const GET = requireAuth(async (req: AuthRequest) => {
  try {
    const userId = req.user!.userId;
    const { searchParams } = new URL(req.url);

    const section = searchParams.get("section") || "my-drive"; // "my-drive" | "shared-with-me" | "shared-by-me" | "starred" | "trash" | "recent"
    const parentId = searchParams.get("parentId") || null;
    const search = searchParams.get("search")?.trim() || "";
    const fileType = searchParams.get("fileType") || "ALL"; // "ALL" | "FOLDER" | "IMAGE" | "PDF" | "EXCEL" | "DOC" | "OTHER"
    const sortBy = searchParams.get("sortBy") || "updatedAt"; // "name" | "updatedAt" | "size"
    const sortOrder = (searchParams.get("sortOrder") || "desc") as "asc" | "desc";

    // คำนวณ Storage Quota ของผู้ใช้
    const storageAgg = await prisma.driveItem.aggregate({
      where: {
        ownerId: userId,
        type: "FILE",
      },
      _sum: {
        size: true,
      },
      _count: {
        id: true,
      },
    });

    const usedBytes = storageAgg._sum.size || 0;
    const totalFilesCount = storageAgg._count.id || 0;
    const quotaBytes = 500 * 1024 * 1024; // 500 MB default quota per user

    // สร้างเงื่อนไขการกรองประเภทไฟล์
    const buildMimeFilter = () => {
      if (fileType === "ALL") return {};
      if (fileType === "FOLDER") return { type: "FOLDER" };
      if (fileType === "IMAGE") return { type: "FILE", mimeType: { startsWith: "image/" } };
      if (fileType === "PDF") return { type: "FILE", mimeType: "application/pdf" };
      if (fileType === "EXCEL") {
        return {
          type: "FILE",
          OR: [
            { extension: { in: ["xls", "xlsx", "csv"] } },
            { mimeType: { contains: "spreadsheet" } },
            { mimeType: { contains: "excel" } },
            { mimeType: "text/csv" },
          ],
        };
      }
      if (fileType === "DOC") {
        return {
          type: "FILE",
          OR: [
            { extension: { in: ["doc", "docx", "txt", "md", "json"] } },
            { mimeType: { startsWith: "text/" } },
            { mimeType: { contains: "word" } },
          ],
        };
      }
      return {};
    };

    const includeRelations = {
      owner: {
        select: { id: true, username: true, name: true },
      },
      shares: {
        include: {
          sharedWithUser: {
            select: { id: true, username: true, name: true },
          },
          sharedByUser: {
            select: { id: true, username: true, name: true },
          },
        },
      },
      _count: {
        select: { children: true, shares: true },
      },
    };

    let items: any[] = [];

    if (section === "shared-with-me") {
      // ถ้าเปิดเข้าไปในโฟลเดอร์ที่แชร์มา
      if (parentId) {
        items = await prisma.driveItem.findMany({
          where: {
            parentId,
            isTrashed: false,
            ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
            ...buildMimeFilter(),
          },
          include: includeRelations,
          orderBy: [{ type: "desc" }, { [sortBy]: sortOrder }],
        });
      } else {
        // ดึงรายการที่ผู้อื่นแชร์มาให้เรา
        const sharedRecords = await prisma.driveShare.findMany({
          where: {
            sharedWithUserId: userId,
            item: {
              isTrashed: false,
              ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
              ...buildMimeFilter(),
            },
          },
          include: {
            item: {
              include: includeRelations,
            },
            sharedByUser: {
              select: { id: true, username: true, name: true },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        items = sharedRecords.map((sr) => ({
          ...sr.item,
          myPermission: sr.permission,
          sharedNote: sr.note,
          sharedAt: sr.createdAt,
          sharedBy: sr.sharedByUser,
        }));
      }
    } else if (section === "shared-by-me") {
      // รายการที่เราแชร์ให้คนอื่น หรือเปิดลิงก์สาธารณะ
      items = await prisma.driveItem.findMany({
        where: {
          ownerId: userId,
          isTrashed: false,
          OR: [{ isPublic: true }, { shares: { some: {} } }],
          ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
          ...buildMimeFilter(),
        },
        include: includeRelations,
        orderBy: [{ updatedAt: "desc" }],
      });
    } else if (section === "starred") {
      items = await prisma.driveItem.findMany({
        where: {
          isTrashed: false,
          isStarred: true,
          OR: [
            { ownerId: userId },
            { shares: { some: { sharedWithUserId: userId } } },
          ],
          ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
          ...buildMimeFilter(),
        },
        include: includeRelations,
        orderBy: [{ type: "desc" }, { [sortBy]: sortOrder }],
      });
    } else if (section === "trash") {
      items = await prisma.driveItem.findMany({
        where: {
          ownerId: userId,
          isTrashed: true,
          ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
          ...buildMimeFilter(),
        },
        include: includeRelations,
        orderBy: [{ trashedAt: "desc" }],
      });
    } else if (section === "recent") {
      items = await prisma.driveItem.findMany({
        where: {
          isTrashed: false,
          type: "FILE",
          OR: [
            { ownerId: userId },
            { shares: { some: { sharedWithUserId: userId } } },
          ],
          ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
          ...buildMimeFilter(),
        },
        include: includeRelations,
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
    } else {
      // "my-drive"
      const whereClause: any = {
        ownerId: userId,
        isTrashed: false,
        ...buildMimeFilter(),
      };

      if (search) {
        whereClause.name = { contains: search, mode: "insensitive" };
      } else {
        whereClause.parentId = parentId;
      }

      items = await prisma.driveItem.findMany({
        where: whereClause,
        include: includeRelations,
        orderBy: [{ type: "desc" }, { [sortBy]: sortOrder }],
      });
    }

    const breadcrumbs = parentId ? await getFolderBreadcrumbs(parentId) : [];

    // ดึงรายชื่อโฟลเดอร์ทั้งหมดของผู้ใช้ (สำหรับใช้ใน Modal ย้ายโฟลเดอร์)
    const allFolders = await prisma.driveItem.findMany({
      where: {
        ownerId: userId,
        type: "FOLDER",
        isTrashed: false,
      },
      select: {
        id: true,
        name: true,
        parentId: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      items,
      breadcrumbs,
      allFolders,
      storage: {
        usedBytes,
        quotaBytes,
        totalFilesCount,
      },
    });
  } catch (error: any) {
    console.error("GET /api/drive error:", error);
    return NextResponse.json(
      { error: error.message || "เกิดข้อผิดพลาดในการโหลดข้อมูลคลังไฟล์" },
      { status: 500 }
    );
  }
});

// POST /api/drive - สร้างโฟลเดอร์ใหม่ หรือ อัปโหลดไฟล์ (รองรับหลายไฟล์พร้อมกัน)
export const POST = requireAuth(async (req: AuthRequest) => {
  try {
    const userId = req.user!.userId;
    const contentType = req.headers.get("content-type") || "";

    // กรณีที่ 1: สร้างโฟลเดอร์ใหม่ (JSON)
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { name, parentId, description, color } = body;

      if (!name || !name.trim()) {
        return NextResponse.json(
          { error: "กรุณาระบุชื่อโฟลเดอร์" },
          { status: 400 }
        );
      }

      const folder = await prisma.driveItem.create({
        data: {
          name: name.trim(),
          type: "FOLDER",
          parentId: parentId || null,
          ownerId: userId,
          description: description || null,
          color: color || "#3b82f6",
        },
        include: {
          owner: { select: { id: true, username: true, name: true } },
          shares: true,
        },
      });

      return NextResponse.json({
        success: true,
        item: folder,
        message: "สร้างโฟลเดอร์สำเร็จ",
      });
    }

    // กรณีที่ 2: อัปโหลดไฟล์ (Multipart FormData)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const parentIdRaw = formData.get("parentId") as string | null;
      const parentId = parentIdRaw && parentIdRaw !== "null" && parentIdRaw !== "" ? parentIdRaw : null;
      const description = (formData.get("description") as string | null) || null;
      const shareWithUserId = (formData.get("shareWithUserId") as string | null) || null;
      const shareNote = (formData.get("shareNote") as string | null) || null;
      const files = formData.getAll("files") as File[];

      if (!files || files.length === 0) {
        return NextResponse.json(
          { error: "กรุณาเลือกไฟล์ที่ต้องการอัปโหลด" },
          { status: 400 }
        );
      }

      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB per file
      const createdItems = [];

      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { error: `ไฟล์ "${file.name}" มีขนาดเกิน 50 MB` },
            { status: 400 }
          );
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const ext = file.name.includes(".")
          ? file.name.split(".").pop()?.toLowerCase() || ""
          : "";

        const newItemId = crypto.randomUUID();
        // บันทึกสำรองลง Local Disk (ถ้าทำได้)
        const localPath = await saveBackupToLocalDisk(newItemId, file.name, buffer);

        // บันทึกลง PostgreSQL (ทั้ง Metadata และ File Blob)
        const item = await prisma.driveItem.create({
          data: {
            id: newItemId,
            name: file.name,
            type: "FILE",
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            extension: ext,
            description,
            parentId,
            ownerId: userId,
            storageType: "DB",
            localPath,
            blob: {
              create: {
                data: buffer,
              },
            },
            ...(shareWithUserId
              ? {
                  shares: {
                    create: {
                      sharedWithUserId: shareWithUserId,
                      sharedByUserId: userId,
                      permission: "VIEW",
                      note: shareNote,
                    },
                  },
                }
              : {}),
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

        createdItems.push(item);
      }

      return NextResponse.json({
        success: true,
        items: createdItems,
        message: `อัปโหลดสำเร็จ ${createdItems.length} ไฟล์`,
      });
    }

    return NextResponse.json(
      { error: "รูปแบบคำขอไม่ถูกต้อง" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("POST /api/drive error:", error);
    return NextResponse.json(
      { error: error.message || "เกิดข้อผิดพลาดในการบันทึกไฟล์" },
      { status: 500 }
    );
  }
});

// DELETE /api/drive?action=empty-trash - ล้างถังขยะทั้งหมดของผู้ใช้
export const DELETE = requireAuth(async (req: AuthRequest) => {
  try {
    const userId = req.user!.userId;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "empty-trash") {
      const deleted = await prisma.driveItem.deleteMany({
        where: {
          ownerId: userId,
          isTrashed: true,
        },
      });

      return NextResponse.json({
        success: true,
        deletedCount: deleted.count,
        message: "ล้างถังขยะเรียบร้อยแล้ว",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("DELETE /api/drive error:", error);
    return NextResponse.json(
      { error: error.message || "ไม่สามารถล้างถังขยะได้" },
      { status: 500 }
    );
  }
});
