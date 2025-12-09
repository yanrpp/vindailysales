"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ExpiredItem {
  product_code: string;
  description: string;
  lot_no: string;
  exp: string;
  total_qty: number;
}

export default function ExpiredPage() {
  const [data, setData] = useState<ExpiredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch("/api/inventory/expired");
        const json = await response.json();

        if (response.ok && json.success) {
          setData(json.data || []);
        } else {
          setError(json.error || "Failed to load data");
        }
      } catch (err) {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-semibold text-red-600">
            สินค้าหมดอายุ
          </CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            สินค้าที่วันที่หมดอายุ (EXP) ผ่านมาแล้ว
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-600">{error}</div>
          ) : data.length === 0 ? (
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">
                ✅ ไม่มีสินค้าหมดอายุ
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert className="bg-red-50 border-red-200 mb-4">
                <AlertDescription className="text-red-800">
                  ⚠️ พบสินค้าหมดอายุ {data.length} รายการ
                </AlertDescription>
              </Alert>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-red-50">
                      <TableHead>รหัสสินค้า</TableHead>
                      <TableHead>รายละเอียด</TableHead>
                      <TableHead>LOT</TableHead>
                      <TableHead>EXP</TableHead>
                      <TableHead className="text-right">คงเหลือ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((item, idx) => (
                      <TableRow key={`${item.product_code}-${item.lot_no}-${idx}`}>
                        <TableCell className="font-medium">{item.product_code}</TableCell>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {item.lot_no}
                          </code>
                        </TableCell>
                        <TableCell className="text-red-600 font-semibold">
                          {new Date(item.exp).toLocaleDateString("th-TH")}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {item.total_qty.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

