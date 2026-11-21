import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/auth-utils";
import fs from "fs/promises";
import path from "path";

export const LOCAL_STORAGE_DIR = path.join(process.cwd(), "uploads", "drive");

// ตรวจสอบและสร้างโฟลเดอร์สำรองบน Local Disk
export async function ensureLocalStorageDir() {
  try {
    await fs.mkdir(LOCAL_STORAGE_DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

// บันทึกไฟล์สำรองลง Local Disk (ถ้าสภาพแวดล้อมอนุญาต)
export async function saveBackupToLocalDisk(itemId: string, filename: string, buffer: Buffer): Promise<string | null> {
  try {
    const canWrite = await ensureLocalStorageDir();
    if (!canWrite) return null;
    const safeName = filename.replace(/[^a-zA-Z0-9._-\u0E00-\u0E7F]/g, "_");
    const filePath = path.join(LOCAL_STORAGE_DIR, `${itemId}_${safeName}`);
    await fs.writeFile(filePath, buffer);
    return filePath;
  } catch {
    // บน Vercel Serverless อาจจะเขียนลงโฟลเดอร์โปรเจกต์ไม่ได้ ให้ข้ามไปใช้ DB เป็นหลัก
    return null;
  }
}

// ลบไฟล์สำรองจาก Local Disk
export async function deleteLocalDiskBackup(localPath?: string | null) {
  if (!localPath) return;
  try {
    await fs.unlink(localPath);
  } catch {
    // Ignore if file doesn't exist
  }
}

// อ่านข้อมูลไฟล์ (ดึงจาก PostgreSQL Blob ก่อน และหากไม่มีให้ดึงจาก Local Disk สำรอง)
export async function readDriveFileBuffer(itemId: string, localPath?: string | null): Promise<Buffer | null> {
  const blobRecord = await prisma.driveFileBlob.findUnique({
    where: { itemId },
  });

  if (blobRecord && blobRecord.data) {
    return Buffer.from(blobRecord.data);
  }

  if (localPath) {
    try {
      return await fs.readFile(localPath);
    } catch {
      return null;
    }
  }

  return null;
}

// ตรวจสอบสิทธิ์การเข้าถึง DriveItem (เจ้าของ, แอดมิน, หรือผู้ที่ได้รับการแชร์ รวมถึงการแชร์ผ่านโฟลเดอร์แม่)
export async function checkItemPermission(
  itemId: string,
  userId?: string | null,
  userRole?: string | null,
  shareToken?: string | null,
  sharePassword?: string | null
): Promise<{
  allowed: boolean;
  permission: "OWNER" | "EDIT" | "VIEW" | "PUBLIC" | "NONE";
  reason?: string;
  requiresPassword?: boolean;
  item?: any;
}> {
  const item = await prisma.driveItem.findUnique({
    where: { id: itemId },
    include: {
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
    },
  });

  if (!item) {
    return { allowed: false, permission: "NONE", reason: "ไม่พบไฟล์หรือโฟลเดอร์นี้" };
  }

  // 1. เจ้าของหรือ Admin
  if (userId && (item.ownerId === userId || userRole === "admin")) {
    return { allowed: true, permission: "OWNER", item };
  }

  // 2. ตรวจสอบการแชร์โดยตรงให้ User นี้
  if (userId) {
    const directShare = item.shares.find((s) => s.sharedWithUserId === userId);
    if (directShare) {
      return {
        allowed: true,
        permission: directShare.permission === "EDIT" ? "EDIT" : "VIEW",
        item,
      };
    }

    // ตรวจสอบสิทธิ์ที่สืบทอดมาจากโฟลเดอร์แม่ (Ancestor folder sharing)
    let currentParentId = item.parentId;
    let depth = 0;
    while (currentParentId && depth < 15) {
      const parentFolder = await prisma.driveItem.findUnique({
        where: { id: currentParentId },
        include: { shares: true },
      });
      if (!parentFolder) break;
      if (parentFolder.ownerId === userId) {
        return { allowed: true, permission: "OWNER", item };
      }
      const parentShare = parentFolder.shares.find((s) => s.sharedWithUserId === userId);
      if (parentShare) {
        return {
          allowed: true,
          permission: parentShare.permission === "EDIT" ? "EDIT" : "VIEW",
          item,
        };
      }
      currentParentId = parentFolder.parentId;
      depth++;
    }
  }

  // 3. ตรวจสอบ Public Share Link / Token
  if (item.isPublic && item.shareToken && (!shareToken || item.shareToken === shareToken)) {
    if (item.shareExpiresAt && new Date(item.shareExpiresAt) < new Date()) {
      return { allowed: false, permission: "NONE", reason: "ลิงก์แชร์นี้หมดอายุแล้ว" };
    }

    if (item.sharePassword) {
      if (!sharePassword) {
        return {
          allowed: false,
          permission: "NONE",
          requiresPassword: true,
          reason: "ลิงก์นี้มีการตั้งรหัสผ่าน กรุณาระบุรหัสผ่าน",
        };
      }
      const validPass = await verifyPassword(sharePassword, item.sharePassword);
      if (!validPass) {
        return {
          allowed: false,
          permission: "NONE",
          requiresPassword: true,
          reason: "รหัสผ่านสำหรับเข้าถึงไฟล์ไม่ถูกต้อง",
        };
      }
    }

    return { allowed: true, permission: "PUBLIC", item };
  }

  return { allowed: false, permission: "NONE", reason: "คุณไม่มีสิทธิ์เข้าถึงไฟล์หรือโฟลเดอร์นี้" };
}

// ดึงเส้นทาง Breadcrumbs ย้อนกลับไปหาโฟลเดอร์ต้นทาง
export async function getFolderBreadcrumbs(folderId?: string | null) {
  const breadcrumbs: Array<{ id: string; name: string }> = [];
  let currentId = folderId;
  let depth = 0;

  while (currentId && depth < 20) {
    const folder = await prisma.driveItem.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, parentId: true },
    });
    if (!folder) break;
    breadcrumbs.unshift({ id: folder.id, name: folder.name });
    currentId = folder.parentId;
    depth++;
  }

  return breadcrumbs;
}
