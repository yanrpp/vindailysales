import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    // ดึงรายการ report_date ที่ไม่ซ้ำกัน
    const { data, error } = await supabase
      .from("daily_sale_reports")
      .select("report_date")
      .order("report_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // แยก report_date ที่ไม่ซ้ำกัน
    const uniqueDates = Array.from(
      new Set(data?.map((item) => item.report_date).filter(Boolean) || []),
    ).sort((a, b) => {
      // Sort descending (newest first)
      return new Date(b).getTime() - new Date(a).getTime();
    });

    return NextResponse.json({ dates: uniqueDates });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

