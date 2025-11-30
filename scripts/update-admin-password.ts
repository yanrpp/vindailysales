/**
 * Script สำหรับอัปเดต password hash ของ admin user
 * รันด้วย: npx tsx scripts/update-admin-password.ts
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

import { supabase } from "../lib/supabase";
import { hashPassword } from "../lib/auth/auth-utils";

async function updateAdminPassword() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";

  try {
    console.log("🔄 Updating password for user:", username);

    // Hash password ใหม่
    const passwordHash = await hashPassword(password);
    console.log("✅ Password hashed successfully");
    console.log("   Hash preview:", passwordHash.substring(0, 30) + "...");

    // อัปเดต password hash ใน database
    const { data, error } = await supabase
      .from("profiles")
      .update({ password_hash: passwordHash })
      .eq("username", username)
      .select();

    if (error) {
      console.error("❌ Error updating password:", error);
      console.error("   Error details:", JSON.stringify(error, null, 2));
      return;
    }

    if (!data || data.length === 0) {
      console.error(`❌ User "${username}" not found in database!`);
      console.log("   Please create the user first using: npm run create-admin");
      return;
    }

    console.log("✅ Password updated successfully!");
    console.log(`   Username: ${data[0].username}`);
    console.log(`   Role: ${data[0].role}`);
    console.log(`   New password: ${password}`);
  } catch (error: any) {
    console.error("❌ Error updating admin password:", error.message);
    console.error("   Full error:", error);
  }
}

updateAdminPassword();

