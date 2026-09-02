"use client";

import { useState, useEffect, useRef } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  Layers,
  FileText,
  Search,
  Download,
  Trash2,
  RefreshCw,
  Info,
  Eye,
  Check,
  Package,
  TrendingUp,
  Percent,
  AlertOctagon,
  X,
  FolderOpen,
  ArrowRight,
  RotateCcw,
  PlusCircle,
  ShieldAlert,
  Building2,
  Tag,
  Calculator,
  ShoppingCart,
  CheckCircle,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import * as xlsx from "xlsx";

type InventoryFileType = "BALANCE" | "DISPENSE" | "SALE" | "USAGE";

interface ValidationResult {
  fileType: InventoryFileType;
  isValid: boolean;
  sheetName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: { message: string; severity: "error" | "warning" }[];
  warnings: { message: string; severity: "error" | "warning" }[];
  previewRows: any[];
  duplicateInfo?: {
    isDuplicate: boolean;
    existingBatchCount: number;
    latestBatch: any;
    duplicateMessage: string;
  };
}

export default function InventoryMasterPage() {
  const [activeTab, setActiveTab] = useState<
    "upload" | "overview" | "balance" | "dispense" | "sale" | "usage" | "batches"
  >("overview");

  // Helper for safe number formatting
  const formatNum = (val: any, decimals?: number) => {
    if (val === null || val === undefined || val === "" || isNaN(Number(val))) return "-";
    const num = Number(val);
    if (decimals !== undefined) {
      return num.toLocaleString("th-TH", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
    return num.toLocaleString("th-TH");
  };

  // Upload state
  const [selectedFileType, setSelectedFileType] = useState<InventoryFileType>("USAGE");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importMode, setImportMode] = useState<"OVERWRITE" | "APPEND">("OVERWRITE");
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sorting state
  const [sortBy, setSortBy] = useState<string>("diff");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Data views state
  const [loadingData, setLoadingData] = useState(false);
  const [tableData, setTableData] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>({
    totalUniqueCodes: 0,
    totalBalanceRecords: 0,
    totalDispenseRecords: 0,
    totalSaleRecords: 0,
    totalUsageRecords: 0,
    needOrderCount: 0,
    sufficientCount: 0,
  });
  const [filterOptions, setFilterOptions] = useState<{ categories: string[]; suppliers: string[] }>({
    categories: [],
    suppliers: [],
  });

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedSupplier, setSelectedSupplier] = useState("ALL");
  const [stockStatus, setStockStatus] = useState<"ALL" | "NEED_ORDER" | "SUFFICIENT">("ALL");

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Batches state
  const [batches, setBatches] = useState<any[]>([]);

  // Fetch data when switching tabs or changing filters / sorting
  useEffect(() => {
    if (activeTab !== "upload") {
      fetchTabData();
    }
  }, [activeTab, currentPage, searchTerm, selectedCategory, selectedSupplier, stockStatus, sortBy, sortOrder]);

  const fetchTabData = async () => {
    setLoadingData(true);
    try {
      const queryParams = new URLSearchParams({
        tab: activeTab,
        search: searchTerm,
        category: selectedCategory,
        supplier: selectedSupplier,
        stockStatus,
        sortBy,
        sortOrder,
        page: String(currentPage),
        limit: "50",
      });

      const res = await fetch(`/api/inventory-analytics/overview?${queryParams.toString()}`);
      const data = await res.json();
      if (res.ok) {
        if (activeTab === "batches") {
          setBatches(data.batches || []);
        } else {
          setTableData(data.items || []);
          if (data.metrics) setMetrics(data.metrics);
          if (data.filterOptions) setFilterOptions(data.filterOptions);
        }
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotalCount(data.pagination.total || 0);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoadingData(false);
    }
  };

  // Toggle sorting by column
  const handleSort = (colKey: string) => {
    if (sortBy === colKey) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(colKey);
      setSortOrder(colKey === "diff" || colKey === "balanceQty" || colKey === "maxUsage" ? "asc" : "asc");
    }
    setCurrentPage(1);
  };

  // Helper render sort indicator icon
  const renderSortIcon = (colKey: string) => {
    if (sortBy !== colKey) {
      return <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-70 transition-opacity" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-amber-300 font-bold animate-pulse" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-amber-300 font-bold animate-pulse" />
    );
  };

  // Direct trigger file browse for specific type
  const triggerBrowseForType = (fileType: InventoryFileType) => {
    setSelectedFileType(fileType);
    setValidationResult(null);
    setSelectedFile(null);
    setShowErrorModal(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  // Handle File Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file, selectedFileType);
  };

  const processFile = async (file: File, fileType: InventoryFileType) => {
    setSelectedFile(file);
    setValidationResult(null);
    setImportSuccessMessage(null);
    setShowErrorModal(false);
    setIsValidating(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileType", fileType);

      const res = await fetch("/api/inventory-analytics/validate", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setValidationResult(data);

      if (!data.isValid || (data.errors && data.errors.length > 0)) {
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Error validating file:", error);
      const failedResult: ValidationResult = {
        fileType: fileType,
        isValid: false,
        sheetName: "",
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        errors: [{ message: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ หรือไฟล์เสียหาย", severity: "error" }],
        warnings: [],
        previewRows: [],
      };
      setValidationResult(failedResult);
      setShowErrorModal(true);
    } finally {
      setIsValidating(false);
    }
  };

  // Handle Import with Overwrite / Append
  const handleConfirmImport = async () => {
    if (!selectedFile || !validationResult?.isValid) return;

    if (importMode === "OVERWRITE" && validationResult.duplicateInfo?.isDuplicate) {
      const typeName =
        selectedFileType === "BALANCE"
          ? "1. ยอดคงเหลือ"
          : selectedFileType === "DISPENSE"
          ? "2. ยอดตัดจ่าย"
          : selectedFileType === "SALE"
          ? "3. ยอดขาย"
          : "4. ปริมาณการใช้ & คู่ค้า";

      const confirmMsg = `ยืนยันการแทนที่ข้อมูลเดิมของ "${typeName}" ใช่หรือไม่?\n(ระบบจะลบข้อมูลชุดเดิมออกจากฐานข้อมูลและนำเข้าข้อมูลชุดใหม่นี้แทน)`;
      if (!confirm(confirmMsg)) return;
    }

    setIsImporting(true);
    setImportSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("fileType", selectedFileType);
      formData.append("importMode", importMode);
      if (note) formData.append("note", note);

      const res = await fetch("/api/inventory-analytics/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setImportSuccessMessage(data.message);
        setSelectedFile(null);
        setValidationResult(null);
        setNote("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        alert(data.error || "เกิดข้อผิดพลาดในการนำเข้า");
      }
    } catch (error: any) {
      console.error("Import error:", error);
      alert("เกิดข้อผิดพลาดในการนำเข้าข้อมูล: " + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  // Direct Clear Data from Database
  const handleClearData = async (fileType: "BALANCE" | "DISPENSE" | "SALE" | "USAGE" | "ALL") => {
    const typeName =
      fileType === "BALANCE"
        ? "1. ยอดคงเหลือ"
        : fileType === "DISPENSE"
        ? "2. ยอดตัดจ่าย"
        : fileType === "SALE"
        ? "3. ยอดขาย"
        : fileType === "USAGE"
        ? "4. ปริมาณการใช้ & คู่ค้า"
        : "ข้อมูลรายงานทั้งหมด";

    if (
      !confirm(
        `⚠️ คุณแน่ใจหรือไม่ว่าต้องการลบ "${typeName}" ออกจากฐานข้อมูลทั้งหมด?\nการดำเนินการนี้จะลบข้อมูลและประวัติการนำเข้าทันทีและไม่สามารถกู้คืนได้!`
      )
    ) {
      return;
    }

    setIsClearing(true);
    try {
      const res = await fetch(`/api/inventory-analytics/clear?fileType=${fileType}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message || "ลบข้อมูลออกจากฐานข้อมูลสำเร็จ");
        if (activeTab === "upload") {
          setValidationResult(null);
          setSelectedFile(null);
        } else {
          fetchTabData();
        }
      } else {
        alert(data.error || "ไม่สามารถลบข้อมูลได้");
      }
    } catch (err: any) {
      alert("เกิดข้อผิดพลาดในการลบข้อมูล: " + err.message);
    } finally {
      setIsClearing(false);
    }
  };

  // Handle Delete Single Batch
  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm("คุณต้องการลบประวัติและข้อมูลการนำเข้ารอบนี้ใช่หรือไม่?")) return;

    try {
      const res = await fetch(`/api/inventory-analytics/batches/${batchId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        alert("ลบข้อมูลสำเร็จ");
        fetchTabData();
      } else {
        alert(data.error || "ไม่สามารถลบข้อมูลได้");
      }
    } catch (error) {
      console.error("Error deleting batch:", error);
    }
  };

  // Export to Excel in exact Sheet "เหลือ" format
  const handleExportExcel = () => {
    if (tableData.length === 0) return;

    if (activeTab === "overview") {
      const exportRows = tableData.map((item, idx) => ({
        "ลำดับ": idx + 1,
        "รหัสสินค้า": item.itemCode,
        "รายการ": item.itemName,
        "หน่วย": item.unit,
        "เหลือ (Col E)": item.balanceQty ?? "-",
        "MIN (Col H)": item.minQty ?? "-",
        "ปริมาณการใช้ 6": item.usageMonth1 ?? "-",
        "ปริมาณการใช้ 7": item.usageMonth2 ?? "-",
        "ปริมาณการใช้ 8": item.usageMonth3 ?? "-",
        "MAX (G,H,I)": item.maxUsage ?? 0,
        "AVG (G,H,I)": item.avgUsage ?? 0,
        "เหลือ - MAX": item.diff ?? 0,
        "ค้างส่ง": item.pendingDelivery ?? 0,
        "สั่ง (แนะนำ)": item.suggestedOrder ?? 0,
        "หน่วยนับ": item.unit,
        "หมวด": item.category,
        "บริษัท": item.supplier,
      }));

      const ws = xlsx.utils.json_to_sheet(exportRows);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "เหลือ");
      xlsx.writeFile(wb, `รายงานวิเคราะห์สต็อก_เหลือ_MAX_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } else {
      const ws = xlsx.utils.json_to_sheet(tableData);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, activeTab);
      xlsx.writeFile(wb, `inventory_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Hidden universal file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xls,.xlsx,.csv"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Top Header Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-800 p-6 text-white shadow-xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur-md mb-2">
              <Database className="h-3.5 w-3.5" />
              <span>Multi-File Inventory Engine (Sheet เหลือ & ปริมาณการใช้)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              ระบบวิเคราะห์ปริมาณการใช้ & สรุปยอดสั่งซื้อ (Master Overview)
            </h1>
            <p className="mt-1 text-xs md:text-sm text-blue-100 max-w-2xl">
              ผสานข้อมูล 4 ไฟล์ (1.คงเหลือ + 2.ตัดจ่าย + 3.ขาย + 4.ปริมาณการใช้) คำนวณสูตร <b>MAX</b>, <b>AVG</b>, และ <b>เหลือ - MAX</b> แยกหมวดและบริษัทคู่ค้าตาม Sheet <b>เหลือ</b>
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap gap-2.5">
            <div className="rounded-xl bg-white/10 backdrop-blur-md px-3.5 py-2 border border-white/10 text-center min-w-[85px]">
              <div className="text-[11px] text-blue-200">รหัสสินค้า</div>
              <div className="text-lg font-bold">{formatNum(metrics?.totalUniqueCodes || 0)}</div>
            </div>

            <div className="rounded-xl bg-red-500/30 backdrop-blur-md px-3.5 py-2 border border-red-300/30 text-center min-w-[85px]">
              <div className="text-[11px] text-red-200 font-bold">🔴 ต้องสั่งซื้อ</div>
              <div className="text-lg font-bold text-red-100">{formatNum(metrics?.needOrderCount || 0)}</div>
            </div>

            <div className="rounded-xl bg-emerald-500/30 backdrop-blur-md px-3.5 py-2 border border-emerald-300/30 text-center min-w-[85px]">
              <div className="text-[11px] text-emerald-200 font-bold">🟢 พอใช้</div>
              <div className="text-lg font-bold text-emerald-100">{formatNum(metrics?.sufficientCount || 0)}</div>
            </div>

            <div className="rounded-xl bg-white/10 backdrop-blur-md px-3.5 py-2 border border-white/10 text-center min-w-[75px]">
              <div className="text-[11px] text-blue-200">1. คงเหลือ</div>
              <div className="text-lg font-bold">{formatNum(metrics?.totalBalanceRecords || 0)}</div>
            </div>

            <div className="rounded-xl bg-white/10 backdrop-blur-md px-3.5 py-2 border border-white/10 text-center min-w-[75px]">
              <div className="text-[11px] text-blue-200">2. ตัดจ่าย</div>
              <div className="text-lg font-bold">{formatNum(metrics?.totalDispenseRecords || 0)}</div>
            </div>

            <div className="rounded-xl bg-white/10 backdrop-blur-md px-3.5 py-2 border border-white/10 text-center min-w-[75px]">
              <div className="text-[11px] text-blue-200">3. ขาย</div>
              <div className="text-lg font-bold">{formatNum(metrics?.totalSaleRecords || 0)}</div>
            </div>

            <div className="rounded-xl bg-white/10 backdrop-blur-md px-3.5 py-2 border border-white/10 text-center min-w-[75px]">
              <div className="text-[11px] text-blue-200">4. ใช้ย้อนหลัง</div>
              <div className="text-lg font-bold">{formatNum(metrics?.totalUsageRecords || 0)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => {
            setActiveTab("overview");
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "overview"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>ภาพรวมเปรียบเทียบ (Sheet เหลือ)</span>
        </button>

        <button
          onClick={() => setActiveTab("upload")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "upload"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <UploadCloud className="h-4 w-4" />
          <span>อัปโหลด & ตรวจสอบไฟล์ (4 ไฟล์)</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("balance");
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "balance"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <Package className="h-4 w-4" />
          <span>1. คงเหลือ</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("dispense");
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "dispense"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <Percent className="h-4 w-4" />
          <span>2. ตัดจ่าย</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("sale");
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "sale"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          <span>3. ขาย Daily</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("usage");
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "usage"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <Calculator className="h-4 w-4" />
          <span>4. ปริมาณการใช้ & คู่ค้า</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("batches");
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "batches"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>ประวัติการนำเข้า</span>
        </button>
      </div>

      {/* TAB 1: MASTER OVERVIEW (SHEET เหลือ 16 COLUMNS WITH SORTING) */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Search, Status & Dropdown Filter Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            {/* Search */}
            <div className="relative lg:col-span-4">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหารหัส, รายการ, หมวด, บริษัท..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-2 text-xs md:text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Category Dropdown */}
            <div className="lg:col-span-3">
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs md:text-sm focus:border-blue-500 focus:outline-none bg-white"
              >
                <option value="ALL">📁 ทุกหมวดสินค้า ({filterOptions.categories.length})</option>
                {filterOptions.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Supplier Dropdown */}
            <div className="lg:col-span-3">
              <select
                value={selectedSupplier}
                onChange={(e) => {
                  setSelectedSupplier(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs md:text-sm focus:border-blue-500 focus:outline-none bg-white truncate"
              >
                <option value="ALL">🏢 ทุกบริษัทคู่ค้า ({filterOptions.suppliers.length})</option>
                {filterOptions.suppliers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Status & Export Actions */}
            <div className="lg:col-span-2 flex items-center justify-end gap-2">
              <button
                onClick={fetchTabData}
                className="p-2 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50"
                title="รีเฟรชข้อมูล"
              >
                <RefreshCw className={`h-4 w-4 ${loadingData ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export Sheet เหลือ</span>
              </button>
            </div>
          </div>

          {/* Quick Filter Badges & Sort Info */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-500 font-medium">กรองสถานะ:</span>
              <button
                onClick={() => setStockStatus("ALL")}
                className={`rounded-lg px-3 py-1 font-semibold transition-colors ${
                  stockStatus === "ALL"
                    ? "bg-slate-800 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                ทั้งหมด ({formatNum(metrics?.totalUniqueCodes || 0)})
              </button>
              <button
                onClick={() => setStockStatus("NEED_ORDER")}
                className={`rounded-lg px-3 py-1 font-semibold transition-colors ${
                  stockStatus === "NEED_ORDER"
                    ? "bg-red-600 text-white"
                    : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                }`}
              >
                🔴 ต้องสั่งซื้อ (เหลือ &lt; MAX) ({formatNum(metrics?.needOrderCount || 0)})
              </button>
              <button
                onClick={() => setStockStatus("SUFFICIENT")}
                className={`rounded-lg px-3 py-1 font-semibold transition-colors ${
                  stockStatus === "SUFFICIENT"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                🟢 สต็อกพอใช้ (เหลือ ≥ MAX) ({formatNum(metrics?.sufficientCount || 0)})
              </button>
            </div>

            <div className="text-[11px] text-gray-500 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200 flex items-center gap-1.5">
              <span>💡 คลิกที่หัวคอลัมน์เพื่อเรียงข้อมูล (กำลังเรียงตาม: <b>{sortBy}</b> {sortOrder === "asc" ? "⬆️ น้อยไปมาก / ก-ฮ" : "⬇️ มากไปน้อย / ฮ-ก"})</span>
            </div>
          </div>

          {/* Master Overview Table (Sheet เหลือ format with 16 clickable sortable columns) */}
          <div className="rounded-2xl bg-white shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] text-gray-600">
                <thead className="bg-slate-800 text-white font-semibold text-[11px] border-b border-gray-200">
                  <tr>
                    {/* Seq */}
                    <th
                      onClick={() => handleSort("seq")}
                      className="group px-2.5 py-3 text-center cursor-pointer hover:bg-slate-700 transition-colors select-none"
                      title="คลิกเพื่อเรียงลำดับ"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>#</span>
                        {renderSortIcon("seq")}
                      </div>
                    </th>

                    {/* Item Code */}
                    <th
                      onClick={() => handleSort("itemCode")}
                      className="group px-3 py-3 bg-blue-900/90 text-blue-100 cursor-pointer hover:bg-blue-800 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามรหัสสินค้า"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>รหัสสินค้า</span>
                        {renderSortIcon("itemCode")}
                      </div>
                    </th>

                    {/* Item Name */}
                    <th
                      onClick={() => handleSort("itemName")}
                      className="group px-3 py-3 min-w-[200px] cursor-pointer hover:bg-slate-700 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามชื่อสินค้า"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>รายการสินค้า</span>
                        {renderSortIcon("itemName")}
                      </div>
                    </th>

                    {/* Unit */}
                    <th
                      onClick={() => handleSort("unit")}
                      className="group px-2 py-3 cursor-pointer hover:bg-slate-700 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามหน่วย"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>หน่วย</span>
                        {renderSortIcon("unit")}
                      </div>
                    </th>

                    {/* Balance */}
                    <th
                      onClick={() => handleSort("balanceQty")}
                      className="group px-3 py-3 text-right bg-blue-950/80 text-blue-200 cursor-pointer hover:bg-blue-900 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามยอดคงเหลือ"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div>
                          <div>เหลือ</div>
                          <span className="text-[9px] text-blue-300 font-normal">ไฟล์1(Col E)</span>
                        </div>
                        {renderSortIcon("balanceQty")}
                      </div>
                    </th>

                    {/* MIN */}
                    <th
                      onClick={() => handleSort("minQty")}
                      className="group px-3 py-3 text-right bg-blue-950/80 text-blue-200 cursor-pointer hover:bg-blue-900 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามจุดสั่งซื้อ MIN"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div>
                          <div>MIN</div>
                          <span className="text-[9px] text-blue-300 font-normal">ไฟล์1(Col H)</span>
                        </div>
                        {renderSortIcon("minQty")}
                      </div>
                    </th>

                    {/* Usage Month 1 */}
                    <th
                      onClick={() => handleSort("usageMonth1")}
                      className="group px-3 py-3 text-right bg-slate-700 text-slate-200 cursor-pointer hover:bg-slate-600 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามยอดใช้เดือน 6"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div>
                          <div>ใช้ 6</div>
                          <span className="text-[9px] text-slate-300 font-normal">เดือน 6</span>
                        </div>
                        {renderSortIcon("usageMonth1")}
                      </div>
                    </th>

                    {/* Usage Month 2 */}
                    <th
                      onClick={() => handleSort("usageMonth2")}
                      className="group px-3 py-3 text-right bg-slate-700 text-slate-200 cursor-pointer hover:bg-slate-600 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามยอดใช้เดือน 7"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div>
                          <div>ใช้ 7</div>
                          <span className="text-[9px] text-slate-300 font-normal">เดือน 7</span>
                        </div>
                        {renderSortIcon("usageMonth2")}
                      </div>
                    </th>

                    {/* Usage Month 3 */}
                    <th
                      onClick={() => handleSort("usageMonth3")}
                      className="group px-3 py-3 text-right bg-slate-700 text-slate-200 cursor-pointer hover:bg-slate-600 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามยอดใช้เดือน 8 (ตัด+ขาย)"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div>
                          <div>ใช้ 8</div>
                          <span className="text-[9px] text-slate-300 font-normal">ตัด+ขาย</span>
                        </div>
                        {renderSortIcon("usageMonth3")}
                      </div>
                    </th>

                    {/* MAX */}
                    <th
                      onClick={() => handleSort("maxUsage")}
                      className="group px-3 py-3 text-right bg-indigo-950 text-indigo-200 font-bold cursor-pointer hover:bg-indigo-900 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามยอดใช้สูงสุด MAX"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div>
                          <div>MAX</div>
                          <span className="text-[9px] text-indigo-300 font-normal">สูงสุด 3 ด.</span>
                        </div>
                        {renderSortIcon("maxUsage")}
                      </div>
                    </th>

                    {/* AVG */}
                    <th
                      onClick={() => handleSort("avgUsage")}
                      className="group px-3 py-3 text-right bg-indigo-950 text-indigo-200 font-bold cursor-pointer hover:bg-indigo-900 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามยอดเฉลี่ย AVG"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div>
                          <div>AVG</div>
                          <span className="text-[9px] text-indigo-300 font-normal">เฉลี่ย 3 ด.</span>
                        </div>
                        {renderSortIcon("avgUsage")}
                      </div>
                    </th>

                    {/* เหลือ - MAX */}
                    <th
                      onClick={() => handleSort("diff")}
                      className="group px-3 py-3 text-right bg-amber-950 text-amber-200 font-bold cursor-pointer hover:bg-amber-900 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามผลต่าง เหลือ - MAX"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div>
                          <div>เหลือ - MAX</div>
                          <span className="text-[9px] text-amber-300 font-normal">Col E - J</span>
                        </div>
                        {renderSortIcon("diff")}
                      </div>
                    </th>

                    {/* Pending */}
                    <th
                      onClick={() => handleSort("pendingDelivery")}
                      className="group px-2.5 py-3 text-right cursor-pointer hover:bg-slate-700 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามยอดค้างส่ง"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>ค้างส่ง</span>
                        {renderSortIcon("pendingDelivery")}
                      </div>
                    </th>

                    {/* Suggested Order */}
                    <th
                      onClick={() => handleSort("suggestedOrder")}
                      className="group px-2.5 py-3 text-right bg-red-950/80 text-red-200 font-bold cursor-pointer hover:bg-red-900 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามยอดแนะนำสั่งซื้อ"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div>
                          <div>สั่ง (แนะนำ)</div>
                          <span className="text-[9px] text-red-300 font-normal">ขาดสต็อก</span>
                        </div>
                        {renderSortIcon("suggestedOrder")}
                      </div>
                    </th>

                    {/* Category */}
                    <th
                      onClick={() => handleSort("category")}
                      className="group px-3 py-3 min-w-[140px] cursor-pointer hover:bg-slate-700 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามหมวดสินค้า"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>หมวดสินค้า</span>
                        {renderSortIcon("category")}
                      </div>
                    </th>

                    {/* Supplier */}
                    <th
                      onClick={() => handleSort("supplier")}
                      className="group px-3 py-3 min-w-[220px] cursor-pointer hover:bg-slate-700 transition-colors select-none"
                      title="คลิกเพื่อเรียงตามบริษัทคู่ค้า"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>บริษัทคู่ค้า</span>
                        {renderSortIcon("supplier")}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loadingData ? (
                    <tr>
                      <td colSpan={16} className="px-4 py-12 text-center text-gray-500">
                        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-blue-600 mb-2" />
                        กำลังโหลดและจัดเรียงข้อมูล...
                      </td>
                    </tr>
                  ) : tableData.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="px-4 py-12 text-center text-gray-500">
                        <Package className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                        ยังไม่มีข้อมูลในระบบ หรือไม่พบรายการตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    tableData.map((item, idx) => (
                      <tr
                        key={idx}
                        className={`hover:bg-slate-50 transition-colors ${
                          item.needOrder ? "bg-red-50/30" : ""
                        }`}
                      >
                        <td className="px-2.5 py-2 text-center font-mono text-gray-400">{item.seq}</td>
                        <td className="px-3 py-2 font-bold text-blue-700 font-mono bg-blue-50/30">
                          {item.itemCode}
                        </td>
                        <td className="px-3 py-2 max-w-[240px] truncate text-gray-900 font-medium" title={item.itemName}>
                          {item.itemName}
                        </td>
                        <td className="px-2 py-2 text-gray-500">{item.unit}</td>

                        {/* Balance & MIN */}
                        <td className="px-3 py-2 text-right font-bold text-blue-900 bg-blue-50/50">
                          {formatNum(item.balanceQty)}
                        </td>
                        <td className="px-3 py-2 text-right text-amber-800 font-semibold bg-blue-50/20">
                          {formatNum(item.minQty)}
                        </td>

                        {/* Usage 3 months */}
                        <td className="px-3 py-2 text-right font-mono text-gray-600">
                          {formatNum(item.usageMonth1, 1)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-600">
                          {formatNum(item.usageMonth2, 1)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-800">
                          {formatNum(item.usageMonth3, 2)}
                        </td>

                        {/* MAX & AVG */}
                        <td className="px-3 py-2 text-right font-bold text-indigo-900 bg-indigo-50/40 font-mono">
                          {formatNum(item.maxUsage, 2)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 bg-indigo-50/20 font-mono">
                          {formatNum(item.avgUsage, 2)}
                        </td>

                        {/* เหลือ - MAX with Badges */}
                        <td
                          className={`px-3 py-2 text-right font-mono font-bold ${
                            item.needOrder
                              ? "text-red-700 bg-red-100/80"
                              : "text-emerald-700 bg-emerald-50"
                          }`}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <span>{item.diff > 0 ? `+${formatNum(item.diff, 2)}` : formatNum(item.diff, 2)}</span>
                            {item.needOrder && (
                              <span className="rounded bg-red-600 text-white text-[9px] px-1 py-0.2">สั่ง</span>
                            )}
                          </div>
                        </td>

                        {/* Orders */}
                        <td className="px-2.5 py-2 text-right font-mono text-gray-400">
                          {formatNum(item.pendingDelivery)}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono font-bold text-red-700 bg-red-50/40">
                          {item.suggestedOrder > 0 ? formatNum(item.suggestedOrder) : "-"}
                        </td>

                        {/* Category & Supplier */}
                        <td className="px-3 py-2 max-w-[150px] truncate text-gray-600" title={item.category}>
                          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-3 py-2 max-w-[220px] truncate text-gray-500" title={item.supplier}>
                          {item.supplier}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 bg-gray-50 text-xs text-gray-600">
              <div>
                แสดงหน้า <b>{currentPage}</b> จาก <b>{totalPages}</b> (ทั้งหมด{" "}
                <b>{formatNum(totalCount)}</b> รายการ)
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1 || loadingData}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-white disabled:opacity-40"
                >
                  ก่อนหน้า
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || loadingData}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-white disabled:opacity-40"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: UPLOAD & VALIDATION (4 FILE CARDS) */}
      {activeTab === "upload" && (
        <div className="space-y-6">
          {/* 4 Direct Browse Action Cards */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-blue-600" />
                  กดเลือกไฟล์ที่ต้องการนำเข้า (คลิกที่การ์ดเพื่อเปิดเลือกไฟล์ทันที)
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  คลิกที่การ์ดไฟล์ใดก็ได้ ระบบจะเปิดหน้าต่างเลือกไฟล์ให้ทันทีและตรวจความถูกต้องทันที
                </p>
              </div>

              {isValidating && (
                <div className="flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-xs font-bold text-blue-700 animate-pulse">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>กำลังตรวจโครงสร้างไฟล์...</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. คงเหลือ */}
              <div
                onClick={() => triggerBrowseForType("BALANCE")}
                className={`group cursor-pointer rounded-2xl p-4 border-2 transition-all hover:scale-[1.02] ${
                  selectedFileType === "BALANCE" && selectedFile
                    ? "border-blue-600 bg-blue-50/60 shadow-lg ring-2 ring-blue-500/30"
                    : "border-gray-200 hover:border-blue-500 hover:bg-blue-50/30 hover:shadow-md"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm group-hover:text-blue-600">
                        1. ไฟล์คงเหลือ
                      </h3>
                      <p className="text-[11px] text-gray-500">1.คงเหลือ.xls</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                    Col B,E,H
                  </span>
                </div>

                <div className="mt-3 space-y-0.5 text-[11px] text-gray-600 bg-white/80 p-2.5 rounded-xl border border-gray-100">
                  <p>• <b>Col B</b>: รหัสสินค้า (ตัวเชื่อม)</p>
                  <p>• <b>Col E</b>: จำนวนคงเหลือ</p>
                  <p>• <b>Col H</b>: จุดสั่งซื้อ MIN</p>
                </div>

                <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white group-hover:bg-blue-700 transition-colors shadow-sm">
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>เลือก 1.คงเหลือ.xls</span>
                </div>
              </div>

              {/* 2. ตัดจ่าย */}
              <div
                onClick={() => triggerBrowseForType("DISPENSE")}
                className={`group cursor-pointer rounded-2xl p-4 border-2 transition-all hover:scale-[1.02] ${
                  selectedFileType === "DISPENSE" && selectedFile
                    ? "border-emerald-600 bg-emerald-50/60 shadow-lg ring-2 ring-emerald-500/30"
                    : "border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/30 hover:shadow-md"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <Percent className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm group-hover:text-emerald-600">
                        2. ไฟล์ตัดจ่าย
                      </h3>
                      <p className="text-[11px] text-gray-500">2.ตัดจ่าย.xls</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    กู้คืน_Sheet1
                  </span>
                </div>

                <div className="mt-3 space-y-0.5 text-[11px] text-gray-600 bg-white/80 p-2.5 rounded-xl border border-gray-100">
                  <p>• <b>Col B</b>: Stock Code</p>
                  <p>• <b>Col G</b>: คำนวณสูตร <b>(G/3)+G</b></p>
                  <p className="text-emerald-700 font-bold">➔ ปรับปรุงเป็นยอดใช้</p>
                </div>

                <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white group-hover:bg-emerald-700 transition-colors shadow-sm">
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>เลือก 2.ตัดจ่าย.xls</span>
                </div>
              </div>

              {/* 3. ขาย */}
              <div
                onClick={() => triggerBrowseForType("SALE")}
                className={`group cursor-pointer rounded-2xl p-4 border-2 transition-all hover:scale-[1.02] ${
                  selectedFileType === "SALE" && selectedFile
                    ? "border-purple-600 bg-purple-50/60 shadow-lg ring-2 ring-purple-500/30"
                    : "border-gray-200 hover:border-purple-500 hover:bg-purple-50/30 hover:shadow-md"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm group-hover:text-purple-600">
                        3. ไฟล์ขาย
                      </h3>
                      <p className="text-[11px] text-gray-500">3.ขาย.xls</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                    Daily Sale
                  </span>
                </div>

                <div className="mt-3 space-y-0.5 text-[11px] text-gray-600 bg-white/80 p-2.5 rounded-xl border border-gray-100">
                  <p>• <b>Col B</b>: รหัสสินค้า</p>
                  <p>• <b>Col E</b>: คำนวณสูตร <b>(E/3)+E</b></p>
                  <p className="text-purple-700 font-bold">➔ ปรับปรุงเป็นยอดขาย</p>
                </div>

                <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 py-2 text-xs font-bold text-white group-hover:bg-purple-700 transition-colors shadow-sm">
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>เลือก 3.ขาย.xls</span>
                </div>
              </div>

              {/* 4. ปริมาณการใช้ & คู่ค้า */}
              <div
                onClick={() => triggerBrowseForType("USAGE")}
                className={`group cursor-pointer rounded-2xl p-4 border-2 transition-all hover:scale-[1.02] ${
                  selectedFileType === "USAGE" && selectedFile
                    ? "border-amber-600 bg-amber-50/60 shadow-lg ring-2 ring-amber-500/30"
                    : "border-gray-200 hover:border-amber-500 hover:bg-amber-50/30 hover:shadow-md"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                      <Calculator className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm group-hover:text-amber-700">
                        4. ปริมาณการใช้
                      </h3>
                      <p className="text-[11px] text-gray-500">4.ปริมาณการใช้.xls</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    Sheet ปริมาณการใช้
                  </span>
                </div>

                <div className="mt-3 space-y-0.5 text-[11px] text-gray-600 bg-white/80 p-2.5 rounded-xl border border-gray-100">
                  <p>• <b>เดือน 6, 7, 8</b>: ยอดใช้ 3 เดือน</p>
                  <p>• <b>หมวดสินค้า</b> & <b>บริษัทคู่ค้า</b></p>
                  <p className="text-amber-800 font-bold">➔ ผสานคำนวณ Sheet เหลือ</p>
                </div>

                <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 py-2 text-xs font-bold text-white group-hover:bg-amber-700 transition-colors shadow-sm">
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>เลือก 4.ปริมาณการใช้.xls</span>
                </div>
              </div>
            </div>
          </div>

          {/* Instant Error Modal */}
          {showErrorModal && validationResult && !validationResult.isValid && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-red-200 text-center">
                <button
                  onClick={() => setShowErrorModal(false)}
                  className="absolute right-4 top-4 rounded-full p-2 text-gray-400 hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-600 mb-4 animate-bounce">
                  <AlertOctagon className="h-10 w-10" />
                </div>

                <h3 className="text-xl font-bold text-gray-900">รูปแบบไฟล์ไม่ถูกต้อง!</h3>
                <p className="mt-2 text-xs text-gray-600">
                  ไฟล์ <b className="text-gray-900">"{selectedFile?.name}"</b> ไม่ตรงตามโครงสร้างที่กำหนด
                </p>

                <div className="mt-4 rounded-2xl bg-red-50 p-4 text-left border border-red-200 space-y-1.5">
                  <div className="text-xs font-bold text-red-900 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                    สาเหตุที่ไม่สามารถนำเข้าได้:
                  </div>
                  {validationResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-700 pl-5 leading-relaxed font-medium">
                      • {err.message}
                    </p>
                  ))}
                </div>

                <div className="mt-6 flex justify-center gap-3">
                  <button
                    onClick={() => triggerBrowseForType(selectedFileType)}
                    className="rounded-xl bg-red-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-red-700 shadow-md shadow-red-500/30"
                  >
                    เลือกไฟล์ใหม่
                  </button>
                  <button
                    onClick={() => setShowErrorModal(false)}
                    className="rounded-xl border border-gray-300 px-5 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    ปิด
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Success Message Banner */}
          {importSuccessMessage && (
            <div className="rounded-2xl bg-emerald-50 p-5 border border-emerald-200 text-emerald-800 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">นำเข้าข้อมูลสำเร็จ!</h4>
                  <p className="text-xs text-emerald-700">{importSuccessMessage}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab("overview")}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm"
              >
                ดูในภาพรวมเปรียบเทียบ (Sheet เหลือ) ➔
              </button>
            </div>
          )}

          {/* Validation Result & Duplicate Banner */}
          {validationResult && (
            <div className="space-y-6">
              {validationResult.isValid && validationResult.duplicateInfo?.isDuplicate && (
                <div className="rounded-2xl bg-amber-50 p-5 border-2 border-amber-300 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800 flex-shrink-0 mt-0.5">
                      <ShieldAlert className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-amber-950 text-sm">
                        ⚠️ ตรวจพบข้อมูลประเภทนี้อยู่ในระบบแล้ว ({validationResult.duplicateInfo.existingBatchCount} ชุดเดิม)
                      </h4>
                      <p className="text-xs text-amber-800 mt-1">
                        {validationResult.duplicateInfo.duplicateMessage}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleClearData(selectedFileType)}
                    disabled={isClearing}
                    className="flex items-center gap-1.5 rounded-xl bg-amber-600/90 hover:bg-amber-700 px-4 py-2 text-xs font-bold text-white transition-colors shadow-sm flex-shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{isClearing ? "กำลังลบ..." : "ลบข้อมูลเดิมของประเภทนี้ทันที"}</span>
                  </button>
                </div>
              )}

              {/* Validation Status & Mode Selector */}
              <div
                className={`rounded-2xl p-6 border shadow-sm ${
                  validationResult.isValid ? "bg-emerald-50/40 border-emerald-200" : "bg-red-50/50 border-red-200"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {validationResult.isValid ? (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 flex-shrink-0">
                        <CheckCircle2 className="h-6 w-6" />
                      </div>
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 flex-shrink-0">
                        <XCircle className="h-6 w-6" />
                      </div>
                    )}
                    <div>
                      <h3 className="text-base md:text-lg font-bold text-gray-900">
                        {validationResult.isValid
                          ? `✅ โครงสร้างไฟล์ "${selectedFile?.name}" ถูกต้อง พร้อมนำเข้า`
                          : "❌ โครงสร้างไฟล์ไม่ถูกต้อง ไม่อนุญาตให้นำเข้า"}
                      </h3>
                      <p className="text-xs text-gray-600">
                        Sheet: <b>{validationResult.sheetName || "-"}</b> | สแกนทั้งหมด{" "}
                        <b>{formatNum(validationResult.totalRows)}</b> แถว | พบข้อมูลตรงเงื่อนไข{" "}
                        <b className="text-emerald-700 font-bold">
                          {formatNum(validationResult.validRows)}
                        </b>{" "}
                        แถว
                      </p>
                    </div>
                  </div>

                  {validationResult.isValid && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white p-2.5 rounded-2xl border border-gray-200 shadow-sm">
                      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => setImportMode("OVERWRITE")}
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition-all ${
                            importMode === "OVERWRITE"
                              ? "bg-blue-600 text-white shadow-sm"
                              : "text-gray-600 hover:text-gray-900"
                          }`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>🔄 แทนที่รอบเดิม</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setImportMode("APPEND")}
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition-all ${
                            importMode === "APPEND"
                              ? "bg-blue-600 text-white shadow-sm"
                              : "text-gray-600 hover:text-gray-900"
                          }`}
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          <span>➕ เพิ่มต่อยอด</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="หมายเหตุเพิ่มเติม"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none max-w-[140px]"
                        />
                        <button
                          onClick={handleConfirmImport}
                          disabled={isImporting}
                          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap"
                        >
                          {isImporting ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              <span>กำลังบันทึก...</span>
                            </>
                          ) : (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              <span>บันทึกเข้า DB ({formatNum(validationResult.validRows)})</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Preview Table */}
              {validationResult.previewRows.length > 0 && (
                <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Eye className="h-4 w-4 text-blue-600" />
                        ตัวอย่างข้อมูลที่สกัดได้จากไฟล์ (พรีวิว 50 แถวแรก)
                      </h3>
                      <p className="text-xs text-gray-500">
                        พร้อมนำไปผสานเข้าตารางวิเคราะห์สต็อกและการคำนวณ Sheet เหลือ
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                      {validationResult.previewRows.length} รายการตัวอย่าง
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-left text-xs text-gray-600">
                      <thead className="bg-slate-50 text-gray-800 font-semibold border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-2.5">#</th>
                          <th className="px-3 py-2.5 bg-blue-50 text-blue-900">รหัสสินค้า</th>
                          <th className="px-3 py-2.5">รายการ</th>
                          <th className="px-3 py-2.5">หน่วย</th>
                          {selectedFileType === "USAGE" ? (
                            <>
                              <th className="px-3 py-2.5 text-right font-mono">ใช้ 6</th>
                              <th className="px-3 py-2.5 text-right font-mono">ใช้ 7</th>
                              <th className="px-3 py-2.5 text-right font-mono">ใช้ 8</th>
                              <th className="px-3 py-2.5 text-right font-bold text-indigo-900">MAX</th>
                              <th className="px-3 py-2.5 text-right font-bold text-indigo-900">AVG</th>
                              <th className="px-3 py-2.5">หมวด</th>
                              <th className="px-3 py-2.5">บริษัท</th>
                            </>
                          ) : (
                            <th className="px-3 py-2.5">ข้อมูลหลัก</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {validationResult.previewRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/80">
                            <td className="px-3 py-2 text-gray-400 font-mono">{row.rowIndex}</td>
                            <td className="px-3 py-2 font-bold text-blue-700 font-mono bg-blue-50/20">
                              {row.itemCode}
                            </td>
                            <td className="px-3 py-2 max-w-[240px] truncate text-gray-800 font-medium">
                              {row.itemName}
                            </td>
                            <td className="px-3 py-2">{row.unit}</td>
                            {selectedFileType === "USAGE" && (
                              <>
                                <td className="px-3 py-2 text-right font-mono">{row.usageMonth1}</td>
                                <td className="px-3 py-2 text-right font-mono">{row.usageMonth2}</td>
                                <td className="px-3 py-2 text-right font-mono">{row.usageMonth3}</td>
                                <td className="px-3 py-2 text-right font-bold text-indigo-700 bg-indigo-50/30">
                                  {row.maxUsage}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-600 bg-indigo-50/10">
                                  {row.avgUsage}
                                </td>
                                <td className="px-3 py-2 text-gray-600">{row.category}</td>
                                <td className="px-3 py-2 max-w-[200px] truncate text-gray-500">
                                  {row.supplier}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BALANCE */}
      {activeTab === "balance" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหารายการคงเหลือ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-2 text-xs md:text-sm focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleClearData("BALANCE")}
                disabled={isClearing}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>ล้างข้อมูลคงเหลือทั้งหมด</span>
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50 text-gray-800 font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">รหัสสินค้า</th>
                  <th className="px-4 py-3">ชื่อสินค้า</th>
                  <th className="px-4 py-3">หน่วย</th>
                  <th className="px-4 py-3 text-right">จำนวนคงเหลือ (Col E)</th>
                  <th className="px-4 py-3 text-right">Min Stock (Col H)</th>
                  <th className="px-4 py-3 text-right">ราคา/หน่วย</th>
                  <th className="px-4 py-3 text-right">ต้นทุนรวม</th>
                  <th className="px-4 py-3">ไฟล์นำเข้า</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tableData.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/80">
                    <td className="px-4 py-2.5 font-bold text-blue-700 font-mono">{item.itemCode}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{item.itemName || "-"}</td>
                    <td className="px-4 py-2.5">{item.unit || "-"}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                      {formatNum(item.balanceQty)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-amber-700 font-semibold">
                      {formatNum(item.minQty)}
                    </td>
                    <td className="px-4 py-2.5 text-right">{formatNum(item.unitPrice, 2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatNum(item.totalCost, 2)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{item.batch?.fileName || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: DISPENSE */}
      {activeTab === "dispense" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหารายการตัดจ่าย..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-2 text-xs md:text-sm focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleClearData("DISPENSE")}
                disabled={isClearing}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>ล้างข้อมูลตัดจ่ายทั้งหมด</span>
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50 text-gray-800 font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">รหัสสินค้า</th>
                  <th className="px-4 py-3">ชื่อสินค้า</th>
                  <th className="px-4 py-3">หน่วย</th>
                  <th className="px-4 py-3 text-right">จำนวนเบิกเดิม (Col G)</th>
                  <th className="px-4 py-3 text-right bg-emerald-50 text-emerald-900 font-bold">
                    ยอดปรับปรุง ((G/3)+G)
                  </th>
                  <th className="px-4 py-3 text-right">ราคา/หน่วย</th>
                  <th className="px-4 py-3 text-right">ต้นทุนรวม</th>
                  <th className="px-4 py-3">ไฟล์นำเข้า</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tableData.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/80">
                    <td className="px-4 py-2.5 font-bold text-blue-700 font-mono">{item.itemCode}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{item.itemName || "-"}</td>
                    <td className="px-4 py-2.5">{item.unit || "-"}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatNum(item.rawQty)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-700 bg-emerald-50/50 font-mono">
                      {formatNum(item.adjustedQty, 2)}
                    </td>
                    <td className="px-4 py-2.5 text-right">{formatNum(item.unitPrice, 2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatNum(item.totalCost, 2)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{item.batch?.fileName || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: SALE */}
      {activeTab === "sale" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหารายการขาย..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-2 text-xs md:text-sm focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleClearData("SALE")}
                disabled={isClearing}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>ล้างข้อมูลยอดขายทั้งหมด</span>
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50 text-gray-800 font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">รหัสสินค้า</th>
                  <th className="px-4 py-3">ชื่อสินค้า</th>
                  <th className="px-4 py-3">หน่วย</th>
                  <th className="px-4 py-3 text-right">จำนวนขายเดิม (Col E)</th>
                  <th className="px-4 py-3 text-right bg-purple-50 text-purple-900 font-bold">
                    ยอดปรับปรุง ((E/3)+E)
                  </th>
                  <th className="px-4 py-3 text-right">ยอดขาย (บาท)</th>
                  <th className="px-4 py-3 text-right">ต้นทุน (บาท)</th>
                  <th className="px-4 py-3">ไฟล์นำเข้า</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tableData.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/80">
                    <td className="px-4 py-2.5 font-bold text-blue-700 font-mono">{item.itemCode}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{item.itemName || "-"}</td>
                    <td className="px-4 py-2.5">{item.unit || "-"}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatNum(item.rawQty)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-purple-700 bg-purple-50/50 font-mono">
                      {formatNum(item.adjustedQty, 2)}
                    </td>
                    <td className="px-4 py-2.5 text-right">{formatNum(item.saleAmount, 2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatNum(item.costAmount, 2)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{item.batch?.fileName || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: USAGE & VENDOR */}
      {activeTab === "usage" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหาข้อมูลปริมาณการใช้, หมวด, บริษัท..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-2 text-xs md:text-sm focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleClearData("USAGE")}
                disabled={isClearing}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>ล้างข้อมูลปริมาณการใช้ทั้งหมด</span>
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-amber-50 text-amber-950 font-semibold border-b border-amber-200">
                <tr>
                  <th className="px-4 py-3">รหัสสินค้า</th>
                  <th className="px-4 py-3">ชื่อสินค้า</th>
                  <th className="px-4 py-3">หน่วย</th>
                  <th className="px-4 py-3 text-right">ใช้เดือน 6</th>
                  <th className="px-4 py-3 text-right">ใช้เดือน 7</th>
                  <th className="px-4 py-3 text-right">ใช้เดือน 8</th>
                  <th className="px-4 py-3">หมวดสินค้า</th>
                  <th className="px-4 py-3">บริษัทผู้จัดจำหน่าย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tableData.map((item, idx) => (
                  <tr key={idx} className="hover:bg-amber-50/20">
                    <td className="px-4 py-2.5 font-bold text-amber-900 font-mono">{item.itemCode}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{item.itemName || "-"}</td>
                    <td className="px-4 py-2.5">{item.unit || "-"}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatNum(item.usageMonth1, 1)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatNum(item.usageMonth2, 1)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatNum(item.usageMonth3, 2)}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-700">
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px]">{item.category || "-"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-[250px] truncate">{item.supplier || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: BATCHES */}
      {activeTab === "batches" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="text-xs text-gray-500 font-medium">
              แสดงประวัติและชุดข้อมูลที่นำเข้าทั้งหมด ({batches.length} ชุด)
            </div>
            <button
              onClick={() => handleClearData("ALL")}
              disabled={isClearing}
              className="flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 shadow-sm"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>ล้างประวัติและข้อมูลทั้งหมด (Reset Database)</span>
            </button>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50 text-gray-800 font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">วันที่และเวลานำเข้า</th>
                  <th className="px-4 py-3">ประเภทไฟล์</th>
                  <th className="px-4 py-3">ชื่อไฟล์</th>
                  <th className="px-4 py-3 text-right">จำนวนแถวที่นำเข้า</th>
                  <th className="px-4 py-3">หมายเหตุ</th>
                  <th className="px-4 py-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-700">
                      {new Date(batch.createdAt).toLocaleString("th-TH")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          batch.fileType === "BALANCE"
                            ? "bg-blue-100 text-blue-700"
                            : batch.fileType === "DISPENSE"
                            ? "bg-emerald-100 text-emerald-700"
                            : batch.fileType === "SALE"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {batch.fileType === "BALANCE"
                          ? "1. คงเหลือ"
                          : batch.fileType === "DISPENSE"
                          ? "2. ตัดจ่าย"
                          : batch.fileType === "SALE"
                          ? "3. ขาย"
                          : "4. ปริมาณการใช้"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{batch.fileName}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                      {formatNum(batch.importedRows)} แถว
                    </td>
                    <td className="px-4 py-3 text-gray-500">{batch.note || "-"}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDeleteBatch(batch.id)}
                        className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 transition-colors"
                        title="ลบชุดข้อมูลนี้"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
