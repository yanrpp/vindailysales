/**
 * Script สำหรับสร้าง admin user เริ่มต้น
 * รันด้วย: npx tsx scripts/create-admin.ts
 */

// โหลด environment variables จาก .env.local ก่อน import อื่นๆ
import { config } from "dotenv";
import { resolve } from "path";

// โหลด .env.local ก่อน
const envPath = resolve(process.cwd(), ".env.local");
config({ path: envPath });

// ตรวจสอบว่า environment variables ถูกโหลดหรือไม่
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Error: Missing environment variables!");
  console.error("   Please create .env.local file with:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url");
  console.error("   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key");
  process.exit(1);
}

import { createUser, findUserByUsername } from "../lib/auth/user-storage";
import { hashPassword } from "../lib/auth/auth-utils";

async function createAdminUser() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";

  try {
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
  }
}

createAdminUser();

