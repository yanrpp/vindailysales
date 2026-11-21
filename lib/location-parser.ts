import * as XLSX from "xlsx";
import { fixThaiEncoding } from "@/lib/excel-validator";

// ประเภทคลัง (คอลัม B itemtype)
export const ITEM_TYPES = [
  { id: 1, code: "MAINSTORE", name: "Mainstore" },
  { id: 2, code: "SUPPLY", name: "พัสดุ" },
] as const;

export function itemTypeLabel(id: number): string {
  return ITEM_TYPES.find((t) => t.id === id)?.name || `ประเภท ${id}`;
}

export interface ParsedLocationItem {
  seq: number;
  itemTypeId: number;
  code: string;
  name: string;
  unit: string | null;
}

export interface ParsedLocation {
  name: string;
  itemTypeId: number;
  rowNumber: number;
  items: ParsedLocationItem[];
}

export interface LocationParseResult {
  sheetName: string;
  locations: ParsedLocation[];
  totalItems: number;
  warnings: string[];
}

const clean = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  return (typeof v === "string" ? fixThaiEncoding(v) : String(v)).trim();
};

const isSeqValue = (v: unknown) =>
  typeof v === "number" || /^\d+$/.test(clean(v));

/**
 * อ่านไฟล์ทะเบียน ITEMSTORE (A=location/ลำดับ, B=itemtype, C=code, D=name, E=unit)
 * - แถวหัว Location: มีข้อมูลแค่คอลัม A,B (เช่น "1F1", 1)
 * - แถวรายการ: คอลัม A เป็นตัวเลขลำดับ และมี code
 */
export function parseLocationWorkbook(data: ArrayBuffer | Uint8Array): LocationParseResult {
  const wb = XLSX.read(data instanceof Uint8Array ? data : new Uint8Array(data), {
    type: "array",
    codepage: 874,
  });
  const sheetName = wb.SheetNames[0];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
  });

  const warnings: string[] = [];
  const locations: ParsedLocation[] = [];
  const locMap = new Map<string, ParsedLocation>();
  const codeSets = new Map<ParsedLocation, Set<string>>();
  let current: ParsedLocation | null = null;
  let totalItems = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const rowNo = i + 1;
    const a = clean(row[0]);
    const b = clean(row[1]);
    const code = clean(row[2]);
    const name = clean(row[3]);
    const unit = clean(row[4]);

    if (!a && !b && !code && !name) continue;
    if (i === 0 && a.toLowerCase() === "location") continue; // header row

    const typeNum = Number(b);
    const typeId = typeNum === 1 || typeNum === 2 ? typeNum : 0;

    // แถวหัว Location: มีเฉพาะคอลัม A,B
    if (a && !code && !name) {
      const locTypeId: number = typeId || current?.itemTypeId || 1;
      if (!typeId) warnings.push(`แถว ${rowNo}: Location "${a}" ไม่มี itemtype ที่ถูกต้อง (ใช้ ${locTypeId})`);
      const key = `${a}|${locTypeId}`;
      let loc = locMap.get(key);
      if (!loc) {
        loc = { name: a, itemTypeId: locTypeId, rowNumber: rowNo, items: [] };
        locMap.set(key, loc);
        locations.push(loc);
        codeSets.set(loc, new Set());
      } else {
        warnings.push(`แถว ${rowNo}: Location "${a}" ซ้ำ — รวมรายการเข้ากับ Location เดิม`);
      }
      current = loc;
      continue;
    }

    // แถวรายการ
    if (!code) {
      warnings.push(`แถว ${rowNo}: ไม่มีรหัสสินค้า (code) — ข้าม`);
      continue;
    }
    if (!current) {
      warnings.push(`แถว ${rowNo}: รายการ "${code}" ไม่อยู่ภายใต้ Location ใด — ข้าม`);
      continue;
    }
    const codes = codeSets.get(current)!;
    if (codes.has(code)) {
      warnings.push(`แถว ${rowNo}: รหัส "${code}" ซ้ำใน Location "${current.name}" — ข้าม`);
      continue;
    }
    codes.add(code);
    current.items.push({
      seq: isSeqValue(row[0]) ? Number(a) : current.items.length + 1,
      itemTypeId: typeId || current.itemTypeId,
      code,
      name: name || code,
      unit: unit || null,
    });
    totalItems++;
  }

  return { sheetName, locations, totalItems, warnings };
}
