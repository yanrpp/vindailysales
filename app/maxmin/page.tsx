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
import ExcelJS from "exceljs";
import { UploadModal } from "@/components/upload/UploadModal";
import { Upload } from "lucide-react";

interface TableRowData {
  no: number;
  item_type: string | null;
  item_code: string;
  item_name: string;
  unit: string;
  stock: string;
  month_1: { label: string; value: number | string };
  month_2: { label: string; value: number | string };
  month_3: { label: string; value: number | string };
  min: number;
  max: number;
  average: number;
  max_quota: number;
  min_quota: number;
  packing: string;
  issue_unit: string;
}

interface MaxMinResponse {
  data?: TableRowData[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  config?: {
    a_min: number;
    b_max: number;
    c_monthAvg: number;
  };
  report_dates?: string[];
  item_types?: string[];
  error?: string;
}

export default function MaxMinPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TableRowData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reportDates, setReportDates] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // ดึงรายการ report_date ที่มีในระบบ
  useEffect(() => {
    const loadDates = async () => {
      try {
        const response = await fetch("/api/report-dates");
        const json = await response.json();
        if (response.ok && json.dates) {
          setAvailableDates(json.dates);
        }
      } catch (err) {
        console.error("Error loading dates:", err);
      }
    };
    loadDates();
  }, []);

  // ดึงรายการ item_type ที่มีในระบบ
  useEffect(() => {
    const loadItemTypes = async () => {
      try {
        const response = await fetch("/api/item-types");
        const json = await response.json();
        if (response.ok && json.item_types) {
          setAvailableItemTypes(json.item_types);
        }
      } catch (err) {
        console.error("Error loading item types:", err);
      }
    };
    loadItemTypes();
  }, []);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [itemTypeFilter, setItemTypeFilter] = useState("");
  const [availableItemTypes, setAvailableItemTypes] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string>("item_name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [config, setConfig] = useState({ a_min: 5, b_max: 10, c_monthAvg: 30 });
  const [maxQuotaMultiplier, setMaxQuotaMultiplier] = useState<number>(10);
  const [minQuotaMultiplier, setMinQuotaMultiplier] = useState<number>(5);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);


  // Reload available dates after upload
  const reloadDates = useCallback(async () => {
    try {
      const response = await fetch("/api/report-dates");
      const json = await response.json();
      if (response.ok && json.dates) {
        setAvailableDates(json.dates);
      }
    } catch (err) {
      console.error("Error loading dates:", err);
    }
  }, []);

  // Reload available item types after upload
  const reloadItemTypes = useCallback(async () => {
    try {
      const response = await fetch("/api/item-types");
      const json = await response.json();
      if (response.ok && json.item_types) {
        setAvailableItemTypes(json.item_types);
      }
    } catch (err) {
      console.error("Error loading item types:", err);
    }
  }, []);

  // ดึงข้อมูล
  const loadData = useCallback(async () => {
    if (reportDates.length === 0) {
      setData([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        report_dates: reportDates.join(","),
        search: searchKeyword,
        item_type: itemTypeFilter,
        page: page.toString(),
        pageSize: pageSize.toString(),
        sortBy: sortBy,
        sortOrder: sortOrder,
        maxQuotaMultiplier: maxQuotaMultiplier.toString(),
        minQuotaMultiplier: minQuotaMultiplier.toString(),
      });

      const response = await fetch(`/api/maxmin?${params}`);
      const json: MaxMinResponse = await response.json();

      if (!response.ok) {
        setError(json.error || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
        setData([]);
        setTotal(0);
        setTotalPages(0);
      } else {
        setData(json.data || []);
        setTotal(json.total || 0);
        setTotalPages(json.totalPages || 0);
        if (json.config) {
          setConfig(json.config);
        }
      }
    } catch (fetchError) {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [reportDates, searchKeyword, itemTypeFilter, page, pageSize, sortBy, sortOrder, maxQuotaMultiplier, minQuotaMultiplier]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Export to Excel
  const exportToExcel = async () => {
    if (data.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data");

    // Headers
    worksheet.addRow([
      "No.",
      "Item Type",
      "Item Code",
      "Item Name",
      "Unit",
      `เดือนที่ 1 (${data[0]?.month_1?.label || "-"})`,
      `เดือนที่ 2 (${data[0]?.month_2?.label || "-"})`,
      `เดือนที่ 3 (${data[0]?.month_3?.label || "-"})`,
      "น้อยสุด",
      "มากสุด",
      "Average",
      "Maximum Quota",
      "Minimum Quota",
    ]);

    // Data rows
    data.forEach((row) => {
      worksheet.addRow([
        row.no,
        row.item_type || "",
        row.item_code,
        row.item_name,
        row.unit,
        row.month_1.value === "-" ? "-" : row.month_1.value,
        row.month_2.value === "-" ? "-" : row.month_2.value,
        row.month_3.value === "-" ? "-" : row.month_3.value,
        row.min,
        row.max,
        row.average,
        row.max_quota,
        row.min_quota,
      ]);
    });

    // Generate file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `data-export-${new Date().toISOString().split("T")[0]}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Export to CSV
  const exportToCSV = () => {
    if (data.length === 0) return;

    const headers = [
      "No.",
      "Item Type",
      "Item Code",
      "Item Name",
      "Unit",
      `เดือนที่ 1 (${data[0]?.month_1?.label || "-"})`,
      `เดือนที่ 2 (${data[0]?.month_2?.label || "-"})`,
      `เดือนที่ 3 (${data[0]?.month_3?.label || "-"})`,
      "น้อยสุด",
      "มากสุด",
      "Average",
      "Maximum Quota",
      "Minimum Quota",
    ];

    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        [
          row.no,
          `"${row.item_type || ""}"`,
          `"${row.item_code}"`,
          `"${row.item_name}"`,
          `"${row.unit}"`,
          row.month_1.value === "-" ? "-" : row.month_1.value,
          row.month_2.value === "-" ? "-" : row.month_2.value,
          row.month_3.value === "-" ? "-" : row.month_3.value,
          row.min,
          row.max,
          row.average,
          row.max_quota,
          row.min_quota,
        ].join(","),
      ),
    ];

    const csvContent = csvRows.join("\n");
    // เพิ่ม BOM (Byte Order Mark) สำหรับ UTF-8 เพื่อให้ Excel อ่านภาษาไทยได้ถูกต้อง
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { 
      type: "text/csv;charset=utf-8;" 
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `data-export-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Export to PDF (simple HTML to PDF)
  const exportToPDF = () => {
    if (data.length === 0) return;
    window.print();
  };

  // Export to Data For Import
  const exportToITSetReport = async () => {
    if (data.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data For Import");

    // Headers (Thai labels)
    worksheet.addRow([
      "ลำดับ",        // No.
      "ประเภทสินค้า",  // Item Type
      "รหัสสินค้า",    // Item Code
      "รายการสินค้า",  // Item Name
      "หน่วย",        // Unit
      "จุดสูงสุด",    // Maximum Quota
      "จุดสั่งซื้อ",   // Reorder Point (blank)
      "จุดต่ำสุด",    // Minimum Quota
      "จำนวนที่ซื้อ", // Order Quantity (blank)
    ]);

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Data rows
    data.forEach((row) => {
      worksheet.addRow([
        row.no,              // ลำดับ
        row.item_type || "", // ประเภทสินค้า
        row.item_code,      // รหัสสินค้า
        row.item_name,      // รายการสินค้า
        row.unit,           // หน่วย
        row.max_quota,      // จุดสูงสุด (Maximum Quota)
        "",                 // จุดสั่งซื้อ (ว่างไว้)
        row.min_quota,      // จุดต่ำสุด (Minimum Quota)
        "",                 // จำนวนที่ซื้อ (ว่างไว้)
      ]);
    });

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      if (column.header) {
        column.width = 15;
      }
    });

    // Generate file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Data For Import-${new Date().toISOString().split("T")[0]}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Handle sort
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  // State สำหรับ dropdown search
  const [dateSearchTerms, setDateSearchTerms] = useState<string[]>(["", "", ""]);
  const [dateDropdownOpen, setDateDropdownOpen] = useState<boolean[]>([false, false, false]);

  // Format date สำหรับแสดงผล
  const formatDateForDisplay = (dateString: string): string => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Filter available dates based on search term
  const getFilteredDates = (index: number): string[] => {
    const searchTerm = dateSearchTerms[index]?.toLowerCase() || "";
    return availableDates.filter((date) => {
      const dateStr = date.toLowerCase();
      const displayStr = formatDateForDisplay(date).toLowerCase();
      return dateStr.includes(searchTerm) || displayStr.includes(searchTerm);
    });
  };

  // Handle date selection
  const handleDateSelect = (index: number, selectedDate: string) => {
    const newDates = [...reportDates];
    newDates[index] = selectedDate;
    setReportDates(newDates.filter((d) => d));
    setDateSearchTerms((prev) => {
      const newTerms = [...prev];
      newTerms[index] = "";
      return newTerms;
    });
    setDateDropdownOpen((prev) => {
      const newOpen = [...prev];
      newOpen[index] = false;
      return newOpen;
    });
    setPage(1);
  };

  // Handle remove date
  const handleDateRemove = (index: number) => {
    const newDates = [...reportDates];
    newDates.splice(index, 1);
    setReportDates(newDates.filter((d) => d));
    setDateSearchTerms((prev) => {
      const newTerms = [...prev];
      newTerms[index] = "";
      return newTerms;
    });
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Upload Modal */}
      <UploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onUploadSuccess={() => {
          // Reload available dates and item types after successful upload
          reloadDates();
          reloadItemTypes();
        }}
      />

        {/* Filters Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="text-lg font-medium">Filters & Search</CardTitle>
              {/* Export Buttons */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => setUploadModalOpen(true)}
                  variant="default"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
                <Button
                  onClick={exportToExcel}
                  disabled={data.length === 0}
                  variant="outline"
                  size="sm"
                >
                  Export Excel
                </Button>
                <Button
                  onClick={exportToITSetReport}
                  disabled={data.length === 0}
                  variant="outline"
                  size="sm"
                  className="bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700"
                >
                  Data For Import
                </Button>
                <Button
                  onClick={exportToCSV}
                  disabled={data.length === 0}
                  variant="outline"
                  size="sm"
                >
                  Export CSV
                </Button>
                <Button
                  onClick={exportToPDF}
                  disabled={data.length === 0}
                  variant="outline"
                  size="sm"
                >
                  Export PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Report Date Filters & Search Items */}
            <div className="flex flex-wrap items-end gap-4">
              {/* Report Date Filters */}
              {[0, 1, 2].map((index) => {
                const filteredDates = getFilteredDates(index);
                const selectedDate = reportDates[index];
                const isOpen = dateDropdownOpen[index];

                return (
                  <div key={index} className="space-y-2 relative w-[180px]">
                    <Label htmlFor={`date-${index}`} className="text-sm font-medium">
                      ข้อมูลชุดที่ {index + 1}
                    </Label>
                    <div className="relative">
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Input
                            id={`date-${index}`}
                            type="text"
                            placeholder="ค้นหาหรือเลือกวันที่..."
                            value={
                              isOpen
                                ? dateSearchTerms[index] || ""
                                : selectedDate
                                  ? formatDateForDisplay(selectedDate)
                                  : ""
                            }
                            onChange={(e) => {
                              const newTerms = [...dateSearchTerms];
                              newTerms[index] = e.target.value;
                              setDateSearchTerms(newTerms);
                              if (!isOpen) {
                                const newOpen = [...dateDropdownOpen];
                                newOpen[index] = true;
                                setDateDropdownOpen(newOpen);
                              }
                            }}
                            onFocus={() => {
                              const newOpen = [...dateDropdownOpen];
                              newOpen[index] = true;
                              setDateDropdownOpen(newOpen);
                            }}
                            className="w-full pr-8"
                          />
                          {selectedDate && !isOpen && (
                            <button
                              type="button"
                              onClick={() => handleDateRemove(index)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                              aria-label="Remove date"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                            </button>
                          )}
                          {isOpen && (
                            <button
                              type="button"
                              onClick={() => {
                                const newOpen = [...dateDropdownOpen];
                                newOpen[index] = false;
                                setDateDropdownOpen(newOpen);
                                const newTerms = [...dateSearchTerms];
                                newTerms[index] = "";
                                setDateSearchTerms(newTerms);
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                              aria-label="Close dropdown"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      {isOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-[100]"
                            onClick={() => {
                              const newOpen = [...dateDropdownOpen];
                              newOpen[index] = false;
                              setDateDropdownOpen(newOpen);
                            }}
                          />
                          <div className="absolute z-[110] w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                            {filteredDates.length === 0 ? (
                              <div className="px-4 py-2 text-sm text-gray-500">
                                ไม่พบวันที่ที่ค้นหา
                              </div>
                            ) : (
                              filteredDates.map((date) => (
                                <button
                                  key={date}
                                  type="button"
                                  onClick={() => handleDateSelect(index, date)}
                                  className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors ${
                                    selectedDate === date
                                      ? "bg-blue-100 font-medium"
                                      : ""
                                  }`}
                                >
                                  {formatDateForDisplay(date)}
                                </button>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Search Items */}
              <div className="flex items-center gap-2 flex-1 min-w-[300px]">
                <Label htmlFor="search" className="text-sm font-medium whitespace-nowrap">
                  Search Items:
                </Label>
                <Input
                  id="search"
                  type="text"
                  placeholder="Search by item code or name..."
                  value={searchKeyword}
                  onChange={(e) => {
                    setSearchKeyword(e.target.value);
                    setPage(1);
                  }}
                  className="w-full"
                />
              </div>

              {/* Item Type Filter */}
              <div className="flex items-center gap-2 min-w-[200px]">
                <Label htmlFor="itemType" className="text-sm font-medium whitespace-nowrap">
                  Item Type:
                </Label>
                <select
                  id="itemType"
                  value={itemTypeFilter}
                  onChange={(e) => {
                    setItemTypeFilter(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">ทั้งหมด</option>
                  {availableItemTypes.map((itemType) => (
                    <option key={itemType} value={itemType}>
                      {itemType}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quota Multipliers */}
            <div className="flex flex-wrap items-end gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="minQuotaMultiplier" className="text-sm font-medium whitespace-nowrap">
                  Min:
                </Label>
                <Input
                  id="minQuotaMultiplier"
                  type="number"
                  min="1"
                  step="0.1"
                  value={minQuotaMultiplier}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 5;
                    setMinQuotaMultiplier(value);
                    setPage(1);
                  }}
                  className="w-24"
                />
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  (สูตร: max / 30 × {minQuotaMultiplier})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="maxQuotaMultiplier" className="text-sm font-medium whitespace-nowrap">
                  Max:
                </Label>
                <Input
                  id="maxQuotaMultiplier"
                  type="number"
                  min="1"
                  step="0.1"
                  value={maxQuotaMultiplier}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 10;
                    setMaxQuotaMultiplier(value);
                    setPage(1);
                  }}
                  className="w-24"
                />
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  (สูตร: max / 30 × {maxQuotaMultiplier})
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 rounded-md bg-red-50 border border-red-200 p-4">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        )}

        {/* Data Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="text-lg font-medium">Data Table</CardTitle>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label htmlFor="pageSize" className="text-sm font-medium">
                    Rows per page:
                  </Label>
                  <select
                    id="pageSize"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={1000}>1000</option>
                  </select>
                </div>
                <span className="text-sm text-gray-500">
                  Total: {total} items | Page {page} of {totalPages}
                </span>
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
            ) : data.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-lg font-semibold text-gray-700 mb-2">
                  No data available
                </p>
                <p className="text-sm text-gray-500">
                  Please select at least one report date to view data.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => handleSort("no")}
                        >
                          No. {sortBy === "no" && (sortOrder === "asc" ? "↑" : "↓")}
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => handleSort("item_type")}
                        >
                          Item Type{" "}
                          {sortBy === "item_type" && (sortOrder === "asc" ? "↑" : "↓")}
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => handleSort("item_code")}
                        >
                          Item Code{" "}
                          {sortBy === "item_code" && (sortOrder === "asc" ? "↑" : "↓")}
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => handleSort("item_name")}
                        >
                          Item Name{" "}
                          {sortBy === "item_name" && (sortOrder === "asc" ? "↑" : "↓")}
                        </TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-blue-50 bg-blue-50/50 font-semibold text-blue-700"
                          onClick={() => handleSort("month_1")}
                        >
                          <span className="text-xs font-normal text-gray-600">เดือน</span>{" "}
                          {data.length > 0 && data[0].month_1.label !== "-" && (
                            <span className="font-bold text-blue-800">{data[0].month_1.label}</span>
                          )}
                          {sortBy === "month_1" && (sortOrder === "asc" ? " ↑" : " ↓")}
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-green-50 bg-green-50/50 font-semibold text-green-700"
                          onClick={() => handleSort("month_2")}
                        >
                          <span className="text-xs font-normal text-gray-600">เดือน</span>{" "}
                          {data.length > 0 && data[0].month_2.label !== "-" && (
                            <span className="font-bold text-green-800">{data[0].month_2.label}</span>
                          )}
                          {sortBy === "month_2" && (sortOrder === "asc" ? " ↑" : " ↓")}
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-purple-50 bg-purple-50/50 font-semibold text-purple-700"
                          onClick={() => handleSort("month_3")}
                        >
                          <span className="text-xs font-normal text-gray-600">เดือน</span>{" "}
                          {data.length > 0 && data[0].month_3.label !== "-" && (
                            <span className="font-bold text-purple-800">{data[0].month_3.label}</span>
                          )}
                          {sortBy === "month_3" && (sortOrder === "asc" ? " ↑" : " ↓")}
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => handleSort("min")}
                        >
                          น้อยสุด {sortBy === "min" && (sortOrder === "asc" ? "↑" : "↓")}
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => handleSort("max")}
                        >
                          มากสุด {sortBy === "max" && (sortOrder === "asc" ? "↑" : "↓")}
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => handleSort("average")}
                        >
                          Average{" "}
                          {sortBy === "average" && (sortOrder === "asc" ? "↑" : "↓")}
                        </TableHead>
                        <TableHead>Maximum Quota</TableHead>
                        <TableHead>Minimum Quota</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((row) => (
                        <TableRow key={row.item_code}>
                          <TableCell className="font-medium">{row.no}</TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {row.item_type || "-"}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                              {row.item_code}
                            </code>
                          </TableCell>
                          <TableCell className="font-medium">{row.item_name}</TableCell>
                          <TableCell>{row.unit}</TableCell>
                          <TableCell className="font-semibold text-blue-700 bg-blue-50/30">
                            {row.month_1.value === "-" ? "-" : row.month_1.value}
                          </TableCell>
                          <TableCell className="font-semibold text-green-700 bg-green-50/30">
                            {row.month_2.value === "-" ? "-" : row.month_2.value}
                          </TableCell>
                          <TableCell className="font-semibold text-purple-700 bg-purple-50/30">
                            {row.month_3.value === "-" ? "-" : row.month_3.value}
                          </TableCell>
                          <TableCell>{row.min}</TableCell>
                          <TableCell>{row.max}</TableCell>
                          <TableCell className="font-semibold">{row.average}</TableCell>
                          <TableCell>{row.max_quota}</TableCell>
                          <TableCell>{row.min_quota}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      Showing {(page - 1) * pageSize + 1} to{" "}
                      {Math.min(page * pageSize, total)} of {total} results
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page - 1)}
                        disabled={page === 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page + 1)}
                        disabled={page === totalPages}
                      >
                        Next
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

