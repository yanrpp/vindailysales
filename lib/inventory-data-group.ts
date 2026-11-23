/** กลุ่มข้อมูลคลัง: Mainstore หรือ พัสดุ */
export type InventoryDataGroup = "MAINSTORE" | "PASDU";

export const DATA_GROUP_LABELS: Record<InventoryDataGroup, string> = {
  MAINSTORE: "Mainstore",
  PASDU: "พัสดุ",
};

export function parseDataGroup(raw: string | null | undefined): InventoryDataGroup {
  const v = (raw || "").trim().toUpperCase();
  if (v === "PASDU" || v === "SUPPLIES" || v === "พัสดุ") return "PASDU";
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

export function formatDataDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
