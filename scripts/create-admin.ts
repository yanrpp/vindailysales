/**
 * Script สำหรับสร้าง admin user เริ่มต้น
 * รันด้วย: npx tsx scripts/create-admin.ts
 * 
 * ใช้ Prisma Database (Vercel Postgres / PostgreSQL)
 * ต้องตั้งค่า DATABASE_URL ใน .env.local
 */

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
    if (!process.env.DATABASE_URL) {
      console.error("❌ Error: Missing DATABASE_URL environment variable!");
      console.error("   Please set DATABASE_URL in .env.local");
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

    // สร้าง admin user (admin user จะได้รับการอนุมัติทันที)
    const adminUser = await createUser({
      username,
      passwordHash,
      role: "admin",
      isActive: true,
      isApproved: true,
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
