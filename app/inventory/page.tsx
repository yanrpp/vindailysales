"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Package, AlertTriangle, DollarSign, BarChart3 } from "lucide-react";

interface DashboardStats {
  totalProducts: number;
  totalLots: number;
  totalStockRecords: number;
  expiredCount: number;
  nonMovingCount: number;
  totalValue: number;
  totalQty: number;
}

interface CategoryStat {
  name: string;
  count: number;
  totalQty: number;
  totalValue: number;
  [key: string]: string | number;
}

interface StoreStat {
  name: string;
  count: number;
  totalQty: number;
  totalValue: number;
  [key: string]: string | number;
}

interface HighValueProduct {
  product_code: string;
  description: string;
  totalValue: number;
  totalQty: number;
}

interface DateReportStat {
  date: string;
  count: number;
  totalQty: number;
  totalValue: number;
}

interface DashboardData {
  categoryStats: CategoryStat[];
  storeStats: StoreStat[];
  highValueProducts: HighValueProduct[];
  expiredProducts: Array<{ product_code: string; description: string; exp: string; qty: number }>;
  dateReportStats: DateReportStat[];
  summary: DashboardStats;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function InventoryDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        // ดึงสถิติพื้นฐาน
        const [productsRes, expiredRes, nonMovingRes, dashboardRes] = await Promise.all([
          fetch("/api/inventory/products"),
          fetch("/api/inventory/expired"),
          fetch("/api/inventory/non-moving"),
          fetch("/api/inventory/dashboard"),
        ]);

        const productsData = await productsRes.json();
        const expiredData = await expiredRes.json();
        const nonMovingData = await nonMovingRes.json();
        const dashboardDataJson = await dashboardRes.json();

        if (productsData.success) {
          const products = productsData.data || [];
          const uniqueProducts = new Set(products.map((p: any) => p.product_code));
          const uniqueLots = new Set(products.map((p: any) => `${p.product_code}_${p.lot_no}`));

          setStats({
            totalProducts: uniqueProducts.size,
            totalLots: uniqueLots.size,
            totalStockRecords: products.length,
            expiredCount: expiredData.success ? (expiredData.data || []).length : 0,
            nonMovingCount: nonMovingData.success ? (nonMovingData.data || []).length : 0,
            totalValue: dashboardDataJson.success ? dashboardDataJson.data.summary.totalValue : 0,
            totalQty: dashboardDataJson.success ? dashboardDataJson.data.summary.totalQty : 0,
          });
        }

        if (dashboardDataJson.success) {
          setDashboardData(dashboardDataJson.data);
        }
      } catch (err) {
        setError("Failed to load statistics");
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency: "THB",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatStoreLocation = (storeCode: string): string => {
    const storeMapping: { [key: string]: string } = {
      "D2": "ห้องยาอาคาร 2",
      "D5": "ห้องยาอาคาร 5",
      "D5A": "ห้องยาอาคาร 5A",
      "P": "คลังสินค้า",
      "S": "พัสดุ",
    };
    return storeMapping[storeCode] || storeCode;
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="h-8 w-8" />
          Dashboard
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          ภาพรวมข้อมูลสินค้าและสถิติในทุกมิติเพื่อการตัดสินใจ
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">สินค้าทั้งหมด</p>
                <p className="text-2xl font-bold text-blue-600">
                  {loading ? "..." : stats?.totalProducts || 0}
                </p>
              </div>
              <Package className="h-12 w-12 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">มูลค่ารวม</p>
                <p className="text-2xl font-bold text-green-600">
                  {loading ? "..." : formatCurrency(stats?.totalValue || 0)}
                </p>
              </div>
              <DollarSign className="h-12 w-12 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">ค้างสต๊อก 6 เดือน</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {loading ? "..." : stats?.nonMovingCount || 0}
                </p>
              </div>
              <TrendingUp className="h-12 w-12 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">หมดอายุ</p>
                <p className="text-2xl font-bold text-red-600">
                  {loading ? "..." : stats?.expiredCount || 0}
                </p>
              </div>
              <AlertTriangle className="h-12 w-12 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* กราฟแสดงมูลค่าตามหมวดหมู่ */}
        <Card>
          <CardHeader>
            <CardTitle>มูลค่าสินค้าตามหมวดหมู่</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : dashboardData?.categoryStats ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dashboardData.categoryStats.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    fontSize={12}
                  />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                  <Bar dataKey="totalValue" fill="#3b82f6" name="มูลค่า (บาท)" />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </CardContent>
        </Card>

        {/* กราฟแสดงจำนวนสินค้าตามสถานที่เก็บ */}
        <Card>
          <CardHeader>
            <CardTitle>จำนวนสินค้าตามสถานที่เก็บ</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : dashboardData?.storeStats ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={dashboardData.storeStats}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }: { name?: string; percent?: number }) => 
                      `${formatStoreLocation(name || "")} ${((percent || 0) * 100).toFixed(0)}%`
                    }
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {dashboardData.storeStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : null}
          </CardContent>
        </Card>

        {/* กราฟแสดงแนวโน้มตามวันที่รายงาน */}
        <Card>
          <CardHeader>
            <CardTitle>แนวโน้มมูลค่าตามวันที่รายงาน</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : dashboardData?.dateReportStats ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dashboardData.dateReportStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    fontSize={12}
                  />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="totalValue"
                    stroke="#10b981"
                    strokeWidth={2}
                    name="มูลค่า (บาท)"
                  />
                  <Line
                    type="monotone"
                    dataKey="totalQty"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="จำนวน"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : null}
          </CardContent>
        </Card>

        {/* กราฟแสดงมูลค่าตามสถานที่เก็บ */}
        <Card>
          <CardHeader>
            <CardTitle>มูลค่าสินค้าตามสถานที่เก็บ</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : dashboardData?.storeStats ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dashboardData.storeStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    fontSize={12}
                    tickFormatter={(value) => formatStoreLocation(value)}
                  />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                  <Bar dataKey="totalValue" fill="#10b981" name="มูลค่า (บาท)" />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Top Products and Expired Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* สินค้าที่มีมูลค่าสูงสุด */}
        <Card>
          <CardHeader>
            <CardTitle>สินค้าที่มีมูลค่าสูงสุด (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : dashboardData?.highValueProducts ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>รหัสสินค้า</TableHead>
                    <TableHead>รายละเอียด</TableHead>
                    <TableHead className="text-right">มูลค่า</TableHead>
                    <TableHead className="text-right">จำนวน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboardData.highValueProducts.map((product, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {product.product_code}
                        </code>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {product.description}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {formatCurrency(product.totalValue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.totalQty.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>

        {/* สินค้าหมดอายุ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">สินค้าหมดอายุ (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : dashboardData?.expiredProducts ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>รหัสสินค้า</TableHead>
                    <TableHead>รายละเอียด</TableHead>
                    <TableHead>วันหมดอายุ</TableHead>
                    <TableHead className="text-right">จำนวน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboardData.expiredProducts.map((product, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {product.product_code}
                        </code>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {product.description}
                      </TableCell>
                      <TableCell className="text-red-600">
                        {new Date(product.exp).toLocaleDateString("th-TH")}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.qty.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>สรุปข้อมูลตามหมวดหมู่</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : dashboardData?.categoryStats ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>หมวดหมู่</TableHead>
                  <TableHead className="text-right">จำนวนสินค้า</TableHead>
                  <TableHead className="text-right">จำนวนรวม</TableHead>
                  <TableHead className="text-right">มูลค่ารวม</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboardData.categoryStats.map((category, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell className="text-right">{category.count}</TableCell>
                    <TableCell className="text-right">
                      {category.totalQty.toLocaleString(undefined, {
                        minimumFractionDigits: 3,
                        maximumFractionDigits: 3,
                      })}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      {formatCurrency(category.totalValue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
