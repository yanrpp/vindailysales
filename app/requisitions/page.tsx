"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ClipboardList,
  Upload,
  Download,
  RefreshCw,
  Search,
  Calendar,
  Building2,
  Layers,
  Package,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  History,
  MapPin,
} from "lucide-react";
import { ITEM_TYPES } from "@/lib/location-parser";
import {
  parseRequisitionWorkbook,
  type RequisitionParseResult,
} from "@/lib/requisition-parser";

interface RequisitionRow {
  id: string;
  requisitionNo: string;
  requestDate: string;
  requestDateText: string | null;
  department: string;
  suf: number | null;
  action: string;
  code: string;
  qtyRequist: number;
  itemName: string;
  unit: string;
  locationName: string | null;
  locations: string[];
  itemTypeId: number | null;
  itemTypeName: string | null;
  inRegistry: boolean;
}

interface FilterOption {
  name: string;
  count: number;
}

interface DateOption {
  date: string;
  count: number;
}

interface BatchRow {
  id: string;
  fileName: string;
  dateFrom: string | null;
  dateTo: string | null;
  totalRows: number;
  uploadedBy: string | null;
  createdAt: string;
}

type SortKey = "" | "requestDate" | "requisitionNo" | "department" | "action" | "code" | "qtyRequist";

const PAGE_SIZE = 50;

const formatThaiDate = (iso: string) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  if (!y || !m || !d) return iso;
  return `${d} ${months[m]} ${String((y + 543) % 100).padStart(2, "0")}`;
};

const formatNum = (n: number) =>
  Number.isInteger(n)
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RequisitionsPage() {
  const { token, loading: authLoading } = useAuth();

  // ---- data & filters ----
  const [items, setItems] = useState<RequisitionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [deptSearch, setDeptSearch] = useState("");
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const deptDropdownRef = useRef<HTMLDivElement>(null);

  const [activeAction, setActiveAction] = useState("");
  const [activeType, setActiveType] = useState<number>(0); // 0=ทั้งหมด, 1=Mainstore, 2=พัสดุ
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const [stats, setStats] = useState({
    totalRows: 0,
    totalRequisitions: 0,
    totalDepartments: 0,
    totalQty: 0,
  });
  const [deptOptions, setDeptOptions] = useState<FilterOption[]>([]);
  const [actionOptions, setActionOptions] = useState<FilterOption[]>([]);
  const [dateOptions, setDateOptions] = useState<DateOption[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);

  // ---- modals & toast ----
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showBatches, setShowBatches] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<RequisitionParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importMode, setImportMode] = useState<"replace_dates" | "append">("replace_dates");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast((p) => (p?.text === text ? null : p)), 4000);
  };

  useEffect(() => {
    if (!deptDropdownOpen) return;
    const onDown = (e: MouseEvent) => {
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target as Node)) {
        setDeptDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [deptDropdownOpen]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const api = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`,
          ...(init.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    },
    [token]
  );

  const selectedDeptsKey = selectedDepts.join(",");

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (dateFrom) qs.set("dateFrom", dateFrom);
      if (dateTo) qs.set("dateTo", dateTo);
      if (selectedDeptsKey) qs.set("departments", selectedDeptsKey);
      if (activeAction) qs.set("action", activeAction);
      if (activeType) qs.set("itemTypeId", String(activeType));
      if (debouncedSearch) qs.set("search", debouncedSearch);
      if (sortBy) {
        qs.set("sortBy", sortBy);
        qs.set("sortOrder", sortOrder);
      }
      const data = await api(`/api/requisitions?${qs}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      if (data.stats) setStats(data.stats);
      if (data.filters) {
        setDeptOptions(data.filters.departments || []);
        setActionOptions(data.filters.actions || []);
        setDateOptions(data.filters.dates || []);
      }
      if (data.batches) setBatches(data.batches);
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [
    api,
    token,
    page,
    dateFrom,
    dateTo,
    selectedDeptsKey,
    activeAction,
    activeType,
    debouncedSearch,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredDeptOptions = useMemo(() => {
    const q = deptSearch.trim().toLowerCase();
    return q ? deptOptions.filter((d) => d.name.toLowerCase().includes(q)) : deptOptions;
  }, [deptOptions, deptSearch]);

  const selectedDeptSet = useMemo(() => new Set(selectedDepts), [selectedDepts]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleDept = (name: string) => {
    setSelectedDepts((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
    setPage(1);
  };

  const handleSort = (key: Exclude<SortKey, "">) => {
    if (sortBy === key) {
      if (sortOrder === "asc") setSortOrder("desc");
      else {
        setSortBy("");
        setSortOrder("asc");
      }
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const resetFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelectedDepts([]);
    setActiveAction("");
    setActiveType(0);
    setSearch("");
    setSortBy("");
    setSortOrder("asc");
    setPage(1);
  };

  const hasActiveFilter = Boolean(
    dateFrom || dateTo || selectedDepts.length || activeAction || activeType || debouncedSearch
  );

  // ---- Import ----
  const handleFile = async (file: File) => {
    setParsing(true);
    setImportFile(file);
    setParsed(null);
    try {
      const buf = await file.arrayBuffer();
      await new Promise((r) => setTimeout(r, 0));
      setParsed(parseRequisitionWorkbook(buf));
    } catch (e: any) {
      showToast("อ่านไฟล์ไม่สำเร็จ: " + e.message, "error");
    } finally {
      setParsing(false);
    }
  };

  const doImport = async () => {
    if (!importFile || !parsed?.valid) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("mode", importMode);
      const data = await api("/api/requisitions/import", { method: "POST", body: fd });
      showToast(
        `นำเข้าสำเร็จ ${data.importedRows.toLocaleString()} รายการ` +
          (data.replacedCount ? ` (แทนที่ข้อมูลเดิม ${data.replacedCount.toLocaleString()} รายการ)` : "")
      );
      setShowImport(false);
      setImportFile(null);
      setParsed(null);
      setPage(1);
      await loadData();
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setImporting(false);
    }
  };

  // ---- Export ----
  const doExport = async () => {
    try {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set("dateFrom", dateFrom);
      if (dateTo) qs.set("dateTo", dateTo);
      if (selectedDeptsKey) qs.set("departments", selectedDeptsKey);
      if (activeAction) qs.set("action", activeAction);
      if (activeType) qs.set("itemTypeId", String(activeType));
      if (debouncedSearch) qs.set("search", debouncedSearch);

      const res = await fetch(`/api/requisitions/export?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("ส่งออกไม่สำเร็จ");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `requisitions_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showToast(e.message, "error");
    }
  };

  // ---- Delete ----
  const deleteRow = (r: RequisitionRow) =>
    setConfirm({
      title: "ยืนยันการลบรายการเบิก",
      description: `ลบรายการ ${r.code} (${r.itemName}) จากใบเบิก ${r.requisitionNo} หน่วยงาน ${r.department}?`,
      onConfirm: async () => {
        try {
          await api(`/api/requisitions?id=${r.id}`, { method: "DELETE" });
          showToast("ลบรายการเรียบร้อยแล้ว");
          loadData();
        } catch (e: any) {
          showToast(e.message, "error");
        }
      },
    });

  const deleteBatch = (b: BatchRow) =>
    setConfirm({
      title: "ลบประวัติและข้อมูลการนำเข้าชุดนี้",
      description: `ลบข้อมูลทั้งหมด ${b.totalRows.toLocaleString()} รายการ จากไฟล์ "${b.fileName}"?`,
      onConfirm: async () => {
        try {
          const data = await api(`/api/requisitions?batchId=${b.id}`, { method: "DELETE" });
          showToast(`ลบข้อมูลแล้ว ${data.deleted.toLocaleString()} รายการ`);
          loadData();
        } catch (e: any) {
          showToast(e.message, "error");
        }
      },
    });

  if (authLoading) {
    return <div className="p-10 text-center text-slate-500">กำลังโหลด...</div>;
  }
  if (!token) {
    return (
      <div className="p-10 text-center text-slate-600">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
        กรุณาเข้าสู่ระบบเพื่อใช้งานทะเบียนการเบิกหน่วยงานรายวัน
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <ClipboardList className="h-6 w-6 text-blue-600" />
            การเบิกหน่วยงานรายวัน
          </h1>
          <p className="text-sm text-slate-500">
            เก็บข้อมูลการเบิกแยกตามวันที่และหน่วยงาน พร้อมเชื่อมโยงรหัสสินค้ากับทะเบียน ITEMSTORE
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBatches(true)}>
            <History className="h-4 w-4" /> ประวัตินำเข้า ({batches.length})
          </Button>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4" /> รีเฟรช
          </Button>
          <Button variant="outline" size="sm" onClick={doExport} disabled={total === 0}>
            <Download className="h-4 w-4" /> ส่งออก Excel
          </Button>
          <Button
            size="sm"
            onClick={() => setShowImport(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Upload className="h-4 w-4" /> นำเข้าไฟล์เบิก
          </Button>
        </div>
      </div>

      {/* Dynamic Stats Cards */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatCard
          label="รายการเบิกที่แสดง"
          value={stats.totalRows.toLocaleString()}
          icon={<Layers className="h-4 w-4" />}
          color="text-blue-600 bg-blue-50"
        />
        <StatCard
          label="จำนวนใบเบิก"
          value={stats.totalRequisitions.toLocaleString()}
          icon={<ClipboardList className="h-4 w-4" />}
          color="text-indigo-600 bg-indigo-50"
        />
        <StatCard
          label="จำนวนหน่วยงาน"
          value={stats.totalDepartments.toLocaleString()}
          icon={<Building2 className="h-4 w-4" />}
          color="text-amber-600 bg-amber-50"
        />
        <StatCard
          label="รวมจำนวนขอเบิก"
          value={formatNum(stats.totalQty)}
          icon={<Package className="h-4 w-4" />}
          color="text-emerald-600 bg-emerald-50"
        />
      </div>

      {/* Compact Top Filter Bar */}
      <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Range */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs text-slate-700 outline-none"
              title="ตั้งแต่วันที่"
            />
            <span className="text-slate-400">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs text-slate-700 outline-none"
              title="ถึงวันที่"
            />
          </div>

          {/* Multi-select Department Dropdown */}
          <div className="relative" ref={deptDropdownRef}>
            <button
              type="button"
              onClick={() => setDeptDropdownOpen((o) => !o)}
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition ${
                selectedDepts.length > 0
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>
                {selectedDepts.length === 0
                  ? `หน่วยงาน: ทั้งหมด (${deptOptions.length})`
                  : selectedDepts.length === 1
                  ? selectedDepts[0]
                  : `หน่วยงาน: เลือกแล้ว ${selectedDepts.length}`}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>

            {deptDropdownOpen && (
              <div className="absolute left-0 top-10 z-30 w-[340px] max-w-[92vw] rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="space-y-2 border-b border-slate-100 p-2.5">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      autoFocus
                      value={deptSearch}
                      onChange={(e) => setDeptSearch(e.target.value)}
                      placeholder="ค้นหาหน่วยงาน..."
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>พบ {filteredDeptOptions.length} หน่วยงาน</span>
                    {selectedDepts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDepts([]);
                          setPage(1);
                        }}
                        className="font-medium text-red-600 hover:underline"
                      >
                        ล้างทั้งหมด
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
                  {filteredDeptOptions.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">ไม่พบหน่วยงาน</div>
                  ) : (
                    filteredDeptOptions.map((d) => {
                      const checked = selectedDeptSet.has(d.name);
                      return (
                        <div
                          key={d.name}
                          onClick={() => toggleDept(d.name)}
                          className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition ${
                            checked
                              ? "bg-blue-50 text-blue-800 font-medium"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                checked
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-slate-300 bg-white"
                              }`}
                            >
                              {checked && <Check className="h-2.5 w-2.5" />}
                            </span>
                            <span className="truncate">{d.name}</span>
                          </div>
                          <span className="ml-2 shrink-0 text-[10px] text-slate-400">
                            {d.count.toLocaleString()}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ItemType Filter (linked from ITEMSTORE) */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {[{ id: 0, name: "ทุกคลัง" }, ...ITEM_TYPES].map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setActiveType(t.id);
                  setPage(1);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  activeType === t.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-blue-700"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          {/* Action Filter */}
          {actionOptions.length > 0 && (
            <select
              value={activeAction}
              onChange={(e) => {
                setActiveAction(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-700"
            >
              <option value="">Act: ทั้งหมด</option>
              {actionOptions.map((a) => (
                <option key={a.name} value={a.name}>
                  Act: {a.name} ({a.count})
                </option>
              ))}
            </select>
          )}

          {/* Search */}
          <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาใบเบิก / รหัส / ชื่อ / หน่วยงาน..."
              className="h-9 pl-8 text-xs"
            />
          </div>

          {hasActiveFilter && (
            <Button variant="ghost" size="sm" className="h-9 text-xs text-red-600" onClick={resetFilters}>
              <X className="h-3.5 w-3.5" /> ล้างตัวกรอง
            </Button>
          )}
        </div>

        {/* Quick Date Chips + Selected Dept Chips */}
        {(dateOptions.length > 0 || selectedDepts.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
            {dateOptions.slice(0, 10).map((d) => {
              const active = dateFrom === d.date && dateTo === d.date;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => {
                    if (active) {
                      setDateFrom("");
                      setDateTo("");
                    } else {
                      setDateFrom(d.date);
                      setDateTo(d.date);
                    }
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                    active
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                >
                  <Calendar className="h-3 w-3" />
                  {formatThaiDate(d.date)}
                  <span className={active ? "text-blue-100" : "text-slate-400"}>({d.count})</span>
                </button>
              );
            })}
            {selectedDepts.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-800"
              >
                {d}
                <button
                  type="button"
                  onClick={() => toggleDept(d)}
                  className="rounded-full p-0.5 hover:bg-blue-200/70"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main Data Table */}
      <div className="flex min-h-[460px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          <span>
            แสดง <b className="text-slate-700">{items.length.toLocaleString()}</b> จาก{" "}
            <b className="text-slate-700">{total.toLocaleString()}</b> รายการ
          </span>
          <span className="text-[11px] text-slate-400">คลิกที่หัวคอลัมน์เพื่อเรียงลำดับข้อมูล</span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortableTh
                  label="วันที่ขอเบิก"
                  sortKey="requestDate"
                  activeKey={sortBy}
                  order={sortOrder}
                  onSort={handleSort}
                  className="w-28"
                />
                <SortableTh
                  label="เลขที่ใบเบิก"
                  sortKey="requisitionNo"
                  activeKey={sortBy}
                  order={sortOrder}
                  onSort={handleSort}
                  className="w-32"
                />
                <SortableTh
                  label="หน่วยงาน"
                  sortKey="department"
                  activeKey={sortBy}
                  order={sortOrder}
                  onSort={handleSort}
                />
                <SortableTh
                  label="Act"
                  sortKey="action"
                  activeKey={sortBy}
                  order={sortOrder}
                  onSort={handleSort}
                  align="center"
                  className="w-16"
                />
                <SortableTh
                  label="รหัส (code)"
                  sortKey="code"
                  activeKey={sortBy}
                  order={sortOrder}
                  onSort={handleSort}
                />
                <th className="px-3 py-2.5 text-left font-semibold">ชื่อสินค้า (ITEMSTORE)</th>
                <th className="px-3 py-2.5 text-center font-semibold">Location / คลัง</th>
                <SortableTh
                  label="ขอเบิก"
                  sortKey="qtyRequist"
                  activeKey={sortBy}
                  order={sortOrder}
                  onSort={handleSort}
                  align="right"
                  className="w-24"
                />
                <th className="px-3 py-2.5 text-left font-semibold">หน่วย</th>
                <th className="w-14 px-2 py-2.5 text-center font-semibold">ลบ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !items.length ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center text-slate-400">
                    <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" /> กำลังโหลด...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center text-slate-400">
                    <ClipboardList className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    ไม่พบข้อมูลการเบิก
                    {!hasActiveFilter && (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          onClick={() => setShowImport(true)}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Upload className="h-4 w-4" /> นำเข้าไฟล์ Excel การเบิก
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                items.map((r) => (
                  <tr key={r.id} className={`hover:bg-blue-50/40 ${loading ? "opacity-60" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700">
                      {r.requestDateText || formatThaiDate(r.requestDate)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-blue-700">
                      {r.requisitionNo}
                      {r.suf !== null && (
                        <span className="ml-1 text-[10px] font-normal text-slate-400">#{r.suf}</span>
                      )}
                    </td>
                    <td className="max-w-[210px] px-3 py-2 text-xs text-slate-700">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDepts([r.department]);
                          setPage(1);
                        }}
                        className="block max-w-full truncate text-left hover:text-blue-700 hover:underline"
                        title={`กรองหน่วยงาน: ${r.department}`}
                      >
                        {r.department}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700">
                        {r.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-slate-800">
                      {r.code}
                    </td>
                    <td className="max-w-[340px] px-3 py-2 text-xs text-slate-700">
                      <div className="truncate" title={r.itemName}>
                        {r.itemName}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center">
                      {r.inRegistry ? (
                        <div className="inline-flex items-center gap-1">
                          {r.locationName && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                              <MapPin className="h-2.5 w-2.5 text-slate-400" />
                              {r.locationName}
                            </span>
                          )}
                          {r.itemTypeName && (
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                                r.itemTypeId === 1
                                  ? "border-blue-200 bg-blue-100 text-blue-700"
                                  : "border-amber-200 bg-amber-100 text-amber-800"
                              }`}
                            >
                              {r.itemTypeName}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">ไม่พบในทะเบียน</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs font-bold text-emerald-700">
                      {formatNum(r.qtyRequist)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{r.unit}</td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => deleteRow(r)}
                        title="ลบรายการ"
                        className="rounded p-1 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">
          <span>
            หน้า <b>{page}</b> / <b>{totalPages}</b> · ทั้งหมด <b>{total.toLocaleString()}</b> รายการ
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> ก่อนหน้า
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ถัดไป <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ===== Import Modal (Strict Structural Validation) ===== */}
      <Dialog
        open={showImport}
        onOpenChange={(o) => {
          if (!o && !importing) {
            setShowImport(false);
            setImportFile(null);
            setParsed(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> นำเข้าข้อมูลการเบิกหน่วยงานรายวัน
            </DialogTitle>
            <DialogDescription>
              ระบบจะตรวจสอบโครงสร้างคอลัมน์อัตโนมัติ (ไม่สนใจชื่อไฟล์): B = Reference, C = Date (เติมวันที่จากแถวก่อนหน้าให้อัตโนมัติเมื่อว่าง), D = หน่วยงาน, E = Suf, F = Act, G = Check List Issue (code), J = Page -x of x (qty_requist)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-5 text-center hover:bg-emerald-50"
            >
              <Upload className="mx-auto mb-1.5 h-7 w-7 text-emerald-600" />
              <p className="text-sm font-medium text-slate-700">
                {importFile ? importFile.name : "คลิกเพื่อเลือกไฟล์ Excel (.xls / .xlsx)"}
              </p>
              {parsing && <p className="mt-1 text-xs text-slate-500">กำลังตรวจสอบโครงสร้างไฟล์...</p>}
              <input
                ref={fileRef}
                type="file"
                accept=".xls,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>

            {parsed && !parsed.valid && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-bold text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  โครงสร้างไฟล์ไม่ถูกต้อง — ไม่อนุญาตให้นำเข้า
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {parsed.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsed && parsed.valid && (
              <>
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    โครงสร้างไฟล์ถูกต้อง — พบ {parsed.summary.totalRows.toLocaleString()} รายการ,{" "}
                    {parsed.summary.uniqueRequisitions.toLocaleString()} ใบเบิก,{" "}
                    {parsed.summary.uniqueDepartments} หน่วยงาน (เติมวันที่ว่างอัตโนมัติ{" "}
                    {parsed.summary.filledDateRows.toLocaleString()} แถว)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-500">วันที่ในไฟล์:</span>
                  {parsed.summary.uniqueDates.map((d) => (
                    <span
                      key={d}
                      className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 font-medium text-blue-700"
                    >
                      {formatThaiDate(d)} ({d})
                    </span>
                  ))}
                </div>

                <div className="max-h-48 overflow-auto rounded-lg border text-xs">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-slate-100">
                      <tr>
                        <th className="px-2 py-1 text-left">วันที่ขอเบิก</th>
                        <th className="px-2 py-1 text-left">requisition_no</th>
                        <th className="px-2 py-1 text-left">department</th>
                        <th className="px-2 py-1 text-center">action</th>
                        <th className="px-2 py-1 text-left">code</th>
                        <th className="px-2 py-1 text-right">qty_requist</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 30).map((r) => (
                        <tr key={r.rowNumber} className="border-t">
                          <td className="whitespace-nowrap px-2 py-1">
                            {r.requestDateText}
                            {r.dateFilled && (
                              <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">
                                เติมอัตโนมัติ
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 font-mono">{r.requisitionNo}</td>
                          <td className="max-w-[160px] truncate px-2 py-1">{r.department}</td>
                          <td className="px-2 py-1 text-center">{r.action}</td>
                          <td className="px-2 py-1 font-mono">{r.code}</td>
                          <td className="px-2 py-1 text-right font-mono">{formatNum(r.qtyRequist)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {parsed.warnings.length > 0 && (
                  <div className="max-h-20 overflow-auto rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    {parsed.warnings.slice(0, 15).map((w, i) => (
                      <div key={i}>• {w}</div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setImportMode("replace_dates")}
                    className={`rounded-lg border p-2.5 text-left text-xs transition ${
                      importMode === "replace_dates"
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-semibold text-slate-800">แทนที่ข้อมูลของวันที่ในไฟล์ (แนะนำ)</div>
                    <div className="text-slate-500">ลบข้อมูลเก่าเฉพาะวันที่ตรงกับในไฟล์ แล้วนำเข้าใหม่ ป้องกันข้อมูลซ้ำ</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode("append")}
                    className={`rounded-lg border p-2.5 text-left text-xs transition ${
                      importMode === "append"
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-semibold text-slate-800">เพิ่มต่อท้าย (Append)</div>
                    <div className="text-slate-500">เก็บข้อมูลเดิมทั้งหมดไว้ และเพิ่มรายการจากไฟล์นี้เข้าไป</div>
                  </button>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={importing}
                onClick={() => {
                  setShowImport(false);
                  setImportFile(null);
                  setParsed(null);
                }}
              >
                ยกเลิก
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={!parsed?.valid || importing}
                onClick={doImport}
              >
                {importing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> กำลังนำเข้า...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" /> ยืนยันนำเข้า
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Batch History Modal ===== */}
      <Dialog open={showBatches} onOpenChange={setShowBatches}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-600" /> ประวัติการนำเข้าไฟล์การเบิก
            </DialogTitle>
            <DialogDescription>สามารถลบข้อมูลการนำเข้าทั้งชุดได้จากที่นี่</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto divide-y divide-slate-100 text-xs">
            {batches.length === 0 ? (
              <div className="py-8 text-center text-slate-400">ยังไม่มีประวัติการนำเข้า</div>
            ) : (
              batches.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-800">{b.fileName}</div>
                    <div className="text-slate-500">
                      {b.totalRows.toLocaleString()} รายการ · วันที่{" "}
                      {b.dateFrom ? formatThaiDate(b.dateFrom.slice(0, 10)) : "-"}
                      {b.dateTo && b.dateTo !== b.dateFrom
                        ? ` – ${formatThaiDate(b.dateTo.slice(0, 10))}`
                        : ""}{" "}
                      · โดย {b.uploadedBy || "-"}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-red-600 hover:bg-red-50"
                    onClick={() => deleteBatch(b)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> ลบชุดนี้
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Confirm Dialog ===== */}
      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" /> {confirm?.title}
            </DialogTitle>
            <DialogDescription>{confirm?.description}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                const fn = confirm?.onConfirm;
                setConfirm(null);
                if (fn) await fn();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> ยืนยัน
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-sm text-white shadow-lg ${
            toast.type === "error" ? "border-red-700 bg-red-600" : "border-slate-800 bg-slate-900"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle className="h-5 w-5 text-red-200" />
          ) : (
            <Check className="h-5 w-5 text-emerald-400" />
          )}
          {toast.text}
        </div>
      )}
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  order,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: Exclude<SortKey, "">;
  activeKey: SortKey;
  order: "asc" | "desc";
  onSort: (k: Exclude<SortKey, "">) => void;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const isActive = activeKey === sortKey;
  const alignCls =
    align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
  return (
    <th className={`px-3 py-2.5 ${alignCls} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 font-semibold uppercase transition hover:text-blue-600 ${
          isActive ? "text-blue-600" : "text-slate-500"
        }`}
      >
        <span>{label}</span>
        {isActive ? (
          order === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] text-slate-500">{label}</div>
        <div className="text-lg font-bold text-slate-800">{value}</div>
      </div>
    </div>
  );
}
