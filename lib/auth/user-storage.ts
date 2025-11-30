import { supabase } from "@/lib/supabase";

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: "admin" | "user";
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  lastLogin?: string;
}

// หา user โดย username
export async function findUserByUsername(username: string): Promise<User | null> {
  try {
    console.log("🔍 [findUserByUsername] Searching for username:", username);
    console.log("🔍 [findUserByUsername] Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "SET" : "NOT SET");
    
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("username", username)
      .single();

    if (error) {
      console.error("❌ [findUserByUsername] Supabase error:", error);
      console.error("❌ [findUserByUsername] Error code:", error.code);
      console.error("❌ [findUserByUsername] Error message:", error.message);
      // ถ้าเป็น error ที่ไม่ใช่ "not found" ให้ log
      if (error.code !== "PGRST116") {
        console.error("❌ [findUserByUsername] Error details:", JSON.stringify(error, null, 2));
      }
      return null;
    }

    if (!data) {
      console.log("⚠️ [findUserByUsername] No data returned for username:", username);
      return null;
    }

    console.log("✅ [findUserByUsername] User found:", {
      id: data.id,
      username: data.username,
      role: data.role,
      hasPasswordHash: !!data.password_hash,
    });

    return mapSupabaseProfileToUser(data);
  } catch (error) {
    console.error("❌ [findUserByUsername] Exception:", error);
    return null;
  }
}

// หา user โดย ID
export async function findUserById(id: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return null;
    }

    return mapSupabaseProfileToUser(data);
  } catch (error) {
    console.error("Error finding user by id:", error);
    return null;
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

    // สร้าง UUID สำหรับ id (ใช้ crypto.randomUUID() ใน Node.js)
    const { randomUUID } = await import("crypto");
    const userId = randomUUID();

    const { data, error } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        username: userData.username,
        password_hash: userData.passwordHash,
        role: userData.role,
        is_active: userData.isActive,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating user:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      throw new Error(error.message || "Failed to create user");
    }

    if (!data) {
      throw new Error("Failed to create user");
    }

    return mapSupabaseProfileToUser(data);
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
    if (updates.passwordHash !== undefined)
      updateData.password_hash = updates.passwordHash;
    if (updates.role !== undefined) updateData.role = updates.role;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    if (updates.lastLogin !== undefined) updateData.last_login = updates.lastLogin;

    const { data, error } = await supabase
      .from("profiles")
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

    return mapSupabaseProfileToUser(data);
  } catch (error: any) {
    if (error.message.includes("already exists") || error.message.includes("not found")) {
      throw error;
    }
    console.error("Error updating user:", error);
    throw new Error("Failed to update user");
  }
}

// ลบ user
export async function deleteUser(id: string): Promise<void> {
  try {
    const { error } = await supabase.from("profiles").delete().eq("id", id);

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
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error getting all users:", error);
      return [];
    }

    return (data || []).map(mapSupabaseProfileToUser);
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

// แปลงข้อมูลจาก Supabase profiles format เป็น User interface
function mapSupabaseProfileToUser(data: any): User {
  return {
    id: data.id,
    username: data.username,
    passwordHash: data.password_hash,
    role: data.role || "user",
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    isActive: data.is_active !== undefined ? data.is_active : true,
    lastLogin: data.last_login || undefined,
  };
}
