import { prisma } from "../lib/prisma";

async function main() {
  try {
    const updated = await prisma.importBatch.updateMany({
      where: { period: null },
      data: { period: "2026-10" },
    });
    await prisma.inventoryBalance.updateMany({
      where: { period: null },
      data: { period: "2026-10" },
    });
    await prisma.inventoryDispense.updateMany({
      where: { period: null },
      data: { period: "2026-10" },
    });
    await prisma.inventorySale.updateMany({
      where: { period: null },
      data: { period: "2026-10" },
    });
    await prisma.inventoryUsage.updateMany({
      where: { period: null },
      data: { period: "2026-10" },
    });
    console.log("✅ Backfill completed! Updated batches:", updated.count);

    const batches = await prisma.importBatch.findMany();
    console.log("Current Batches:", JSON.stringify(batches, null, 2));
  } catch (err: any) {
    console.error("❌ Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
