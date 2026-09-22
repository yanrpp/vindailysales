import * as fs from 'fs';
import * as xlsx from 'xlsx';
import { fixThaiEncoding } from '../lib/excel-validator';
import { prisma } from '../lib/prisma';

export function getCategoryAndSupplierMaps() {
  const codeToCategory = new Map<string, string>();
  const codeToSupplier = new Map<string, string>();

  // 1. จาก 1.คงเหลือ.xls
  if (fs.existsSync('public/filestest/1.คงเหลือ.xls')) {
    const buf = fs.readFileSync('public/filestest/1.คงเหลือ.xls');
    const wb = xlsx.read(buf, { type: 'buffer', codepage: 874 });
    const ws = wb.Sheets['กู้คืน_Sheet1'];
    const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });

    let currentCat = '';
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      const col0 = row[0] !== undefined && row[0] !== null ? fixThaiEncoding(String(row[0])).trim() : '';
      const col1 = row[1] !== undefined && row[1] !== null ? fixThaiEncoding(String(row[1])).trim() : '';
      const col2 = row[2] !== undefined && row[2] !== null ? fixThaiEncoding(String(row[2])).trim() : '';

      if (row.length === 1 || (!col1 && !col2 && col0)) {
        if (!col0.startsWith('รวม') && !col0.includes('Page') && !col0.includes('รายงาน') && !col0.includes('Store:')) {
          currentCat = col0;
        }
        continue;
      }

      if (col1 && col1 !== 'รหัสสินค้า' && col1 !== 'Stock code' && !col1.startsWith('รวม') && !col0.startsWith('รวม')) {
        if (currentCat) {
          codeToCategory.set(col1, currentCat);
        }
      }
    }
  }

  // 2. จาก 4.ปริมาณการใช้.xls (Sheet สั่ง, เหลือ, ปริมาณการใช้)
  if (fs.existsSync('public/filestest/4.ปริมาณการใช้.xls')) {
    const buf = fs.readFileSync('public/filestest/4.ปริมาณการใช้.xls');
    const wb = xlsx.read(buf, { type: 'buffer', codepage: 874 });

    for (const s of ['สั่ง', 'เหลือ', 'ปริมาณการใช้']) {
      if (!wb.Sheets[s]) continue;
      const ws = wb.Sheets[s];
      const rows: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length < 3) continue;
        const code = fixThaiEncoding(row[1])?.trim();
        if (!code || code === 'รหัสสินค้า' || code === 'Stock code' || code.startsWith('รวม')) continue;

        let cat: string | null = null;
        let sup: string | null = null;

        if (s === 'สั่ง') {
          cat = fixThaiEncoding(row[14])?.trim() || null;
          sup = fixThaiEncoding(row[15])?.trim() || null;
        } else if (s === 'เหลือ') {
          cat = fixThaiEncoding(row[15])?.trim() || null;
          sup = fixThaiEncoding(row[16])?.trim() || null;
        } else if (s === 'ปริมาณการใช้') {
          cat = fixThaiEncoding(row[7])?.trim() || null;
          sup = fixThaiEncoding(row[8])?.trim() || null;
        }

        if (cat) codeToCategory.set(code, cat);
        if (sup) codeToSupplier.set(code, sup);
      }
    }
  }

  return { codeToCategory, codeToSupplier };
}

export function inferCategoryByCode(code: string, itemName?: string): string {
  const c = code.trim();
  const name = itemName ? itemName.toLowerCase() : '';

  if (c.startsWith('XA')) {
    if (name.includes('glove') || name.includes('ถุงมือ')) return 'เวชภัณฑ์ 1. (ถุงมือ)';
    if (name.includes('syringe') || name.includes('เข็ม')) return 'เวชภัณฑ์ 1. (กระบอกฉีดยา/เข็ม)';
    if (name.includes('tube') || name.includes('สาย')) return 'เวชภัณฑ์ 1. (สายยาง/ท่อ)';
    return 'เวชภัณฑ์ 1.';
  }
  if (/^[0-9]{4}/.test(c) || /^[A-Z]{2}[0-9]{2}/.test(c)) {
    if (name.includes('syrup') || name.includes('drop') || name.includes('elixir') || name.includes('suspension')) return 'ยาน้ำ';
    if (name.includes('tablet') || name.includes('cap') || name.includes('เม็ด')) return 'ยาเม็ด';
    if (name.includes('inj') || name.includes('iv') || name.includes('ฉีด')) return 'ยาฉีด';
    if (name.includes('cream') || name.includes('gel') || name.includes('ointment')) return 'ยาครีม/ภายนอก';
    return 'ยา';
  }
  if (c.startsWith('1-') || c.startsWith('2-')) return 'วัสดุเครื่องเขียน';
  if (c.startsWith('9-') || c.startsWith('SET-')) return 'เครื่องใช้สำหรับผู้ป่วย';
  if (c.startsWith('3-')) return 'วัสดุสิ้นเปลืองทั่วไป';
  if (c.startsWith('10-')) return 'พัสดุ';
  if (c.startsWith('AS-')) return 'เครื่องมือและอุปกรณ์การแพทย์';
  if (c.startsWith('OT-') || c.startsWith('IS-')) return 'เวชภัณฑ์ 1.';
  
  return 'เวชภัณฑ์/ยา';
}

async function runDatabaseUpdate() {
  console.log('🔄 กำลังวิเคราะห์และจับคู่ข้อมูลหมวดหมู่และชื่อบริษัท...');
  const { codeToCategory, codeToSupplier } = getCategoryAndSupplierMaps();

  const usages = await prisma.inventoryUsage.findMany();
  console.log(`📋 พบข้อมูลในตาราง inventory_usages ทั้งหมด: ${usages.length} รายการ`);

  const updates = usages.map((u) => {
    const code = u.itemCode.trim();

    const isCompanyInCat = u.category && (
      u.category.includes('บริษัท') ||
      u.category.includes('หจก') ||
      u.category.includes('บจก') ||
      u.category.includes('จำกัด') ||
      u.category.includes('มหาชน') ||
      u.category.includes('ห้างหุ้นส่วน') ||
      /^[A-Z0-9]{2,}\s{2,}/.test(u.category.trim())
    );

    let newSupplier = u.supplier;
    if (!newSupplier || newSupplier === '-' || isCompanyInCat) {
      if (isCompanyInCat) newSupplier = u.category;
      else if (codeToSupplier.has(code)) newSupplier = codeToSupplier.get(code)!;
    }

    let newCategory = codeToCategory.get(code);
    if (!newCategory || newCategory === u.category) {
      newCategory = codeToCategory.get(code) || inferCategoryByCode(code, u.itemName || '');
    }

    return prisma.inventoryUsage.update({
      where: { id: u.id },
      data: {
        category: newCategory,
        supplier: newSupplier || '-',
      },
    });
  });

  // Run in chunks of 50
  const CHUNK_SIZE = 50;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk);
    console.log(`  ➔ อัปเดตแล้ว ${Math.min(i + CHUNK_SIZE, updates.length)} / ${updates.length} รายการ...`);
  }

  console.log('✅ ปรับปรุงข้อมูล inventory_usages ในฐานข้อมูลเรียบร้อยสมบูรณ์!');
  await prisma.$disconnect();
}

runDatabaseUpdate().catch(console.error);
