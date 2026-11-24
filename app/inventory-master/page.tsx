import { redirect } from "next/navigation";

/** หน้าหลักเดิม — ส่งต่อไปเมนูย่อย "ยา" */
export default function InventoryMasterIndexPage() {
  redirect("/inventory-master/ya");
}
