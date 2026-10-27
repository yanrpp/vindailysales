import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

async function main() {
  try {
    const user = await prisma.user.findUnique({
      where: { username: "yan" },
    });
    if (!user) {
      console.log("❌ User yan not found");
      return;
    }

    const inputPwd = "14641";
    const isMatch = await bcrypt.compare(inputPwd, user.passwordHash);
    console.log("Is 14641 the existing password?:", isMatch);

    // อัปเดตรหัสผ่านใหม่ของ user yan ให้เป็น 14641 อย่างแน่นอน
    const newHash = await bcrypt.hash(inputPwd, 10);
    await prisma.user.update({
      where: { username: "yan" },
      data: { passwordHash: newHash },
    });

    console.log("✅ Updated password for user 'yan' to: 14641 successfully!");
  } catch (err: any) {
    console.error("❌ Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
