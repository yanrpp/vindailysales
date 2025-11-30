/**
 * Script สำหรับสร้าง admin user เริ่มต้น
 * รันด้วย: npx tsx scripts/create-admin.ts
 * 
 * หมายเหตุ: ตอนนี้ใช้ Supabase database แล้ว
 * ต้องตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env.local
 */

// โหลด environment variables
import { config } from "dotenv";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
config({ path: envPath });

import { createUser, findUserByUsername } from "../lib/auth/user-storage";
import { hashPassword } from "../lib/auth/auth-utils";

async function createAdminUser() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";

  try {
    // ตรวจสอบ environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("❌ Error: Missing Supabase environment variables!");
      console.error("   Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
      process.exit(1);
    }

    // ตรวจสอบว่ามี admin อยู่แล้วหรือไม่
    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      console.log(`❌ User "${username}" already exists!`);
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // สร้าง admin user
    const adminUser = await createUser({
      username,
      passwordHash,
      role: "admin",
      isActive: true,
    });

    console.log("✅ Admin user created successfully!");
    console.log(`   Username: ${adminUser.username}`);
    console.log(`   Role: ${adminUser.role}`);
    console.log(`   Password: ${password}`);
    console.log("\n⚠️  Please change the default password after first login!");
  } catch (error: any) {
    console.error("❌ Error creating admin user:", error.message);
    process.exit(1);
  }
}

createAdminUser();

