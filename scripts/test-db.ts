import { prisma } from "../lib/prisma";

async function main() {
  try {
    const count = await prisma.importBatch.count();
    console.log("✅ Connect Success! Current importBatch count in Postgres:", count);
  } catch (err: any) {
    console.error("❌ Connect Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
