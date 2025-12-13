import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    // ดึงรายการ item_type ที่ไม่ซ้ำกันจาก daily_sale_items
    const { data, error } = await supabase
      .from("daily_sale_items")
      .select("item_type")
      .not("item_type", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // แยก item_type ที่ไม่ซ้ำกันและเรียงลำดับ
    const uniqueItemTypes = Array.from(
      new Set(data?.map((item) => item.item_type).filter(Boolean) || []),
    ).sort();

    return NextResponse.json({ item_types: uniqueItemTypes });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
