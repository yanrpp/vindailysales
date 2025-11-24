import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface DailySaleItem {
  item_code: string;
  item_name: string;
  quantity: number;
  total_amount: number;
  daily_sale_reports: {
    report_date: string;
    store: string;
    category: string;
  };
}

interface ItemMap {
  [key: string]: {
    item_code: string;
    item_name: string;
    quantity: number;
    total_amount: number;
  };
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const date = params.get("date");
  const store = params.get("store");
  const category = params.get("category");

  // -----------------------
  // 1) Summary
  // -----------------------
  let summaryQuery = supabase
    .from("daily_sale_items")
    .select("*, daily_sale_reports!inner(*)");

  if (date)
    summaryQuery = summaryQuery.eq(
      "daily_sale_reports.report_date",
      date,
    );
  if (store)
    summaryQuery = summaryQuery.ilike(
      "daily_sale_reports.store",
      `%${store}%`,
    );
  if (category)
    summaryQuery = summaryQuery.ilike(
      "daily_sale_reports.category",
      `%${category}%`,
    );

  const { data: rows, error } = await summaryQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({
      summary: {
        report_date: null,
        total_items: 0,
        total_amount: 0,
      },
      top_items: [],
    });
  }

  const typedRows = rows as DailySaleItem[];
  const total_amount = typedRows.reduce(
    (sum, r) => sum + (r.total_amount || 0),
    0,
  );
  const report_date = typedRows[0]?.daily_sale_reports?.report_date || null;

  // -----------------------
  // 2) Top Items
  // -----------------------
  const itemMap: ItemMap = {};

  typedRows.forEach((r) => {
    const code = r.item_code;

    if (!code) return;

    if (!itemMap[code]) {
      itemMap[code] = {
        item_code: r.item_code,
        item_name: r.item_name || "",
        quantity: 0,
        total_amount: 0,
      };
    }

    itemMap[code].quantity += r.quantity || 0;
    itemMap[code].total_amount += r.total_amount || 0;
  });

  const top_items = Object.values(itemMap)
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 20);

  return NextResponse.json({
    summary: {
      report_date,
      total_items: typedRows.length,
      total_amount,
    },
    top_items,
  });
}

