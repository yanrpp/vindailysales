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
import { Input } from "@/components/ui/input";

interface ProductLot {
  product_code: string;
  description: string;
  lot_no: string;
  exp: string;
  qty: number;
}

export default function ProductsPage() {
  const [data, setData] = useState<ProductLot[]>([]);
  const [filteredData, setFilteredData] = useState<ProductLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch("/api/inventory/products");
        const json = await response.json();

        if (response.ok && json.success) {
          setData(json.data || []);
          setFilteredData(json.data || []);
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

  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredData(data);
    } else {
      const filtered = data.filter(
        (item) =>
          item.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.lot_no.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredData(filtered);
    }
  }, [searchTerm, data]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-semibold">สินค้า + LOT</CardTitle>
              <p className="text-sm text-gray-600 mt-2">
                แสดงข้อมูลสินค้าพร้อม lot และยอดคงเหลือ
              </p>
            </div>
            <div className="w-64">
              <Input
                placeholder="ค้นหาสินค้า, รหัส, หรือ LOT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
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
          ) : filteredData.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchTerm ? "ไม่พบข้อมูลที่ค้นหา" : "ไม่มีข้อมูลสินค้า"}
            </div>
          ) : (
            <>
              <div className="mb-4 text-sm text-gray-600">
                แสดง {filteredData.length} จาก {data.length} รายการ
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-blue-50">
                      <TableHead>รหัสสินค้า</TableHead>
                      <TableHead>รายละเอียด</TableHead>
                      <TableHead>LOT</TableHead>
                      <TableHead>EXP</TableHead>
                      <TableHead className="text-right">คงเหลือ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((item, idx) => (
                      <TableRow key={`${item.product_code}-${item.lot_no}-${idx}`}>
                        <TableCell className="font-medium">{item.product_code}</TableCell>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {item.lot_no}
                          </code>
                        </TableCell>
                        <TableCell>
                          {new Date(item.exp).toLocaleDateString("th-TH")}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {item.qty.toLocaleString()}
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

