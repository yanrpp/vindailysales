/** กลุ่มข้อมูลคลัง: ยาและเวชภัณฑ์ หรือ พัสดุ */
export type InventoryDataGroup = "MAINSTORE" | "PASDU";

export const DATA_GROUP_LABELS: Record<InventoryDataGroup, string> = {
  MAINSTORE: "ยาและเวชภัณฑ์",
  PASDU: "พัสดุ",
};

export function parseDataGroup(raw: string | null | undefined): InventoryDataGroup {
  const v = (raw || "").trim();
  const upper = v.toUpperCase();
  if (
    upper === "PASDU" ||
    upper === "SUPPLIES" ||
    v === "พัสดุ" ||
    v === "เวชภัณฑ์"
  ) {
    return "PASDU";
  }
  return "MAINSTORE";
}

/** แปลง YYYY-MM-DD เป็น Date (UTC noon เพื่อลดปัญหา timezone) */
export function parseDataDate(raw: string | null | undefined): Date | null {
  const s = (raw || "").trim();
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

/** แสดงวันที่เป็น dd/mm/yyyy */
export function formatDataDate(value: Date | string | null | undefined): string {
  if (!value) return "-";

  if (typeof value === "string") {
    const s = value.trim();
    // YYYY-MM-DD จาก input type="date"
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-");
      return `${d}/${m}/${y}`;
    }
    const dt = new Date(s);
    if (isNaN(dt.getTime())) return "-";
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = String(dt.getUTCFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }

  if (isNaN(value.getTime())) return "-";
  const dd = String(value.getUTCDate()).padStart(2, "0");
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(value.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}
