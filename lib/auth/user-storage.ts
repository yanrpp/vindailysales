import { supabase } from "@/lib/supabase";

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
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (error || !data) {
      return undefined;
    }

    return mapSupabaseUserToUser(data);
  } catch (error) {
    console.error("Error finding user by username:", error);
    return undefined;
  }
}

// หา user โดย ID
export async function findUserById(id: string): Promise<User | undefined> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return undefined;
    }

    return mapSupabaseUserToUser(data);
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

    const { data, error } = await supabase
      .from("users")
      .insert({
        username: userData.username,
        name: userData.name || null,
        password_hash: userData.passwordHash,
        role: userData.role,
        is_active: userData.isActive,
        is_approved: userData.isApproved !== undefined ? userData.isApproved : false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating user:", error);
      throw new Error(error.message || "Failed to create user");
    }

    if (!data) {
      throw new Error("Failed to create user");
    }

    return mapSupabaseUserToUser(data);
  } catch (error: any) {
    if (error.message.includes("already exists")) {
      throw error;
    }
    console.error("Error creating user:", error);
    throw new Error("Failed to create user");
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
    if (updates.passwordHash !== undefined)
      updateData.password_hash = updates.passwordHash;
    if (updates.role !== undefined) updateData.role = updates.role;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    if (updates.isApproved !== undefined) updateData.is_approved = updates.isApproved;
    if (updates.lastLogin !== undefined) updateData.last_login = updates.lastLogin;

    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating user:", error);
      throw new Error(error.message || "Failed to update user");
    }

    if (!data) {
      throw new Error("User not found");
    }

    return mapSupabaseUserToUser(data);
  } catch (error: any) {
    if (
      error.message.includes("already exists") ||
      error.message.includes("not found")
    ) {
      throw error;
    }
    console.error("Error updating user:", error);
    throw new Error("Failed to update user");
  }
}

// ลบ user
export async function deleteUser(id: string): Promise<void> {
  try {
    const { error } = await supabase.from("users").delete().eq("id", id);

    if (error) {
      console.error("Error deleting user:", error);
      throw new Error(error.message || "Failed to delete user");
    }
  } catch (error: any) {
    console.error("Error deleting user:", error);
    throw new Error("Failed to delete user");
  }
}

// ดึงรายการ users ทั้งหมด
export async function getAllUsers(): Promise<User[]> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error getting all users:", error);
      return [];
    }

    return (data || []).map(mapSupabaseUserToUser);
  } catch (error) {
    console.error("Error getting all users:", error);
    return [];
  }
}

// อัปเดต last login
export async function updateLastLogin(id: string): Promise<void> {
  try {
    await updateUser(id, { lastLogin: new Date().toISOString() });
  } catch (error) {
    console.error("Error updating last login:", error);
  }
}

// แปลงข้อมูลจาก Supabase format เป็น User interface
function mapSupabaseUserToUser(data: any): User {
  return {
    id: data.id,
    username: data.username,
    name: data.name || undefined,
    passwordHash: data.password_hash,
    role: data.role || "user",
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    isActive: data.is_active !== undefined ? data.is_active : true,
    isApproved: data.is_approved !== undefined ? data.is_approved : false,
    lastLogin: data.last_login || undefined,
  };
}
