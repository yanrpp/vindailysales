"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

interface Summary {
  report_date: string | null;
  total_amount: number;
  total_items: number;
}

interface TopItem {
  item_code: string;
  item_name: string;
  quantity: number;
  total_amount: number;
}

interface Filters {
  date: string;
  store: string;
  category: string;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    date: "",
    store: "",
    category: "",
  });

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams(
        Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== ""),
        ) as Record<string, string>,
      ).toString();

      const response = await fetch(`/api/dashboard?${queryParams}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
        setSummary({
          report_date: null,
          total_amount: 0,
          total_items: 0,
        });
        setTopItems([]);
      } else {
        setSummary(data.summary);
        setTopItems(data.top_items || []);
      }
    } catch (fetchError) {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      setSummary({
        report_date: null,
        total_amount: 0,
        total_items: 0,
      });
      setTopItems([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prevFilters) => ({ ...prevFilters, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({
      date: "",
      store: "",
      category: "",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
          <div className="space-y-6">
            <div className="space-y-3">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-5 w-96" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
        {/* Header Section */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
              Sales Dashboard
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              View daily sales summary and top-selling items
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm">
              Upload Data
            </Button>
          </Link>
        </div>

        {/* Filters Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="filter-date" className="text-sm font-medium text-gray-700">
                  Report Date
                </Label>
                <Input
                  id="filter-date"
                  type="date"
                  value={filters.date}
                  onChange={(e) => handleFilterChange("date", e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="filter-store" className="text-sm font-medium text-gray-700">
                  Store Name
                </Label>
                <Input
                  id="filter-store"
                  value={filters.store}
                  onChange={(e) => handleFilterChange("store", e.target.value)}
                  placeholder="Enter store name"
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="filter-category" className="text-sm font-medium text-gray-700">
                  Category
                </Label>
                <Input
                  id="filter-category"
                  value={filters.category}
                  onChange={(e) => handleFilterChange("category", e.target.value)}
                  placeholder="Enter category"
                  className="w-full"
                />
              </div>
            </div>
            {(filters.date || filters.store || filters.category) && (
              <Button
                onClick={handleClearFilters}
                variant="ghost"
                size="sm"
                className="mt-4"
              >
                Clear All Filters
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 rounded-md bg-red-50 border border-red-200 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Report Date
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">
                {summary?.report_date
                  ? new Date(summary.report_date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Total Amount
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">
                {summary?.total_amount?.toLocaleString("en-US", {
                  style: "currency",
                  currency: "THB",
                  minimumFractionDigits: 0,
                }) || "฿0"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Total Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">
                {summary?.total_items?.toLocaleString("en-US") || "0"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Top Items Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-medium">Top Selling Items</CardTitle>
              {topItems.length > 0 && (
                <span className="text-sm text-gray-500">
                  {topItems.length} {topItems.length === 1 ? "item" : "items"}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {topItems.length === 0 ? (
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No data</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Try adjusting your filters to see results.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">#</TableHead>
                      <TableHead className="w-[140px]">Item Code</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead className="text-right w-[120px]">Quantity</TableHead>
                      <TableHead className="text-right w-[160px]">Total Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topItems.map((item, index) => (
                      <TableRow key={`${item.item_code}-${index}`}>
                        <TableCell className="font-medium text-gray-500">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-800">
                            {item.item_code}
                          </code>
                        </TableCell>
                        <TableCell className="font-medium">
                          {item.item_name || <span className="text-gray-400">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.quantity?.toLocaleString("en-US") || "0"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {item.total_amount?.toLocaleString("en-US", {
                            style: "currency",
                            currency: "THB",
                            minimumFractionDigits: 0,
                          }) || "฿0"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
