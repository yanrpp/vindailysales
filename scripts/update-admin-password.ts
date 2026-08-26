/**
 * Script สำหรับเปลี่ยนรหัสผ่าน admin
 * รันด้วย: npx tsx scripts/update-admin-password.ts <new_password>
 * หรือ: npm run update-admin-password <new_password>
 */

import { config } from "dotenv";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
config({ path: envPath });

import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/auth-utils";

async function updateAdminPassword() {
  const newPassword = process.argv[2] || process.env.ADMIN_PASSWORD;

  if (!newPassword) {
    console.error("❌ Error: กรุณาระบุรหัสผ่านใหม่");
    console.log("การใช้งาน: npx tsx scripts/update-admin-password.ts <new_password>");
    console.log("ตัวอย่าง: npx tsx scripts/update-admin-password.ts Admin@123456");
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error("❌ Error: รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
    process.exit(1);
  }

  const adminUsername = process.env.ADMIN_USERNAME || "admin";

  try {
    if (!process.env.DATABASE_URL) {
      console.error("❌ Error: Missing DATABASE_URL environment variable!");
      process.exit(1);
    }

    const adminUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: adminUsername },
          { role: "admin" },
        ],
      },
    });

    if (!adminUser) {
      console.error(`❌ Error: ไม่พบผู้ใช้ admin หรือ role admin ในระบบ`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: adminUser.id },
      data: { passwordHash },
    });

    console.log("✅ เปลี่ยนรหัสผ่าน admin สำเร็จ!");
    console.log(`   Username: ${adminUser.username}`);
    console.log(`   Role: ${adminUser.role}`);
    console.log(`   รหัสผ่านใหม่: ${newPassword}`);
  } catch (error: any) {
    console.error("❌ Error updating password:", error.message);
    process.exit(1);
  }
}

updateAdminPassword();
