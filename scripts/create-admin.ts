/**
 * Script สำหรับสร้าง admin user เริ่มต้น
 * รันด้วย: npx tsx scripts/create-admin.ts
 */

import { createUser, findUserByUsername } from "../lib/auth/user-storage";
import { hashPassword } from "../lib/auth/auth-utils";

async function createAdminUser() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";

  try {
    // ตรวจสอบว่ามี admin อยู่แล้วหรือไม่
    const existingUser = findUserByUsername(username);
    if (existingUser) {
      console.log(`❌ User "${username}" already exists!`);
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // สร้าง admin user
    const adminUser = createUser({
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

