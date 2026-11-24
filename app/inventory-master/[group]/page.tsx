"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
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
import {
  type InventoryDataGroup,
  DATA_GROUP_LABELS,
  formatDataDate,
} from "@/lib/inventory-data-group";
import {
  type BuddhistMonth,
  alignUsageMonthsToLabels,
  buildMonthRangeBack,
  defaultUsageMonthRange,
  formatBuddhistMonthLabel,
  usageEndMonthOptions,
} from "@/lib/usage-month-range";

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
  /** หัวคอลัมน์เดือนจากไฟล์ เช่น ["กันยายน 2569","ตุลาคม 2569"] */
  usageMonthLabels?: string[];
  duplicateInfo?: {
    isDuplicate: boolean;
    existingBatchCount: number;
    sameDateBatchCount?: number;
    latestBatch: any;
    duplicateMessage: string;
  };
}

const GROUP_SLUG_MAP: Record<string, InventoryDataGroup> = {
  ya: "MAINSTORE",
  vesaphan: "PASDU",
};

export default function InventoryMasterPage() {
  const params = useParams();
  const router = useRouter();
  const groupSlug = String(params?.group || "ya");
  const lockedGroup: InventoryDataGroup =
    GROUP_SLUG_MAP[groupSlug] || "MAINSTORE";
  const isPasdu = lockedGroup === "PASDU";
  // ธีมสีแยกชัด: ยาและเวชภัณฑ์ = น้ำเงิน, พัสดุ = เขียวมรกต
  const theme = isPasdu
    ? {
        header: "from-teal-700 via-emerald-800 to-teal-900",
        metricMuted: "text-teal-100",
        periodLabel: "text-teal-100",
        hint: "text-teal-100",
        tabActive: "bg-teal-700 text-white shadow-md shadow-teal-600/25",
        badge: "bg-emerald-300 text-emerald-950 border-emerald-200",
        pageBg: "from-teal-50/50 via-white to-emerald-50/40",
        importBorder: "border-teal-200 bg-teal-50/40",
        importIcon: "text-teal-700",
        importBadge: "bg-teal-700 text-white",
        importBtn: "bg-teal-700 hover:bg-teal-800",
      }
    : {
        header: "from-blue-700 via-indigo-700 to-sky-800",
        metricMuted: "text-blue-200",
        periodLabel: "text-blue-100",
        hint: "text-blue-100",
        tabActive: "bg-blue-600 text-white shadow-md shadow-blue-500/20",
        badge: "bg-white text-sky-800 border-white/40",
        pageBg: "from-blue-50/40 via-white to-sky-50/30",
        importBorder: "border-sky-200 bg-sky-50/40",
        importIcon: "text-sky-700",
        importBadge: "bg-sky-600 text-white",
        importBtn: "bg-sky-600 hover:bg-sky-700",
      };

  useEffect(() => {
    if (!GROUP_SLUG_MAP[groupSlug]) {
      router.replace("/inventory-master/ya");
    }
  }, [groupSlug, router]);

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

  // Helper แปลง period เช่น "2026-10" -> "ตุลาคม 2569" + วันที่ของข้อมูลถ้ามี
  const formatPeriodLabel = (p: string, withDataDate = true) => {
    if (!p || p === "ALL") return "ทุกงวดเดือน (ภาพรวมสะสม)";
    const parts = p.split("-");
    if (parts.length < 2) return p;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const monthsTh = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
    ];
    const monthName = monthsTh[m - 1] || `${m}`;
    const thaiYear = y + 543;
    const base = `${monthName} ${thaiYear}`;
    if (!withDataDate) return `${base} (${p})`;
    const dataDate = periodDataDates[p];
    if (dataDate) return `${formatDataDate(dataDate)} · ${base}`;
    return `${base} (${p})`;
  };

  // คำนวณเดือนปัจจุบัน และเดือนถัดไป เป็นค่าเริ่มต้น
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

  // Period filter & Upload period state
  const [selectedPeriod, setSelectedPeriod] = useState<string>("LATEST");
  const [availablePeriods, setAvailablePeriods] = useState<string[]>(["2026-10"]);
  /** วันที่ของข้อมูลล่าสุดต่องวด (จากไฟล์คงเหลือ/ตัดจ่าย/ขาย) YYYY-MM-DD */
  const [periodDataDates, setPeriodDataDates] = useState<Record<string, string>>({});
  const [importPeriod, setImportPeriod] = useState<string>(currentMonthStr);
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [importDataDate, setImportDataDate] = useState<string>(todayStr);
  // กลุ่มถูกล็อกจากเมนูย่อย (ya / vesaphan) — แยกการแสดงผลและการนำเข้าโดยสิ้นเชิง
  const [importDataGroup, setImportDataGroup] = useState<InventoryDataGroup>(lockedGroup);
  const [selectedDataGroup, setSelectedDataGroup] = useState<InventoryDataGroup>(lockedGroup);

  // วันที่ของข้อมูลเป็นตัวกำหนดชุดข้อมูล — งวดเดือนตามวันที่ที่เลือก
  const applyImportDataDate = (dateStr: string) => {
    if (!dateStr) return;
    setImportDataDate(dateStr);
    const periodFromDate = dateStr.slice(0, 7); // YYYY-MM
    if (/^\d{4}-\d{2}$/.test(periodFromDate)) {
      setImportPeriod(periodFromDate);
    }
  };

  // เมื่อเปลี่ยนวันที่ของข้อมูล ให้เช็คว่ามีชุดวันเดียวกันอยู่หรือไม่ (เปิด/ปิดโหมดแทนที่-เพิ่มต่อยอด)
  useEffect(() => {
    fetchLatestFiles();
  }, [importDataDate, selectedDataGroup]);

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
  const [isExporting, setIsExporting] = useState(false);
  const [tableData, setTableData] = useState<any[]>([]);
  /** หัวคอลัมน์เดือนจากไฟล์นำเข้า (ใช้จับคู่ค่า) */
  const [importedUsageMonthLabels, setImportedUsageMonthLabels] = useState<string[]>([]);
  /** จำนวนเดือนที่แสดง (ดีฟอลต์ 3) */
  const [usageMonthCount, setUsageMonthCount] = useState(3);
  /** เดือนสิ้นสุดของช่วงแสดง (ดีฟอลต์ = เดือนปัจจุบัน พ.ศ.) */
  const [usageRangeEnd, setUsageRangeEnd] = useState<BuddhistMonth>(
    () => defaultUsageMonthRange(3).end
  );
  const usageDisplayMonths = buildMonthRangeBack(usageRangeEnd, usageMonthCount);
  const usageMonthLabels = usageDisplayMonths.map(formatBuddhistMonthLabel);
  const usageEndOptions = usageEndMonthOptions(18);
  const usageMonthCountOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const [metrics, setMetrics] = useState<any>({
    totalUniqueCodes: 0,
    totalBalanceRecords: 0,
    totalDispenseRecords: 0,
    totalSaleRecords: 0,
    totalUsageRecords: 0,
    needOrderCount: 0,
    sufficientCount: 0,
  });
  const [filterOptions, setFilterOptions] = useState<{ categories: string[]; suppliers: string[]; units?: string[] }>({
    categories: [],
    suppliers: [],
    units: [],
  });

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedSupplier, setSelectedSupplier] = useState("ALL");
  const [selectedUnit, setSelectedUnit] = useState("ALL");
  const [stockStatus, setStockStatus] = useState<"ALL" | "NEED_ORDER" | "SUFFICIENT">("ALL");
  // balance tab: false = แสดงเฉพาะรายการที่มี Min Stock, true = แสดง min เป็น 0 / ว่าง
  const [showMinZero, setShowMinZero] = useState(false);
  // overview: กรองคอลัมน์เหลือ / MIN แยกกัน — HAS_VALUE | INCLUDE_EMPTY | EMPTY_ONLY (ดีฟอลต์ = รวม -)
  const [balanceEmptyFilter, setBalanceEmptyFilter] = useState<"HAS_VALUE" | "INCLUDE_EMPTY" | "EMPTY_ONLY">(
    "INCLUDE_EMPTY"
  );
  const [minEmptyFilter, setMinEmptyFilter] = useState<"HAS_VALUE" | "INCLUDE_EMPTY" | "EMPTY_ONLY">(
    "HAS_VALUE"
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Batches state
  const [batches, setBatches] = useState<any[]>([]);
  const [latestFiles, setLatestFiles] = useState<
    Record<string, { fileName: string; createdAt?: string; period?: string | null } | null>
  >({});
  const [sameDateCounts, setSameDateCounts] = useState<Record<InventoryFileType, number>>({
    BALANCE: 0,
    DISPENSE: 0,
    SALE: 0,
    USAGE: 0,
  });

  // ล็อกกลุ่มตามเมนูย่อย — สลับเมนู = ชุดข้อมูลคนละส่วน
  useEffect(() => {
    setSelectedDataGroup(lockedGroup);
    setImportDataGroup(lockedGroup);
    setActiveTab("overview");
    setCurrentPage(1);
    setValidationResult(null);
    setSelectedFile(null);
    setImportSuccessMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [lockedGroup]);

  // แท็บอัปโหลดกลางเลิกใช้แล้ว — พาไปหน้าข้อมูลแทน
  useEffect(() => {
    if (activeTab === "upload") {
      setActiveTab("balance");
    }
  }, [activeTab]);

  // Fetch data when switching tabs or changing filters / sorting / period / dataGroup
  useEffect(() => {
    if (activeTab === "upload") return;
    fetchTabData();
    fetchLatestFiles();
  }, [activeTab, selectedPeriod, selectedDataGroup, currentPage, searchTerm, selectedCategory, selectedSupplier, selectedUnit, stockStatus, showMinZero, balanceEmptyFilter, minEmptyFilter, usageMonthCount, usageRangeEnd, sortBy, sortOrder]);

  const fetchLatestFiles = async () => {
    try {
      const qs = new URLSearchParams({
        tab: "upload",
        dataGroup: selectedDataGroup,
      });
      if (importDataDate) qs.set("dataDate", importDataDate);
      const res = await fetch(`/api/inventory-analytics/overview?${qs.toString()}`);
      const data = await res.json();
      if (res.ok) {
        if (data.latestFiles) setLatestFiles(data.latestFiles);
        if (data.sameDateCounts) setSameDateCounts(data.sameDateCounts);
        if (data.availablePeriods && data.availablePeriods.length > 0) {
          setAvailablePeriods(data.availablePeriods);
        }
        if (data.periodDataDates && typeof data.periodDataDates === "object") {
          setPeriodDataDates(data.periodDataDates);
        }
      }
    } catch (error) {
      console.error("Error fetching latest files:", error);
    }
  };

  const fetchTabData = async (periodOverride?: string) => {
    setLoadingData(true);
    try {
      const queryParams = new URLSearchParams({
        tab: activeTab,
        period: periodOverride || selectedPeriod,
        dataGroup: selectedDataGroup,
        search: searchTerm,
        category: selectedCategory,
        supplier: selectedSupplier,
        unit: selectedUnit,
        stockStatus,
        sortBy,
        sortOrder,
        page: String(currentPage),
        limit: "50",
      });
      if (activeTab === "balance") {
        queryParams.set("minFilter", showMinZero ? "MIN_ZERO" : "HAS_VALUE");
      }
      if (activeTab === "overview") {
        queryParams.set("balanceEmpty", balanceEmptyFilter);
        queryParams.set("minEmpty", minEmptyFilter);
        queryParams.set("usageMonthCount", String(usageMonthCount));
        queryParams.set("usageEndYear", String(usageRangeEnd.year));
        queryParams.set("usageEndMonth", String(usageRangeEnd.month));
      }

      const res = await fetch(`/api/inventory-analytics/overview?${queryParams.toString()}`);
      const data = await res.json();
      if (res.ok) {
        if (data.availablePeriods && data.availablePeriods.length > 0) {
          setAvailablePeriods(data.availablePeriods);
        }
        if (data.periodDataDates && typeof data.periodDataDates === "object") {
          setPeriodDataDates(data.periodDataDates);
        }
        if (data.latestFiles) setLatestFiles(data.latestFiles);
        if (activeTab === "batches") {
          setBatches(data.batches || []);
        } else {
          setTableData(data.items || []);
          if (data.metrics) setMetrics(data.metrics);
          if (data.filterOptions) setFilterOptions(data.filterOptions);
          if (Array.isArray(data.usageMonthLabels) && data.usageMonthLabels.length > 0) {
            setImportedUsageMonthLabels(data.usageMonthLabels);
          }
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
  const renderSortIcon = (colKey: string, tone: "dark" | "light" = "dark") => {
    const active =
      tone === "dark" ? "text-amber-300" : "text-blue-600";
    if (sortBy !== colKey) {
      return <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-70 transition-opacity" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className={`h-3.5 w-3.5 ${active} font-bold`} />
    ) : (
      <ArrowDown className={`h-3.5 w-3.5 ${active} font-bold`} />
    );
  };

  /** หัวคอลัมน์คลิกเรียงได้ */
  const renderSortableTh = (
    colKey: string,
    label: ReactNode,
    opts?: { className?: string; align?: "left" | "right" | "center"; title?: string; tone?: "dark" | "light" }
  ) => {
    const align = opts?.align || "left";
    const tone = opts?.tone || "light";
    return (
      <th
        onClick={() => handleSort(colKey)}
        className={`group cursor-pointer select-none transition-colors hover:bg-black/5 ${opts?.className || "px-4 py-3"}`}
        title={opts?.title || "คลิกเพื่อเรียง"}
      >
        <div
          className={`flex items-center gap-1 ${
            align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-between"
          }`}
        >
          <span>{label}</span>
          {renderSortIcon(colKey, tone)}
        </div>
      </th>
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
      formData.append("period", importPeriod);
      formData.append("dataGroup", selectedDataGroup);
      formData.append("dataDate", importDataDate);

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
    if (!importDataDate) {
      alert("กรุณาเลือกวันที่ของข้อมูลก่อนนำเข้า");
      return;
    }

    const sameDateExists =
      (validationResult.duplicateInfo?.sameDateBatchCount ??
        sameDateCounts[selectedFileType] ??
        0) > 0;
    const effectiveImportMode =
      sameDateExists && importMode === "OVERWRITE" ? "OVERWRITE" : "APPEND";

    if (effectiveImportMode === "OVERWRITE") {
      const typeName =
        selectedFileType === "BALANCE"
          ? "1. ยอดคงเหลือ"
          : selectedFileType === "DISPENSE"
          ? "2. ยอดตัดจ่าย"
          : selectedFileType === "SALE"
          ? "3. ยอดขาย"
          : "4. ปริมาณการใช้";

      const confirmMsg = `ยืนยันการแทนที่ข้อมูลเดิมของ "${typeName}" กลุ่ม [${DATA_GROUP_LABELS[selectedDataGroup]}] วันที่ของข้อมูล ${formatDataDate(importDataDate)} ใช่หรือไม่?\n(ลบเฉพาะชุดที่วันเดียวกัน วันอื่นไม่กระทบ)`;
      if (!confirm(confirmMsg)) return;
    }

    setIsImporting(true);
    setImportSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("fileType", selectedFileType);
      formData.append("importMode", effectiveImportMode);
      formData.append("period", importPeriod);
      formData.append("dataGroup", selectedDataGroup);
      formData.append("dataDate", importDataDate);
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
        // ใช้งวดจาก API หลังนำเข้า (อย่าพึ่ง state เก่า — ไม่งั้นตารางว่าง)
        const periodAfterImport = (data.period as string) || importPeriod;
        setSelectedPeriod(periodAfterImport);
        setAvailablePeriods((prev) => {
          if (!prev.includes(periodAfterImport)) {
            return [periodAfterImport, ...prev].sort().reverse();
          }
          return prev;
        });
        setCurrentPage(1);
        fetchLatestFiles();
        await fetchTabData(periodAfterImport);
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

  // Direct Clear Data from Database (รองรับลบเฉพาะงวดเดือน+กลุ่มที่เลือก)
  const handleClearData = async (
    fileType: "BALANCE" | "DISPENSE" | "SALE" | "USAGE" | "ALL",
    targetPeriod?: string
  ) => {
    // แปลง LATEST -> งวดจริง (เช่น 2026-11) เพราะใน DB ไม่มี period="LATEST"
    const resolvePeriod = (p?: string) => {
      if (p === undefined) return undefined;
      if (p === "ALL") return "ALL";
      if (p === "LATEST") return availablePeriods[0] || currentMonthStr;
      return p;
    };

    const periodToClear =
      targetPeriod !== undefined
        ? resolvePeriod(targetPeriod)
        : selectedPeriod === "ALL"
          ? "ALL"
          : resolvePeriod(selectedPeriod);

    const groupForClear = selectedDataGroup;
    const periodText =
      !periodToClear || periodToClear === "ALL"
        ? " ทั้งหมดทุกงวดเดือน"
        : ` ในงวด [${formatPeriodLabel(periodToClear)}]`;
    const groupText = ` กลุ่ม [${DATA_GROUP_LABELS[groupForClear]}]`;
    const typeName =
      fileType === "BALANCE"
        ? "1. ยอดคงเหลือ"
        : fileType === "DISPENSE"
        ? "2. ยอดตัดจ่าย"
        : fileType === "SALE"
        ? "3. ยอดขาย"
        : fileType === "USAGE"
        ? "4. ปริมาณการใช้"
        : "ข้อมูลรายงานทั้งหมด";

    if (
      !confirm(
        `⚠️ คุณแน่ใจหรือไม่ว่าต้องการลบ "${typeName}"${groupText}${periodText} ออกจากฐานข้อมูล?\n(ระบบจะลบเฉพาะกลุ่ม+งวดที่ระบุ ข้อมูลกลุ่ม/งวดอื่นจะไม่ได้รับผลกระทบ)`
      )
    ) {
      return;
    }

    setIsClearing(true);
    try {
      const qs = new URLSearchParams({
        fileType,
        dataGroup: groupForClear,
      });
      if (periodToClear) qs.set("period", periodToClear);

      const res = await fetch(`/api/inventory-analytics/clear?${qs.toString()}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if ((data.deletedBatches ?? 0) === 0) {
          alert(
            data.message ||
              "ไม่พบชุดข้อมูลที่ตรงเงื่อนไขสำหรับลบ (อาจถูกลบไปแล้ว หรืองวด/กลุ่มไม่ตรง)"
          );
        } else {
          alert(data.message || "ลบข้อมูลออกจากฐานข้อมูลสำเร็จ");
        }
        if (activeTab === "upload") {
          setValidationResult(null);
          setSelectedFile(null);
          fetchLatestFiles();
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

  // Handle inline change for pending delivery (ค้างส่ง)
  const handlePendingDeliveryChange = (itemCode: string, value: string) => {
    const numericVal = value === "" ? 0 : Math.max(0, parseFloat(value) || 0);

    setTableData((prev) =>
      prev.map((row) => {
        if (row.itemCode === itemCode) {
          const rawNeeded = row.diff < 0 ? Math.abs(row.diff) : 0;
          const newSuggested = Math.max(0, Math.ceil(rawNeeded - numericVal));
          return {
            ...row,
            pendingDelivery: numericVal,
            suggestedOrder: newSuggested,
          };
        }
        return row;
      })
    );
  };

  // Handle save pending delivery to DB on blur or Enter
  const handlePendingDeliveryBlur = async (itemCode: string, qty: number) => {
    try {
      await fetch("/api/inventory-analytics/pending-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemCode, qty }),
      });
    } catch (error) {
      console.error("Error saving pending delivery to DB:", error);
    }
  };

  // Export to Excel in exact Sheet "เหลือ" format (ดึงข้อมูลทั้งหมดตามเงื่อนไขตัวกรอง)
  const handleExportExcel = async () => {
    if (totalCount === 0 && tableData.length === 0) {
      alert("ไม่มีข้อมูลที่จะส่งออก");
      return;
    }

    setIsExporting(true);
    try {
      // ดึงข้อมูลทั้งหมดตามตัวกรองที่เลือกอยู่ (all=true)
      const queryParams = new URLSearchParams({
        tab: activeTab,
        period: selectedPeriod,
        dataGroup: selectedDataGroup,
        search: searchTerm,
        category: selectedCategory,
        supplier: selectedSupplier,
        unit: selectedUnit,
        stockStatus,
        sortBy,
        sortOrder,
        all: "true",
      });
      if (activeTab === "balance") {
        queryParams.set("minFilter", showMinZero ? "MIN_ZERO" : "HAS_VALUE");
      }
      if (activeTab === "overview") {
        queryParams.set("balanceEmpty", balanceEmptyFilter);
        queryParams.set("minEmpty", minEmptyFilter);
        queryParams.set("usageMonthCount", String(usageMonthCount));
        queryParams.set("usageEndYear", String(usageRangeEnd.year));
        queryParams.set("usageEndMonth", String(usageRangeEnd.month));
      }

      const res = await fetch(`/api/inventory-analytics/overview?${queryParams.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ไม่สามารถดึงข้อมูลสำหรับส่งออกได้");
      }

      const allItems: any[] = activeTab === "batches" ? (data.batches || []) : (data.items || []);
      if (allItems.length === 0) {
        alert("ไม่มีข้อมูลที่จะส่งออก");
        return;
      }

      if (activeTab === "overview") {
        const sourceLabels =
          Array.isArray(data.usageMonthLabels) && data.usageMonthLabels.length > 0
            ? data.usageMonthLabels
            : importedUsageMonthLabels;
        const exportLabels = usageMonthLabels;
        const exportRows = allItems.map((item, idx) => {
          const sourceMonths: (number | null)[] = Array.isArray(item.usageMonths)
            ? item.usageMonths
            : [item.usageMonth2];
          const months = alignUsageMonthsToLabels(exportLabels, sourceLabels, sourceMonths);
          const row: Record<string, any> = {
            ลำดับ: idx + 1,
            รหัสสินค้า: item.itemCode,
            รายการ: item.itemName,
            หน่วย: item.unit,
            "เหลือ (Col E)": item.balanceQty ?? "-",
            "MIN (Col H)": item.minQty ?? "-",
          };
          exportLabels.forEach((label: string, mi: number) => {
            const isThisMonth = mi === exportLabels.length - 1;
            const colName = isThisMonth ? `${label} (เดือนนี้)` : label;
            row[colName] = isThisMonth
              ? item.usageMonth3 ?? "-"
              : months[mi] ?? "-";
          });
          row["MAX"] = item.maxUsage ?? 0;
          row["AVG"] = item.avgUsage ?? 0;
          row["เหลือ - MAX"] = item.diff ?? 0;
          row["สถานะ"] = item.diff < 0 ? "ต้องสั่งซื้อ" : "พอใช้";
          row["ค้างส่ง"] = item.pendingDelivery ?? 0;
          row["สั่ง (แนะนำ)"] = item.suggestedOrder ?? 0;
          row["หมวด"] = item.category;
          row["บริษัท"] = item.supplier;
          return row;
        });

        const ws = xlsx.utils.json_to_sheet(exportRows);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "เหลือ");
        xlsx.writeFile(wb, `รายงานวิเคราะห์สต็อก_เหลือ_MAX_${new Date().toISOString().slice(0, 10)}.xlsx`);
      } else if (activeTab === "usage") {
        const sourceLabels =
          Array.isArray(data.usageMonthLabels) && data.usageMonthLabels.length > 0
            ? data.usageMonthLabels
            : importedUsageMonthLabels;
        const exportLabels = usageMonthLabels;
        const exportRows = allItems.map((item, idx) => {
          const sourceMonths: (number | null)[] = Array.isArray(item.usageMonths)
            ? item.usageMonths
            : [item.usageMonth2, item.usageMonth3];
          const months = alignUsageMonthsToLabels(exportLabels, sourceLabels, sourceMonths);
          const row: Record<string, any> = {
            ลำดับ: idx + 1,
            รหัสสินค้า: item.itemCode,
            รายการ: item.itemName,
            หน่วย: item.unit,
          };
          exportLabels.forEach((label: string, mi: number) => {
            const isThisMonth = mi === exportLabels.length - 1;
            const colName = isThisMonth ? `${label} (เดือนนี้)` : label;
            row[colName] = isThisMonth
              ? item.thisMonthUsage ?? item.usageMonth3 ?? "-"
              : months[mi] ?? "-";
          });
          row["หมวด"] = item.category;
          row["บริษัท"] = item.supplier;
          return row;
        });
        const ws = xlsx.utils.json_to_sheet(exportRows);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "ปริมาณการใช้");
        xlsx.writeFile(wb, `ปริมาณการใช้_${new Date().toISOString().slice(0, 10)}.xlsx`);
      } else {
        const ws = xlsx.utils.json_to_sheet(allItems);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, activeTab);
        xlsx.writeFile(wb, `inventory_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      }
    } catch (err: any) {
      console.error("Export error:", err);
      alert("เกิดข้อผิดพลาดในการส่งออกข้อมูล: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const FILE_TYPE_LABELS: Record<InventoryFileType, string> = {
    BALANCE: "1. คงเหลือ",
    DISPENSE: "2. ตัดจ่าย",
    SALE: "3. ขาย Daily",
    USAGE: "4. ปริมาณการใช้",
  };

  const renderTabImportSection = (fileType: InventoryFileType) => {
    const groupLabel = DATA_GROUP_LABELS[selectedDataGroup];
    const latest = latestFiles[fileType];
    const showWorkflow = selectedFileType === fileType && (validationResult || importSuccessMessage || isValidating);
    const sameDateExists = (sameDateCounts[fileType] || 0) > 0;
    const isUsageBaseline = fileType === "USAGE";

    return (
      <div
        className={`rounded-2xl border-2 p-4 shadow-sm space-y-3 ${theme.importBorder}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <UploadCloud className={`h-4 w-4 ${theme.importIcon}`} />
              <h3 className="text-sm font-bold text-gray-900">
                {isUsageBaseline
                  ? "ตั้งต้นข้อมูลปริมาณการใช้"
                  : `นำเข้า${FILE_TYPE_LABELS[fileType]}`}
              </h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${theme.importBadge}`}
              >
                กลุ่ม {groupLabel}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 max-w-2xl">
              {isUsageBaseline ? (
                <>
                  ใช้เป็นฐานตั้งต้นให้หน้าภาพรวมนำไปคำนวณร่วมกับคงเหลือ / ตัดจ่าย / ขาย
                  (เช่น MAX · AVG · สั่งซื้อ) · ส่วน <b>{groupLabel}</b>
                </>
              ) : (
                <>
                  นำเข้าเฉพาะส่วน <b>{groupLabel}</b> · สลับส่วนอื่นได้จากเมนูย่อยด้านซ้าย
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-gray-200 p-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-gray-600">วันที่ของข้อมูล</label>
            <div className="flex gap-1.5">
              <input
                type="date"
                value={importDataDate}
                onChange={(e) => {
                  if (e.target.value) applyImportDataDate(e.target.value);
                }}
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium"
              />
              <button
                type="button"
                onClick={() => applyImportDataDate(todayStr)}
                className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-200"
              >
                วันนี้
              </button>
            </div>
            <p className="text-[10px] text-gray-400 font-mono">{formatDataDate(importDataDate)}</p>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-gray-600">
              {isUsageBaseline ? "โหมดอัปเดตฐาน" : "โหมดนำเข้า"}
            </label>
            <div
              className={`flex items-center gap-1 p-1 rounded-lg text-[11px] font-semibold ${
                sameDateExists ? "bg-gray-100" : "bg-gray-50 opacity-50"
              }`}
              title={
                sameDateExists
                  ? `มีชุดวันที่ ${formatDataDate(importDataDate)} อยู่แล้ว — เลือกแทนที่หรือเพิ่มต่อยอดได้`
                  : `ยังไม่มีชุดวันที่ ${formatDataDate(importDataDate)} — จะบันทึกเป็นชุดวันใหม่ (ปิดโหมดแทนที่/เพิ่มต่อยอด)`
              }
            >
              <button
                type="button"
                disabled={!sameDateExists}
                onClick={() => setImportMode("OVERWRITE")}
                title={
                  sameDateExists
                    ? "ลบชุดเดิมที่วันเดียวกัน แล้วใส่ไฟล์ใหม่แทน"
                    : "ใช้ได้เมื่อมีข้อมูลวันที่เดียวกันอยู่แล้ว"
                }
                className={`rounded-md px-2.5 py-1.5 transition-all ${
                  !sameDateExists
                    ? "text-gray-400 cursor-not-allowed"
                    : importMode === "OVERWRITE"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                }`}
              >
                แทนที่
              </button>
              <button
                type="button"
                disabled={!sameDateExists}
                onClick={() => setImportMode("APPEND")}
                title={
                  sameDateExists
                    ? "ไม่ลบของเดิม เพิ่มเป็นชุดใหม่ในวันเดียวกัน"
                    : "ใช้ได้เมื่อมีข้อมูลวันที่เดียวกันอยู่แล้ว"
                }
                className={`rounded-md px-2.5 py-1.5 transition-all ${
                  !sameDateExists
                    ? "text-gray-400 cursor-not-allowed"
                    : importMode === "APPEND"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                }`}
              >
                เพิ่มต่อยอด
              </button>
            </div>
            <p className="text-[10px] text-gray-500">
              {sameDateExists
                ? `มี ${sameDateCounts[fileType]} ชุดวันที่ ${formatDataDate(importDataDate)}`
                : `คนละวัน → บันทึกเป็นชุดใหม่`}
            </p>
          </div>

          <div className="flex-1 min-w-[160px] space-y-1">
            <label className="block text-[11px] font-semibold text-gray-600">
              {isUsageBaseline ? "ไฟล์ฐานล่าสุดในกลุ่มนี้" : "ไฟล์ล่าสุดในกลุ่มนี้"}
            </label>
            <p className="text-xs text-gray-700 font-mono truncate" title={latest?.fileName || ""}>
              {latest?.fileName || (isUsageBaseline ? "ยังไม่ได้ตั้งต้น" : "ยังไม่ได้นำเข้า")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => triggerBrowseForType(fileType)}
            disabled={isValidating || isImporting}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 ${theme.importBtn}`}
          >
            {isValidating && selectedFileType === fileType ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                กำลังตรวจไฟล์...
              </>
            ) : (
              <>
                <UploadCloud className="h-3.5 w-3.5" />
                {isUsageBaseline ? "เลือกไฟล์ตั้งต้น" : "เลือกไฟล์นำเข้า"}
              </>
            )}
          </button>
        </div>

        {showWorkflow && importSuccessMessage && selectedFileType === fileType && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-xs font-bold">
                  {isUsageBaseline
                    ? `ตั้งต้นสำเร็จ · กลุ่ม ${groupLabel}`
                    : `นำเข้าสำเร็จ · กลุ่ม ${groupLabel}`}
                </p>
                <p className="text-[11px] text-emerald-700">{importSuccessMessage}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setImportSuccessMessage(null)}
              className="text-[11px] font-semibold text-emerald-800 hover:underline"
            >
              ปิด
            </button>
          </div>
        )}

        {showWorkflow && validationResult && selectedFileType === fileType && (
          <div
            className={`rounded-xl border px-3.5 py-3 space-y-3 ${
              validationResult.isValid ? "bg-white border-emerald-200" : "bg-red-50 border-red-200"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {validationResult.isValid ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <div>
                  <p className="text-xs font-bold text-gray-900">
                    {validationResult.isValid
                      ? isUsageBaseline
                        ? `ไฟล์พร้อมตั้งต้น · ${selectedFile?.name || ""}`
                        : `ไฟล์พร้อมนำเข้า · ${selectedFile?.name || ""}`
                      : "โครงสร้างไฟล์ไม่ถูกต้อง"}
                  </p>
                  <p className="text-[11px] text-gray-600">
                    {formatNum(validationResult.validRows)} แถว · วันที่{" "}
                    <span className="font-mono">{formatDataDate(importDataDate)}</span> · กลุ่ม{" "}
                    <b>{groupLabel}</b>
                    {isUsageBaseline ? " · ใช้เป็นฐานคำนวณ" : ""}
                  </p>
                </div>
              </div>

              {validationResult.isValid && (
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isImporting}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      กำลังนำเข้า...
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      นำเข้าข้อมูล ({formatNum(validationResult.validRows)})
                    </>
                  )}
                </button>
              )}
            </div>

            {!validationResult.isValid && validationResult.errors?.length > 0 && (
              <ul className="text-[11px] text-red-700 space-y-1 list-disc pl-4">
                {validationResult.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err.message}</li>
                ))}
              </ul>
            )}

            {validationResult.isValid && validationResult.duplicateInfo?.isDuplicate && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                {validationResult.duplicateInfo.duplicateMessage}
                {" · "}โหมดปัจจุบัน:{" "}
                <b>{importMode === "OVERWRITE" ? "แทนที่วันเดียวกัน" : "เพิ่มต่อยอดวันเดียวกัน"}</b>
              </p>
            )}
            {validationResult.isValid && !validationResult.duplicateInfo?.isDuplicate && (
              <p className="text-[11px] text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-2">
                ยังไม่มีชุดวันที่ <b className="font-mono">{formatDataDate(importDataDate)}</b> —
                จะบันทึกเป็นชุดวันใหม่ (ไม่ใช้โหมดแทนที่/เพิ่มต่อยอด)
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`-m-4 lg:-m-6 p-4 lg:p-6 min-h-full bg-gradient-to-br ${theme.pageBg}`}>
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
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${theme.header} p-6 text-white shadow-xl`}>
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur-md mb-2">
              <Database className="h-3.5 w-3.5" />
              <span>นำเข้าและวิเคราะห์รายงาน · {DATA_GROUP_LABELS[lockedGroup]}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {DATA_GROUP_LABELS[lockedGroup]} — วิเคราะห์ปริมาณการใช้ & สรุปยอดสั่งซื้อ
            </h1>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap gap-2.5">
            <div className="rounded-xl bg-white/10 backdrop-blur-md px-3.5 py-2 border border-white/10 text-center min-w-[85px]">
              <div className={`text-[11px] ${theme.metricMuted}`}>รหัสสินค้า</div>
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
              <div className={`text-[11px] ${theme.metricMuted}`}>1. คงเหลือ</div>
              <div className="text-lg font-bold">{formatNum(metrics?.totalBalanceRecords || 0)}</div>
            </div>

            <div className="rounded-xl bg-white/10 backdrop-blur-md px-3.5 py-2 border border-white/10 text-center min-w-[75px]">
              <div className={`text-[11px] ${theme.metricMuted}`}>2. ตัดจ่าย</div>
              <div className="text-lg font-bold">{formatNum(metrics?.totalDispenseRecords || 0)}</div>
            </div>

            <div className="rounded-xl bg-white/10 backdrop-blur-md px-3.5 py-2 border border-white/10 text-center min-w-[75px]">
              <div className={`text-[11px] ${theme.metricMuted}`}>3. ขาย</div>
              <div className="text-lg font-bold">{formatNum(metrics?.totalSaleRecords || 0)}</div>
            </div>

            <div className="rounded-xl bg-white/10 backdrop-blur-md px-3.5 py-2 border border-white/10 text-center min-w-[75px]">
              <div className={`text-[11px] ${theme.metricMuted}`}>4. ใช้ย้อนหลัง</div>
              <div className="text-lg font-bold">{formatNum(metrics?.totalUsageRecords || 0)}</div>
            </div>
          </div>
        </div>

        {/* Global Period Selector Bar */}
        <div className="relative z-10 mt-4 pt-3 border-t border-white/20 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-semibold ${theme.periodLabel} flex items-center gap-1.5`}>
              📅 งวดตามวันที่นำเข้า:
            </span>
            <div className="inline-flex items-center bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl px-2.5 py-1 border border-white/30 shadow-sm transition-all">
              <select
                value={selectedPeriod}
                onChange={(e) => {
                  setSelectedPeriod(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer [&>option]:text-gray-900 [&>option]:bg-white"
                title="งวดจากวันที่ของข้อมูลไฟล์คงเหลือ / ตัดจ่าย / ขาย (ไม่รวมปริมาณการใช้)"
              >
                <option value="LATEST">
                  🌟 งวดล่าสุด ({formatPeriodLabel(availablePeriods[0] || currentMonthStr)})
                </option>
                {availablePeriods.map((p) => (
                  <option key={p} value={p}>
                    📅 {formatPeriodLabel(p)}
                  </option>
                ))}
                <option value="ALL">🌐 ทุกงวดเดือน (ภาพรวมสะสมทั้งหมด)</option>
              </select>
            </div>
            {selectedPeriod !== "ALL" && (
              <span className="bg-emerald-500/30 text-emerald-100 border border-emerald-300/40 rounded-lg px-2.5 py-1 text-[11px] font-semibold">
                แสดงข้อมูลงวด:{" "}
                {formatPeriodLabel(
                  selectedPeriod === "LATEST"
                    ? availablePeriods[0] || currentMonthStr
                    : selectedPeriod
                )}
              </span>
            )}

            <div
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 border shadow-sm ${theme.badge}`}
            >
              <Package className="h-3.5 w-3.5" />
              <span className="text-[11px] font-bold">{DATA_GROUP_LABELS[lockedGroup]}</span>
            </div>
          </div>

          <div className={`text-[11px] ${theme.hint} flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-lg border border-white/10`}>
            <span>
              ส่วนนี้เป็นข้อมูล <b>{DATA_GROUP_LABELS[lockedGroup]}</b> โดยสิ้นเชิง ·
              สลับไปเมนูย่อยอีกอันเพื่อเปิดส่วน{" "}
              {lockedGroup === "MAINSTORE" ? DATA_GROUP_LABELS.PASDU : DATA_GROUP_LABELS.MAINSTORE}
            </span>
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
              ? theme.tabActive
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>ภาพรวมเปรียบเทียบ (Sheet เหลือ)</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("balance");
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "balance"
              ? theme.tabActive
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
              ? theme.tabActive
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
              ? theme.tabActive
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
              ? theme.tabActive
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <Calculator className="h-4 w-4" />
          <span>4. ปริมาณการใช้</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("batches");
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "batches"
              ? theme.tabActive
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
            <div className="relative lg:col-span-2">
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
            <div className="lg:col-span-2">
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs md:text-sm focus:border-blue-500 focus:outline-none bg-white truncate"
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
            <div className="lg:col-span-2">
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

            {/* Unit Dropdown */}
            <div className="lg:col-span-1">
              <select
                value={selectedUnit}
                onChange={(e) => {
                  setSelectedUnit(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full rounded-xl border px-2 py-2 text-xs md:text-sm focus:outline-none truncate transition-colors ${
                  selectedUnit !== "ALL"
                    ? "border-blue-500 bg-blue-50 text-blue-800 font-semibold"
                    : "border-gray-300 bg-white"
                }`}
                title="กรองตามหน่วยสินค้า"
              >
                <option value="ALL">📦 ทุกหน่วย ({filterOptions.units?.length || 0})</option>
                {(filterOptions.units || []).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            {/* จำนวนเดือน + เดือนสิ้นสุด (เดียวกับแท็บปริมาณการใช้) */}
            <div className="lg:col-span-2 flex gap-1.5">
              <select
                value={usageMonthCount}
                onChange={(e) => setUsageMonthCount(Number(e.target.value) || 3)}
                className="w-[88px] shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-2 py-2 text-xs md:text-sm font-medium text-amber-950 focus:outline-none"
                title="จำนวนเดือนที่ย้อนหลัง"
              >
                {usageMonthCountOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} ด.
                  </option>
                ))}
              </select>
              <select
                value={`${usageRangeEnd.year}-${usageRangeEnd.month}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-").map(Number);
                  if (y && m) setUsageRangeEnd({ year: y, month: m });
                }}
                className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-amber-50 px-2 py-2 text-xs md:text-sm font-medium text-amber-950 focus:outline-none truncate"
                title="เดือนสิ้นสุดของช่วง — ค่าเดียวกับแท็บปริมาณการใช้"
              >
                {usageEndOptions.map((opt) => (
                  <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                    ถึง {formatBuddhistMonthLabel(opt)}
                  </option>
                ))}
              </select>
            </div>

            {/* Status & Export Actions */}
            <div className="lg:col-span-3 flex items-center justify-end gap-2">
              <button
                onClick={fetchTabData}
                className="p-2 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50"
                title="รีเฟรชข้อมูล"
              >
                <RefreshCw className={`h-4 w-4 ${loadingData ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={handleExportExcel}
                disabled={isExporting || (totalCount === 0 && tableData.length === 0)}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm whitespace-nowrap"
                title={`ส่งออกข้อมูลทั้งหมด (${formatNum(totalCount || tableData.length)} รายการ)`}
              >
                {isExporting ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                <span>
                  {isExporting
                    ? "กำลังส่งออก..."
                    : `Export (${formatNum(totalCount || tableData.length)})`}
                </span>
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
                      className={`group px-2 py-2.5 transition-colors select-none ${
                        selectedUnit !== "ALL" ? "bg-indigo-950/90 text-amber-200" : "hover:bg-slate-700"
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        <div
                          onClick={() => handleSort("unit")}
                          className="flex items-center justify-between gap-1 cursor-pointer"
                          title="คลิกเพื่อเรียงตามหน่วย"
                        >
                          <span className="font-medium text-xs">หน่วย</span>
                          {renderSortIcon("unit")}
                        </div>
                        <select
                          value={selectedUnit}
                          onChange={(e) => {
                            setSelectedUnit(e.target.value);
                            setCurrentPage(1);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={`text-[11px] rounded px-1 py-0.5 border focus:outline-none cursor-pointer w-full transition-colors ${
                            selectedUnit !== "ALL"
                              ? "bg-amber-400 text-slate-950 font-bold border-amber-300"
                              : "bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
                          }`}
                          title="เลือกกรองหน่วยสินค้า"
                        >
                          <option value="ALL">ทั้งหมด</option>
                          {(filterOptions.units || []).map((u) => (
                            <option key={u} value={u} className="bg-white text-gray-800">
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                    </th>

                    {/* Balance — กรองค่า "-" ได้จากหัวคอลัมน์ */}
                    <th className="px-2 py-2 text-right bg-blue-950/80 text-blue-200 align-bottom">
                      <div
                        onClick={() => handleSort("balanceQty")}
                        className="group flex items-center justify-end gap-1 cursor-pointer select-none hover:text-white"
                        title="คลิกเพื่อเรียงตามยอดคงเหลือ"
                      >
                        <div className="text-right">
                          <div>เหลือ</div>
                          <span className="text-[9px] text-blue-300 font-normal">ไฟล์1(Col E)</span>
                        </div>
                        {renderSortIcon("balanceQty")}
                      </div>
                      <select
                        value={balanceEmptyFilter}
                        onChange={(e) => {
                          setBalanceEmptyFilter(
                            e.target.value as "HAS_VALUE" | "INCLUDE_EMPTY" | "EMPTY_ONLY"
                          );
                          setCurrentPage(1);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`mt-1 w-full text-[10px] rounded px-1 py-0.5 border focus:outline-none cursor-pointer ${
                          balanceEmptyFilter !== "INCLUDE_EMPTY"
                            ? "bg-amber-400 text-slate-950 font-bold border-amber-300"
                            : "bg-slate-700 text-slate-200 border-slate-600"
                        }`}
                        title="กรองรายการที่เหลือเป็น (-)"
                      >
                        <option value="INCLUDE_EMPTY">รวม -</option>
                        <option value="HAS_VALUE">ซ่อน -</option>
                        <option value="EMPTY_ONLY">เฉพาะ -</option>
                      </select>
                    </th>

                    {/* MIN — กรองค่า "-" ได้จากหัวคอลัมน์ */}
                    <th className="px-2 py-2 text-right bg-blue-950/80 text-blue-200 align-bottom">
                      <div
                        onClick={() => handleSort("minQty")}
                        className="group flex items-center justify-end gap-1 cursor-pointer select-none hover:text-white"
                        title="คลิกเพื่อเรียงตามจุดสั่งซื้อ MIN"
                      >
                        <div className="text-right">
                          <div>MIN</div>
                          <span className="text-[9px] text-blue-300 font-normal">ไฟล์1(Col H)</span>
                        </div>
                        {renderSortIcon("minQty")}
                      </div>
                      <select
                        value={minEmptyFilter}
                        onChange={(e) => {
                          setMinEmptyFilter(
                            e.target.value as "HAS_VALUE" | "INCLUDE_EMPTY" | "EMPTY_ONLY"
                          );
                          setCurrentPage(1);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`mt-1 w-full text-[10px] rounded px-1 py-0.5 border focus:outline-none cursor-pointer ${
                          minEmptyFilter !== "HAS_VALUE"
                            ? "bg-amber-400 text-slate-950 font-bold border-amber-300"
                            : "bg-slate-700 text-slate-200 border-slate-600"
                        }`}
                        title="กรองรายการที่ MIN เป็น (-)"
                      >
                        <option value="HAS_VALUE">ซ่อน -</option>
                        <option value="INCLUDE_EMPTY">รวม -</option>
                        <option value="EMPTY_ONLY">เฉพาะ -</option>
                      </select>
                    </th>

                    {/* คอลัมน์เดือนตามจำนวนที่เลือก — เดือนสุดท้าย = เดือนนี้ (ตัด+ขาย) */}
                    {usageMonthLabels.map((label, mi) => {
                      const isThisMonth = mi === usageMonthLabels.length - 1;
                      return (
                        <th
                          key={label}
                          onClick={() => handleSort(isThisMonth ? "usageMonth3" : `usageMonth_${mi}`)}
                          className="group px-3 py-3 text-right bg-slate-700 text-slate-200 cursor-pointer hover:bg-slate-600 transition-colors select-none whitespace-nowrap"
                          title={
                            isThisMonth
                              ? `${label} = เดือนนี้ (ตัดจ่าย+ขาย)`
                              : `คลิกเพื่อเรียงตามยอดใช้ ${label} (จากไฟล์ปริมาณการใช้)`
                          }
                        >
                          <div className="flex items-center justify-end gap-1">
                            <div>
                              <div>{label}</div>
                              {isThisMonth && (
                                <span className="text-[9px] text-amber-200 font-normal">เดือนนี้</span>
                              )}
                            </div>
                            {isThisMonth ? renderSortIcon("usageMonth3") : null}
                          </div>
                        </th>
                      );
                    })}

                    {/* MAX */}
                    <th
                      onClick={() => handleSort("maxUsage")}
                      className="group px-3 py-3 text-right bg-indigo-950 text-indigo-200 font-bold cursor-pointer hover:bg-indigo-900 transition-colors select-none"
                      title={`คลิกเพื่อเรียงตามยอดใช้สูงสุด MAX จาก ${usageMonthCount} เดือนที่เลือก`}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div>
                          <div>MAX</div>
                          <span className="text-[9px] text-indigo-300 font-normal">
                            สูงสุด {usageMonthCount} ด.
                          </span>
                        </div>
                        {renderSortIcon("maxUsage")}
                      </div>
                    </th>

                    {/* AVG */}
                    <th
                      onClick={() => handleSort("avgUsage")}
                      className="group px-3 py-3 text-right bg-indigo-950 text-indigo-200 font-bold cursor-pointer hover:bg-indigo-900 transition-colors select-none"
                      title={`คลิกเพื่อเรียงตามยอดเฉลี่ย AVG จาก ${usageMonthCount} เดือนที่เลือก`}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div>
                          <div>AVG</div>
                          <span className="text-[9px] text-indigo-300 font-normal">
                            เฉลี่ย {usageMonthCount} ด.
                          </span>
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
                      className="group px-2.5 py-3 text-right bg-slate-700 text-slate-200 cursor-pointer hover:bg-slate-600 transition-colors select-none min-w-[95px]"
                      title="คลิกเพื่อเรียงตามยอดค้างส่ง (สามารถพิมพ์กรอกข้อมูลได้โดยตรงในตาราง)"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div>
                          <div>ค้างส่ง ✍️</div>
                          <span className="text-[9px] text-amber-300 font-normal">กรอกได้</span>
                        </div>
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
                      <td colSpan={15} className="px-4 py-12 text-center text-gray-500">
                        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-blue-600 mb-2" />
                        กำลังโหลดและจัดเรียงข้อมูล...
                      </td>
                    </tr>
                  ) : tableData.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="px-4 py-12 text-center text-gray-500">
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

                        {/* ค่าตามจำนวนเดือนที่เลือก — เดือนสุดท้ายใช้ยอดตัด+ขาย (เดือนนี้) */}
                        {alignUsageMonthsToLabels(
                          usageMonthLabels,
                          importedUsageMonthLabels.length > 0
                            ? importedUsageMonthLabels
                            : undefined,
                          Array.isArray(item.usageMonths)
                            ? item.usageMonths
                            : [item.usageMonth2, item.usageMonth3]
                        ).map((val, mi) => {
                          const isThisMonth = mi === usageMonthLabels.length - 1;
                          const display = isThisMonth ? item.usageMonth3 : val;
                          return (
                            <td
                              key={usageMonthLabels[mi]}
                              className={`px-3 py-2 text-right font-mono ${
                                isThisMonth ? "font-semibold text-gray-800" : "text-gray-600"
                              }`}
                            >
                              {display === null || display === undefined
                                ? "-"
                                : formatNum(display, isThisMonth ? 2 : 1)}
                            </td>
                          );
                        })}

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
                        <td className="px-1.5 py-1 text-right">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={
                              item.pendingDelivery != null && Number(item.pendingDelivery) !== 0
                                ? String(item.pendingDelivery)
                                : ""
                            }
                            placeholder="0"
                            onChange={(e) => handlePendingDeliveryChange(item.itemCode, e.target.value)}
                            onBlur={(e) => handlePendingDeliveryBlur(item.itemCode, Number(e.target.value) || 0)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className={`w-16 rounded border px-1.5 py-1 text-right text-xs font-mono transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              Number(item.pendingDelivery) > 0
                                ? "bg-amber-50 border-amber-400 font-bold text-amber-950"
                                : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
                            }`}
                            title="พิมพ์กรอกยอดค้างส่ง (ระบบจะบันทึกและคำนวณยอดสั่งซื้อให้อัตโนมัติ)"
                          />
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

      {/* TAB 2: UPLOAD (เลิกใช้ — นำเข้าในหน้าข้อมูลแต่ละประเภทแทน) */}
      {false && activeTab === "upload" && (
        <div className="space-y-6">
          {/* ตั้งค่าก่อนนำเข้า — วันที่ของข้อมูลเป็นตัวกำหนดชุดในงวด */}
          <div className="rounded-2xl bg-white p-5 border border-gray-200 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-gray-900 text-sm md:text-base">
                ตั้งค่าก่อนนำเข้า
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                เลือก <b>วันที่ของข้อมูล</b> เป็นตัวกำหนดชุดข้อมูลในงวดนั้น แล้วเลือกกลุ่มก่อนอัปโหลดไฟล์
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. วันที่ของข้อมูล (ตัวกำหนด) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700">
                  1. วันที่ของข้อมูล
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="date"
                    value={importDataDate}
                    onChange={(e) => {
                      if (e.target.value) applyImportDataDate(e.target.value);
                    }}
                    required
                    className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => applyImportDataDate(todayStr)}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 whitespace-nowrap"
                  >
                    วันนี้
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  แสดงเป็น <b className="text-blue-700">{formatDataDate(importDataDate)}</b> (dd/mm/yyyy)
                </p>
              </div>

              {/* 2. กลุ่มข้อมูล */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700">
                  2. กลุ่มข้อมูล
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setImportDataGroup("MAINSTORE")}
                    className={`px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
                      importDataGroup === "MAINSTORE"
                        ? "bg-sky-600 text-white shadow-sm"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {DATA_GROUP_LABELS.MAINSTORE}
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportDataGroup("PASDU")}
                    className={`px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
                      importDataGroup === "PASDU"
                        ? "bg-amber-600 text-white shadow-sm"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {DATA_GROUP_LABELS.PASDU}
                  </button>
                </div>
              </div>

              {/* 3. วันที่ชุดข้อมูล (สรุป) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700">
                  3. วันที่ชุดข้อมูล
                </label>
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-900 font-mono tracking-wide">
                  {formatDataDate(importDataDate)}
                </div>
                <p className="text-[11px] text-gray-500">
                  จัดเก็บในงวด {importPeriod} ตามวันที่นี้
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-100 px-3.5 py-2.5 text-xs text-blue-900">
              ชุดข้อมูลวันที่ <b className="font-mono">{formatDataDate(importDataDate)}</b>
              {" · กลุ่ม "}
              <b>{DATA_GROUP_LABELS[importDataGroup]}</b>
            </div>
          </div>

          {/* 4 Direct Browse Action Cards */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-blue-600" />
                  กดเลือกไฟล์ที่ต้องการนำเข้า (คลิกที่การ์ดเพื่อเปิดเลือกไฟล์ทันที)
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  บันทึกชุดข้อมูลวันที่{" "}
                  <b className="font-mono">{formatDataDate(importDataDate)}</b>
                  {" · กลุ่ม "}
                  <b>{DATA_GROUP_LABELS[importDataGroup]}</b>
                </p>
              </div>

              {isValidating && (
                <div className="flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-xs font-bold text-blue-700 animate-pulse">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>กำลังตรวจโครงสร้างไฟล์...</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. คงเหลือ */}
              <div
                onClick={() => triggerBrowseForType("BALANCE")}
                className={`group flex min-w-0 cursor-pointer flex-col rounded-2xl p-3.5 border-2 transition-all hover:scale-[1.01] ${
                  selectedFileType === "BALANCE" && selectedFile
                    ? "border-blue-600 bg-blue-50/60 shadow-lg ring-2 ring-blue-500/30"
                    : "border-gray-200 hover:border-blue-500 hover:bg-blue-50/30 hover:shadow-md"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate font-bold text-gray-900 text-sm group-hover:text-blue-600">
                        1. คงเหลือ
                      </h3>
                      <span
                        className="shrink-0 rounded-md bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 whitespace-nowrap"
                        title="Store Stock"
                      >
                        Stock
                      </span>
                    </div>
                    <p
                      className="truncate text-[11px] text-gray-500 font-mono"
                      title={latestFiles.BALANCE?.fileName || "ยังไม่ได้นำเข้า"}
                    >
                      {latestFiles.BALANCE?.fileName || "ยังไม่ได้นำเข้า"}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 flex-1 space-y-0.5 text-[11px] text-gray-600 bg-white/80 p-2 rounded-xl border border-gray-100">
                  <p className="truncate">• <b>Col B</b>: รหัสสินค้า</p>
                  <p className="truncate">• <b>Col E</b>: จำนวนคงเหลือ</p>
                  <p className="truncate">• <b>Col H</b>: จุดสั่งซื้อ MIN</p>
                </div>

                <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white group-hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap">
                  <UploadCloud className="h-3.5 w-3.5 shrink-0" />
                  <span>เลือกไฟล์</span>
                </div>
              </div>

              {/* 2. ตัดจ่าย */}
              <div
                onClick={() => triggerBrowseForType("DISPENSE")}
                className={`group flex min-w-0 cursor-pointer flex-col rounded-2xl p-3.5 border-2 transition-all hover:scale-[1.01] ${
                  selectedFileType === "DISPENSE" && selectedFile
                    ? "border-emerald-600 bg-emerald-50/60 shadow-lg ring-2 ring-emerald-500/30"
                    : "border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/30 hover:shadow-md"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <Percent className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate font-bold text-gray-900 text-sm group-hover:text-emerald-600">
                        2. ตัดจ่าย
                      </h3>
                      <span
                        className="shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 whitespace-nowrap"
                        title="กู้คืน_Sheet1"
                      >
                        Sheet1
                      </span>
                    </div>
                    <p
                      className="truncate text-[11px] text-gray-500 font-mono"
                      title={latestFiles.DISPENSE?.fileName || "ยังไม่ได้นำเข้า"}
                    >
                      {latestFiles.DISPENSE?.fileName || "ยังไม่ได้นำเข้า"}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 flex-1 space-y-0.5 text-[11px] text-gray-600 bg-white/80 p-2 rounded-xl border border-gray-100">
                  <p className="truncate">• <b>Col B</b>: Stock Code</p>
                  <p className="truncate">• <b>Col G</b>: สูตร <b>(G/3)+G</b></p>
                  <p className="truncate text-emerald-700 font-bold">➔ ปรับปรุงเป็นยอดใช้</p>
                </div>

                <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white group-hover:bg-emerald-700 transition-colors shadow-sm whitespace-nowrap">
                  <UploadCloud className="h-3.5 w-3.5 shrink-0" />
                  <span>เลือกไฟล์</span>
                </div>
              </div>

              {/* 3. ขาย */}
              <div
                onClick={() => triggerBrowseForType("SALE")}
                className={`group flex min-w-0 cursor-pointer flex-col rounded-2xl p-3.5 border-2 transition-all hover:scale-[1.01] ${
                  selectedFileType === "SALE" && selectedFile
                    ? "border-purple-600 bg-purple-50/60 shadow-lg ring-2 ring-purple-500/30"
                    : "border-gray-200 hover:border-purple-500 hover:bg-purple-50/30 hover:shadow-md"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate font-bold text-gray-900 text-sm group-hover:text-purple-600">
                        3. ขาย
                      </h3>
                      <span
                        className="shrink-0 rounded-md bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-700 whitespace-nowrap"
                        title="Daily Sale Report"
                      >
                        Sale
                      </span>
                    </div>
                    <p
                      className="truncate text-[11px] text-gray-500 font-mono"
                      title={latestFiles.SALE?.fileName || "ยังไม่ได้นำเข้า"}
                    >
                      {latestFiles.SALE?.fileName || "ยังไม่ได้นำเข้า"}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 flex-1 space-y-0.5 text-[11px] text-gray-600 bg-white/80 p-2 rounded-xl border border-gray-100">
                  <p className="truncate">• <b>Col B</b>: รหัสสินค้า</p>
                  <p className="truncate">• <b>Col E</b>: สูตร <b>(E/3)+E</b></p>
                  <p className="truncate text-purple-700 font-bold">➔ ปรับปรุงเป็นยอดขาย</p>
                </div>

                <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 py-2 text-xs font-bold text-white group-hover:bg-purple-700 transition-colors shadow-sm whitespace-nowrap">
                  <UploadCloud className="h-3.5 w-3.5 shrink-0" />
                  <span>เลือกไฟล์</span>
                </div>
              </div>

              {/* 4. ปริมาณการใช้ */}
              <div
                onClick={() => triggerBrowseForType("USAGE")}
                className={`group flex min-w-0 cursor-pointer flex-col rounded-2xl p-3.5 border-2 transition-all hover:scale-[1.01] ${
                  selectedFileType === "USAGE" && selectedFile
                    ? "border-amber-600 bg-amber-50/60 shadow-lg ring-2 ring-amber-500/30"
                    : "border-gray-200 hover:border-amber-500 hover:bg-amber-50/30 hover:shadow-md"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <Calculator className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate font-bold text-gray-900 text-sm group-hover:text-amber-700">
                        4. ปริมาณใช้
                      </h3>
                      <span
                        className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 whitespace-nowrap"
                        title="Sheet เหลือ & ปริมาณการใช้"
                      >
                        Usage
                      </span>
                    </div>
                    <p
                      className="truncate text-[11px] text-gray-500 font-mono"
                      title={latestFiles.USAGE?.fileName || "ยังไม่ได้นำเข้า"}
                    >
                      {latestFiles.USAGE?.fileName || "ยังไม่ได้นำเข้า"}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 flex-1 space-y-0.5 text-[11px] text-gray-600 bg-white/80 p-2 rounded-xl border border-gray-100">
                  <p className="truncate">• <b>Col E, F</b>: คงเหลือ & MIN</p>
                  <p className="truncate">• <b>เดือน 1–3</b>: ยอดใช้ย้อนหลัง</p>
                  <p className="truncate text-amber-800 font-bold">➔ คงเหลือ + หมวด + คู่ค้า</p>
                </div>

                <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 py-2 text-xs font-bold text-white group-hover:bg-amber-700 transition-colors shadow-sm whitespace-nowrap">
                  <UploadCloud className="h-3.5 w-3.5 shrink-0" />
                  <span>เลือกไฟล์</span>
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
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base md:text-lg font-bold text-gray-900">
                          {validationResult.isValid
                            ? `✅ โครงสร้างไฟล์ "${selectedFile?.name}" ถูกต้อง พร้อมนำเข้า`
                            : "❌ โครงสร้างไฟล์ไม่ถูกต้อง ไม่อนุญาตให้นำเข้า"}
                        </h3>
                        {validationResult.isValid && (
                          <>
                            <span className="rounded-full bg-slate-700 text-white px-2.5 py-0.5 text-xs font-bold shadow-sm font-mono">
                              {formatDataDate(importDataDate)}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm ${
                                importDataGroup === "MAINSTORE"
                                  ? "bg-sky-600 text-white"
                                  : "bg-amber-600 text-white"
                              }`}
                            >
                              {DATA_GROUP_LABELS[importDataGroup]}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Sheet: <b>{validationResult.sheetName || "-"}</b> | สแกนทั้งหมด{" "}
                        <b>{formatNum(validationResult.totalRows)}</b> แถว | พบข้อมูลตรงเงื่อนไข{" "}
                        <b className="text-emerald-700 font-bold">
                          {formatNum(validationResult.validRows)}
                        </b>{" "}
                        แถว (บันทึกชุดวันที่{" "}
                        <b className="font-mono">{formatDataDate(importDataDate)}</b> · กลุ่ม{" "}
                        <b>{DATA_GROUP_LABELS[importDataGroup]}</b>)
                      </p>
                    </div>
                  </div>

                  {validationResult.isValid && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white p-2.5 rounded-2xl border border-gray-200 shadow-sm">
                      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs font-semibold">
                        <div className="relative group/overwrite">
                          <button
                            type="button"
                            onClick={() => setImportMode("OVERWRITE")}
                            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition-all cursor-pointer ${
                              importMode === "OVERWRITE"
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                            }`}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>🔄 แทนที่ในงวดนี้</span>
                          </button>
                          <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-blue-200 bg-white p-3 text-[11px] leading-relaxed text-gray-700 shadow-lg opacity-0 transition-opacity group-hover/overwrite:opacity-100">
                            <p className="font-bold text-blue-700 mb-1">แทนที่ในงวดนี้ (ค่าเริ่มต้น)</p>
                            <p>
                              <b>ทำอะไร:</b> ลบชุดเดิมของประเภทไฟล์นี้ ในงวดเดียวกัน + กลุ่มเดียวกัน
                              แล้วใส่ไฟล์ใหม่แทน
                            </p>
                            <p className="mt-1">
                              <b>ใช้เมื่อ:</b> ต้องการให้เป็นข้อมูลล่าสุดของงวดนั้น เช่น อัปเดตยอดคงเหลือ
                            </p>
                            <p className="mt-1">
                              <b>ผล:</b> ในงวดนั้นเหลือชุดล่าสุดชุดเดียว ไม่ซ้อนข้อมูลเก่า
                            </p>
                            <p className="mt-1 text-gray-500">
                              กระทบเฉพาะประเภทไฟล์ + งวด {importPeriod} + กลุ่ม{" "}
                              {DATA_GROUP_LABELS[importDataGroup]}
                            </p>
                          </div>
                        </div>
                        <div className="relative group/append">
                          <button
                            type="button"
                            onClick={() => setImportMode("APPEND")}
                            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition-all cursor-pointer ${
                              importMode === "APPEND"
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                            }`}
                          >
                            <PlusCircle className="h-3.5 w-3.5" />
                            <span>➕ เพิ่มต่อยอด</span>
                          </button>
                          <div className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-72 rounded-xl border border-emerald-200 bg-white p-3 text-[11px] leading-relaxed text-gray-700 shadow-lg opacity-0 transition-opacity group-hover/append:opacity-100">
                            <p className="font-bold text-emerald-700 mb-1">เพิ่มต่อยอด</p>
                            <p>
                              <b>ทำอะไร:</b> ไม่ลบของเดิม เพิ่มเป็นชุดใหม่ซ้อนเข้าไปในงวดเดียวกัน
                            </p>
                            <p className="mt-1">
                              <b>ใช้เมื่อ:</b> มีหลายไฟล์ในงวดเดียวกันที่ต้องเก็บคู่กัน เช่น ไฟล์ขายมาทีละส่วน
                            </p>
                            <p className="mt-1">
                              <b>ผล:</b> ข้อมูลเก่า+ใหม่รวมกันในงวดนั้น (อาจซ้ำรหัสได้ถ้าไฟล์ overlap)
                            </p>
                            <p className="mt-1 text-gray-500">
                              กระทบเฉพาะประเภทไฟล์ + งวด {importPeriod} + กลุ่ม{" "}
                              {DATA_GROUP_LABELS[importDataGroup]}
                            </p>
                          </div>
                        </div>
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
                              <span>
                                บันทึก [{formatDataDate(importDataDate)}] ·{" "}
                                {DATA_GROUP_LABELS[importDataGroup]} (
                                {formatNum(validationResult.validRows)})
                              </span>
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
                              {(validationResult.usageMonthLabels?.length
                                ? validationResult.usageMonthLabels
                                : ["ย้อนหลัง 1 เดือน", "เดือนนี้"]
                              ).map((label) => (
                                <th key={label} className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
                                  {label}
                                </th>
                              ))}
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
                        {validationResult.previewRows.map((row, idx) => {
                          const previewMonths: (string | number)[] = Array.isArray(row.usageMonths)
                            ? row.usageMonths
                            : [row.usageMonth2, row.usageMonth3];
                          const labelCount =
                            validationResult.usageMonthLabels?.length || previewMonths.length || 2;
                          return (
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
                                {Array.from({ length: labelCount }).map((_, mi) => (
                                  <td key={mi} className="px-3 py-2 text-right font-mono">
                                    {previewMonths[mi] ?? "-"}
                                  </td>
                                ))}
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
                          );
                        })}
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
          {renderTabImportSection("BALANCE")}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
              <div className="relative flex-1 max-w-md min-w-[200px]">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="ค้นหารายการคงเหลือ..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-2 text-xs md:text-sm focus:outline-none"
                />
              </div>
              <div className="text-xs text-gray-600 whitespace-nowrap">
                แสดงหน้า <b>{currentPage}</b> จาก <b>{totalPages}</b> (ทั้งหมด{" "}
                <b>{formatNum(totalCount)}</b> รายการ)
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowMinZero((v) => !v);
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors ${
                  showMinZero
                    ? "border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
                title={
                  showMinZero
                    ? "กำลังแสดงรายการที่ Min Stock เป็น 0 หรือว่าง — คลิกเพื่อกลับไปแสดงรายการที่มีค่า"
                    : "แสดงเฉพาะรายการที่ Min Stock เป็น 0 หรือว่าง (-)"
                }
              >
                <span>min เป็น 0</span>
              </button>
              <button
                onClick={() => handleClearData("BALANCE", "ALL")}
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
                  {renderSortableTh("seq", "ลำดับ", { className: "px-3 py-3 text-center w-14", align: "center" })}
                  {renderSortableTh("itemCode", "รหัสสินค้า")}
                  {renderSortableTh("itemName", "ชื่อสินค้า")}
                  {renderSortableTh("unit", "หน่วย")}
                  {renderSortableTh("balanceQty", "จำนวนคงเหลือ (Col E)", { align: "right", className: "px-4 py-3 text-right" })}
                  {renderSortableTh("minQty", "Min Stock (Col H)", { align: "right", className: "px-4 py-3 text-right" })}
                  {renderSortableTh("unitPrice", "ราคา/หน่วย", { align: "right", className: "px-4 py-3 text-right" })}
                  {renderSortableTh("totalCost", "ต้นทุนรวม", { align: "right", className: "px-4 py-3 text-right" })}
                  <th className="px-4 py-3">ไฟล์นำเข้า</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loadingData ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      <RefreshCw className="mx-auto h-6 w-6 animate-spin text-blue-600 mb-2" />
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : tableData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      <Package className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                ) : (
                  tableData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/80">
                      <td className="px-3 py-2.5 text-center font-mono text-gray-400">
                        {(currentPage - 1) * 50 + idx + 1}
                      </td>
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
                  ))
                )}
              </tbody>
            </table>

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

      {/* TAB 4: DISPENSE */}
      {activeTab === "dispense" && (
        <div className="space-y-4">
          {renderTabImportSection("DISPENSE")}
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหารายการตัดจ่าย..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-2 text-xs md:text-sm focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleClearData("DISPENSE", "ALL")}
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
                  {renderSortableTh("seq", "ลำดับ", { className: "px-3 py-3 text-center w-14", align: "center" })}
                  {renderSortableTh("itemCode", "รหัสสินค้า")}
                  {renderSortableTh("itemName", "ชื่อสินค้า")}
                  {renderSortableTh("unit", "หน่วย")}
                  {renderSortableTh("rawQty", "จำนวนเบิกเดิม (Col G)", { align: "right", className: "px-4 py-3 text-right" })}
                  {renderSortableTh("adjustedQty", "ยอดปรับปรุง ((G/3)+G)", {
                    align: "right",
                    className: "px-4 py-3 text-right bg-emerald-50 text-emerald-900 font-bold",
                  })}
                  {renderSortableTh("unitPrice", "ราคา/หน่วย", { align: "right", className: "px-4 py-3 text-right" })}
                  {renderSortableTh("totalCost", "ต้นทุนรวม", { align: "right", className: "px-4 py-3 text-right" })}
                  <th className="px-4 py-3">ไฟล์นำเข้า</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loadingData ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      <RefreshCw className="mx-auto h-6 w-6 animate-spin text-blue-600 mb-2" />
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : tableData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      <Package className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                ) : (
                  tableData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/80">
                      <td className="px-3 py-2.5 text-center font-mono text-gray-400">
                        {(currentPage - 1) * 50 + idx + 1}
                      </td>
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
                  ))
                )}
              </tbody>
            </table>

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

      {/* TAB 5: SALE */}
      {activeTab === "sale" && (
        <div className="space-y-4">
          {renderTabImportSection("SALE")}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
              <div className="relative flex-1 max-w-md min-w-[200px]">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="ค้นหารายการขาย..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-2 text-xs md:text-sm focus:outline-none"
                />
              </div>
              <div className="text-xs text-gray-600 whitespace-nowrap">
                แสดงหน้า <b>{currentPage}</b> จาก <b>{totalPages}</b> (ทั้งหมด{" "}
                <b>{formatNum(totalCount)}</b> รายการ)
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleClearData("SALE", "ALL")}
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
                  {renderSortableTh("seq", "ลำดับ", { className: "px-3 py-3 text-center w-14", align: "center" })}
                  {renderSortableTh("itemCode", "รหัสสินค้า")}
                  {renderSortableTh("itemName", "ชื่อสินค้า")}
                  {renderSortableTh("unit", "หน่วย")}
                  {renderSortableTh("rawQty", "จำนวนขายเดิม (Col E)", { align: "right", className: "px-4 py-3 text-right" })}
                  {renderSortableTh("adjustedQty", "ยอดปรับปรุง ((E/3)+E)", {
                    align: "right",
                    className: "px-4 py-3 text-right bg-purple-50 text-purple-900 font-bold",
                  })}
                  {renderSortableTh("saleAmount", "ยอดขาย (บาท)", { align: "right", className: "px-4 py-3 text-right" })}
                  {renderSortableTh("costAmount", "ต้นทุน (บาท)", { align: "right", className: "px-4 py-3 text-right" })}
                  <th className="px-4 py-3">ไฟล์นำเข้า</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loadingData ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      <RefreshCw className="mx-auto h-6 w-6 animate-spin text-blue-600 mb-2" />
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : tableData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      <Package className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                ) : (
                  tableData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/80">
                      <td className="px-3 py-2.5 text-center font-mono text-gray-400">
                        {(currentPage - 1) * 50 + idx + 1}
                      </td>
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
                  ))
                )}
              </tbody>
            </table>

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

      {/* TAB 6: USAGE & VENDOR */}
      {activeTab === "usage" && (
        <div className="space-y-4">
          {renderTabImportSection("USAGE")}
          <div className="flex flex-wrap items-end justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหาข้อมูลปริมาณการใช้, หมวด, บริษัท..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-xl border border-gray-300 pl-10 pr-4 py-2 text-xs md:text-sm focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-gray-600">
                ช่วงเดือนที่ย้อนหลัง
              </label>
              <div className="flex gap-1.5">
                <select
                  value={usageMonthCount}
                  onChange={(e) => setUsageMonthCount(Number(e.target.value) || 3)}
                  className="rounded-xl border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-800 focus:outline-none"
                  title="เลือกจำนวนเดือนที่ต้องการแสดง"
                >
                  {usageMonthCountOptions.map((n) => (
                    <option key={n} value={n}>
                      {n} เดือน
                    </option>
                  ))}
                </select>
                <select
                  value={`${usageRangeEnd.year}-${usageRangeEnd.month}`}
                  onChange={(e) => {
                    const [y, m] = e.target.value.split("-").map(Number);
                    if (y && m) setUsageRangeEnd({ year: y, month: m });
                  }}
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 focus:outline-none"
                  title="เลือกเดือนสิ้นสุด"
                >
                  {usageEndOptions.map((opt) => (
                    <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                      ถึง {formatBuddhistMonthLabel(opt)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-gray-500">
                แสดง {usageMonthLabels[0]} – {usageMonthLabels[usageMonthLabels.length - 1]}
                {" · "}เดือนที่ไม่มีข้อมูลแสดง -
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleClearData("USAGE", "ALL")}
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

          <div className="rounded-2xl bg-white shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600 min-w-[960px]">
              <thead className="bg-amber-50 text-amber-950 font-semibold border-b border-amber-200">
                <tr>
                  {renderSortableTh("seq", "ลำดับ", {
                    className: "px-3 py-3 text-center w-14",
                    align: "center",
                  })}
                  {renderSortableTh("itemCode", "รหัสสินค้า")}
                  {renderSortableTh("itemName", "ชื่อสินค้า")}
                  {renderSortableTh("unit", "หน่วย")}
                  {usageMonthLabels.map((label, mi) => {
                    const isThisMonth = mi === usageMonthLabels.length - 1;
                    const colKey = isThisMonth ? "thisMonthUsage" : `month:${label}`;
                    return (
                      <th
                        key={label}
                        onClick={() => handleSort(colKey)}
                        className="group px-3 py-3 text-right whitespace-nowrap cursor-pointer select-none hover:bg-amber-100/80 transition-colors"
                        title={`คลิกเพื่อเรียงตาม ${label}`}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <div>
                            <div>{label}</div>
                            {isThisMonth && (
                              <div className="text-[10px] font-medium text-amber-700">เดือนนี้</div>
                            )}
                          </div>
                          {renderSortIcon(colKey, "light")}
                        </div>
                      </th>
                    );
                  })}
                  {renderSortableTh("category", "หมวดสินค้า")}
                  {renderSortableTh("supplier", "บริษัทผู้จัดจำหน่าย")}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loadingData ? (
                  <tr>
                    <td
                      colSpan={6 + usageMonthLabels.length}
                      className="px-4 py-12 text-center text-amber-900/60"
                    >
                      <RefreshCw className="mx-auto h-6 w-6 animate-spin text-amber-600 mb-2" />
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : tableData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6 + usageMonthLabels.length}
                      className="px-4 py-12 text-center text-gray-500"
                    >
                      <Package className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                ) : (
                  tableData.map((item, idx) => {
                    const sourceMonths: (number | null)[] = Array.isArray(item.usageMonths)
                      ? item.usageMonths
                      : [item.usageMonth2, item.usageMonth3];
                    const months = alignUsageMonthsToLabels(
                      usageMonthLabels,
                      importedUsageMonthLabels.length > 0
                        ? importedUsageMonthLabels
                        : undefined,
                      sourceMonths
                    );
                    return (
                    <tr key={idx} className="hover:bg-amber-50/20">
                      <td className="px-3 py-2.5 text-center font-mono text-amber-900/50">
                        {(currentPage - 1) * 50 + idx + 1}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-amber-900 font-mono">{item.itemCode}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{item.itemName || "-"}</td>
                      <td className="px-4 py-2.5">{item.unit || "-"}</td>
                      {usageMonthLabels.map((label, mi) => {
                        const isThisMonth = mi === usageMonthLabels.length - 1;
                        // เดือนสุดท้าย = ตัดจ่าย+ขาย เหมือนหน้าภาพรวม
                        const display = isThisMonth
                          ? item.thisMonthUsage ?? item.usageMonth3
                          : months[mi];
                        return (
                          <td
                            key={label}
                            className={`px-3 py-2.5 text-right font-mono ${
                              isThisMonth ? "font-semibold text-amber-950" : "text-gray-700"
                            }`}
                          >
                            {display === null || display === undefined
                              ? "-"
                              : formatNum(display, isThisMonth ? 2 : 1)}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 font-medium text-gray-700">
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px]">{item.category || "-"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 max-w-[250px] truncate">{item.supplier || "-"}</td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-amber-200/60 px-4 py-3 bg-amber-50/40 text-xs text-gray-600">
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

      {/* TAB 7: BATCHES */}
      {activeTab === "batches" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="text-xs text-gray-500 font-medium">
              แสดงประวัติและชุดข้อมูลที่นำเข้าทั้งหมด ({batches.length} ชุด)
              <span
                className={`ml-2 font-bold px-2 py-0.5 rounded-md ${
                  selectedDataGroup === "MAINSTORE"
                    ? "text-sky-800 bg-sky-50"
                    : "text-amber-800 bg-amber-50"
                }`}
              >
                {DATA_GROUP_LABELS[selectedDataGroup]}
              </span>
              {selectedPeriod !== "ALL" && (
                <span className="ml-2 font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                  (เฉพาะงวด: {formatPeriodLabel(selectedPeriod === "LATEST" ? (availablePeriods[0] || currentMonthStr) : selectedPeriod)})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedPeriod !== "ALL" && (
                <button
                  onClick={() => handleClearData("ALL", selectedPeriod === "LATEST" ? (availablePeriods[0] || currentMonthStr) : selectedPeriod)}
                  disabled={isClearing}
                  className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-500 hover:bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors cursor-pointer"
                  title="ลบเฉพาะข้อมูลในงวดที่กำลังแสดง โดยไม่กระทบงวดอื่น"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>ลบเฉพาะงวดนี้ ({formatPeriodLabel(selectedPeriod === "LATEST" ? (availablePeriods[0] || currentMonthStr) : selectedPeriod)})</span>
                </button>
              )}
              <button
                onClick={() => handleClearData("ALL", "ALL")}
                disabled={isClearing}
                className="flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 shadow-sm transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>ล้างข้อมูลทุกงวด (Reset Database)</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50 text-gray-800 font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">งวดประจำเดือน</th>
                  <th className="px-4 py-3">กลุ่ม</th>
                  <th className="px-4 py-3">วันที่ของข้อมูล</th>
                  <th className="px-4 py-3">วันที่นำเข้า</th>
                  <th className="px-4 py-3">ประเภทไฟล์</th>
                  <th className="px-4 py-3">ชื่อไฟล์</th>
                  <th className="px-4 py-3 text-right">จำนวนแถวที่นำเข้า</th>
                  <th className="px-4 py-3">หมายเหตุ</th>
                  <th className="px-4 py-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                      ไม่พบประวัติการนำเข้าในงวด/กลุ่มนี้
                    </td>
                  </tr>
                ) : (
                  batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="rounded-lg bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 text-xs font-bold">
                          📅 {formatPeriodLabel(batch.period || "-")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            batch.dataGroup === "PASDU"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-sky-100 text-sky-800"
                          }`}
                        >
                          {DATA_GROUP_LABELS[(batch.dataGroup as InventoryDataGroup) || "MAINSTORE"]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700">
                        {formatDataDate(batch.dataDate)}
                      </td>
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
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="ลบชุดข้อมูลนี้"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
