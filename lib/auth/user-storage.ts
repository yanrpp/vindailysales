import { prisma } from "@/lib/prisma";

export interface User {
  id: string;
  username: string;
  name?: string;
  passwordHash: string;
  role: "admin" | "user";
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  isApproved: boolean;
  lastLogin?: string;
}

// หา user โดย username
export async function findUserByUsername(username: string): Promise<User | undefined> {
  try {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return undefined;
    }

    return mapPrismaUserToUser(user);
  } catch (error) {
    console.error("Error finding user by username:", error);
    return undefined;
  }
}

// หา user โดย ID
export async function findUserById(id: string): Promise<User | undefined> {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return undefined;
    }

    return mapPrismaUserToUser(user);
  } catch (error) {
    console.error("Error finding user by id:", error);
    return undefined;
  }
}

// เพิ่ม user ใหม่
export async function createUser(
  userData: Omit<User, "id" | "createdAt" | "updatedAt">
): Promise<User> {
  try {
    // ตรวจสอบ username ซ้ำ
    const existingUser = await findUserByUsername(userData.username);
    if (existingUser) {
      throw new Error("Username already exists");
    }

    const created = await prisma.user.create({
      data: {
        username: userData.username,
        name: userData.name || null,
        passwordHash: userData.passwordHash,
        role: userData.role,
        isActive: userData.isActive,
        isApproved: userData.isApproved !== undefined ? userData.isApproved : false,
      },
    });

    return mapPrismaUserToUser(created);
  } catch (error: any) {
    if (error.message?.includes("already exists")) {
      throw error;
    }
    console.error("Error creating user:", error);
    throw new Error(error.message || "Failed to create user");
  }
}

// อัปเดต user
export async function updateUser(
  id: string,
  updates: Partial<Omit<User, "id" | "createdAt">>
): Promise<User> {
  try {
    // ตรวจสอบ username ซ้ำ (ถ้ามีการเปลี่ยน)
    if (updates.username) {
      const existingUser = await findUserByUsername(updates.username);
      if (existingUser && existingUser.id !== id) {
        throw new Error("Username already exists");
      }
    }

    const updateData: any = {};
    if (updates.username !== undefined) updateData.username = updates.username;
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.passwordHash !== undefined) updateData.passwordHash = updates.passwordHash;
    if (updates.role !== undefined) updateData.role = updates.role;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.isApproved !== undefined) updateData.isApproved = updates.isApproved;
    if (updates.lastLogin !== undefined) {
      updateData.lastLogin = updates.lastLogin ? new Date(updates.lastLogin) : null;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return mapPrismaUserToUser(updated);
  } catch (error: any) {
    if (
      error.message?.includes("already exists") ||
      error.message?.includes("Record to update not found")
    ) {
      throw error;
    }
    console.error("Error updating user:", error);
    throw new Error(error.message || "Failed to update user");
  }
}

// ลบ user
export async function deleteUser(id: string): Promise<void> {
  try {
    await prisma.user.delete({
      where: { id },
    });
  } catch (error: any) {
    console.error("Error deleting user:", error);
    throw new Error(error.message || "Failed to delete user");
  }
}

// ดึงรายการ users ทั้งหมด
export async function getAllUsers(): Promise<User[]> {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });

    return users.map(mapPrismaUserToUser);
  } catch (error) {
    console.error("Error getting all users:", error);
    return [];
  }
}

// อัปเดต last login
export async function updateLastLogin(id: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id },
      data: { lastLogin: new Date() },
    });
  } catch (error) {
    console.error("Error updating last login:", error);
  }
}

// แปลงข้อมูลจาก Prisma model เป็น User interface
function mapPrismaUserToUser(data: any): User {
  return {
    id: data.id,
    username: data.username,
    name: data.name || undefined,
    passwordHash: data.passwordHash,
    role: (data.role as "admin" | "user") || "user",
    createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: data.updatedAt ? new Date(data.updatedAt).toISOString() : new Date().toISOString(),
    isActive: data.isActive !== undefined ? data.isActive : true,
    isApproved: data.isApproved !== undefined ? data.isApproved : false,
    lastLogin: data.lastLogin ? new Date(data.lastLogin).toISOString() : undefined,
  };
}
