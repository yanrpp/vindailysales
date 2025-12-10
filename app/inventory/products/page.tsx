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
import { Button } from "@/components/ui/button";

interface StoreQty {
  store: string;
  qtyArray: number[]; // จำนวนแต่ละ record ก่อนรวม
  totalQty: number; // ยอดรวมของ store
}

interface ProductLot {
  product_code: string;
  description: string;
  lot_no: string;
  exp: string;
  qty: number;
  storeQty?: StoreQty[];
  store?: string | null;
}

interface DateReport {
  id: string;
  detail_date: string;
}

export default function ProductsPage() {
  const [data, setData] = useState<ProductLot[]>([]);
  const [filteredData, setFilteredData] = useState<ProductLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateReport, setDateReport] = useState<string | null>(null);
  const [dateReports, setDateReports] = useState<DateReport[]>([]);
  const [selectedDateReportId, setSelectedDateReportId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    const loadData = async () => {
      try {
        const url = selectedDateReportId 
          ? `/api/inventory/products?date_report_id=${selectedDateReportId}`
          : "/api/inventory/products";
        const response = await fetch(url);
        const json = await response.json();

        if (response.ok && json.success) {
          setData(json.data || []);
          setFilteredData(json.data || []);
          setDateReport(json.dateReport || null);
          setDateReports(json.dateReports || []);
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
  }, [selectedDateReportId]);

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
    // Reset to page 1 when search term changes
    setPage(1);
  }, [searchTerm, data]);

  // Calculate pagination
  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  // ฟังก์ชันสำหรับจัดรูปแบบแสดงยอดคงเหลือแยกตาม store
  // แสดงจำนวนแต่ละ record ก่อนรวม แล้วแสดงยอดรวม
  const formatStoreQty = (storeQty?: StoreQty[]): string => {
    if (!storeQty || storeQty.length === 0) {
      return "-";
    }
    
    // กรอง store ที่เป็น "-" ออก (ไม่แสดง store ที่ไม่มีชื่อ)
    const validStoreQty = storeQty.filter(item => item.store && item.store !== "-");
    
    if (validStoreQty.length === 0) {
      return "-";
    }
    
    // เรียงลำดับตาม store
    const sorted = [...validStoreQty].sort((a, b) => a.store.localeCompare(b.store));
    
    // จัดรูปแบบเป็น (D5=100+40=140),(D2=20)
    // แสดงจำนวนแต่ละ record ก่อนรวม แล้วแสดงยอดรวม
    return sorted.map((item) => {
      if (item.qtyArray.length === 1) {
        // ถ้ามี record เดียว แสดงแค่ยอดรวม
        return `(${item.store}=${item.totalQty.toLocaleString()})`;
      } else {
        // ถ้ามีหลาย record แสดงแต่ละ record ก่อนรวม แล้วแสดงยอดรวม
        const qtyDetails = item.qtyArray.map(qty => qty.toLocaleString()).join("+");
        return `(${item.store}=${qtyDetails}=${item.totalQty.toLocaleString()})`;
      }
    }).join(",");
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-2xl font-semibold">สินค้า + LOT</CardTitle>
            <p className="text-sm text-gray-600 mt-2">
              แสดงข้อมูลสินค้าพร้อม lot และยอดคงเหลือ
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter Section */}
          <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-4 border-b">
            <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex flex-col gap-1.5 min-w-[200px]">
                <label htmlFor="date-report-select" className="text-sm font-medium text-gray-700">
                  เลือกวันที่รายงาน
                </label>
                <select
                  id="date-report-select"
                  value={selectedDateReportId}
                  onChange={(e) => setSelectedDateReportId(e.target.value)}
                  className="h-10 w-full rounded-md border border-blue-200 bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:border-blue-500 transition-colors"
                >
                  <option value="">ทั้งหมด</option>
                  {dateReports.map((dr) => (
                    <option key={dr.id} value={dr.id}>
                      {dr.detail_date}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 flex flex-col gap-1.5 min-w-[250px]">
                <label htmlFor="search-input" className="text-sm font-medium text-gray-700">
                  ค้นหา
                </label>
                <Input
                  id="search-input"
                  placeholder="ค้นหาสินค้า, รหัส, หรือ LOT..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

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
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>
                    แสดง {startIndex + 1} ถึง {Math.min(endIndex, totalItems)} จาก {totalItems} รายการ
                    {data.length !== totalItems && ` (จากทั้งหมด ${data.length} รายการ)`}
                  </span>
                  {dateReport && (
                    <>
                      <span className="text-gray-400">•</span>
                      <span className="text-gray-700">
                        วันที่รายงาน: <span className="font-semibold text-blue-600">{dateReport}</span>
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="pageSize-select" className="text-sm text-gray-600">
                    แสดงต่อหน้า:
                  </label>
                  <select
                    id="pageSize-select"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-9 rounded-md border border-blue-200 bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-blue-50">
                      <TableHead>รหัสสินค้า</TableHead>
                      <TableHead>รายละเอียด</TableHead>
                      <TableHead>LOT</TableHead>
                      <TableHead>EXP</TableHead>
                      <TableHead>คงเหลือแต่ละstore</TableHead>
                      <TableHead className="text-right">คงเหลือ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((item, idx) => (
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
                        <TableCell className="text-sm">
                          {formatStoreQty(item.storeQty)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {item.qty.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    หน้า {page} จาก {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                    >
                      ก่อนหน้า
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages}
                    >
                      ถัดไป
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

