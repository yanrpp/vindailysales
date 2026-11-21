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
  MapPin,
  Plus,
  Search,
  Upload,
  Download,
  Edit3,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ListOrdered,
  Package,
  Layers,
  AlertCircle,
  Check,
  RefreshCw,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from "lucide-react";
import {
  parseLocationWorkbook,
  itemTypeLabel,
  ITEM_TYPES,
  type LocationParseResult,
} from "@/lib/location-parser";

interface ItemTypeRow {
  id: number;
  code: string;
  name: string;
  locationCount: number;
  itemCount: number;
}

interface LocationRow {
  id: string;
  name: string;
  itemTypeId: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  itemCount: number;
}

interface ItemRow {
  id: string;
  locationId: string;
  itemTypeId: number;
  seq: number;
  code: string;
  name: string;
  unit: string | null;
  note: string | null;
  isActive: boolean;
  location?: { id: string; name: string; itemTypeId: number };
}

type SortKey = "" | "seq" | "location" | "itemTypeId" | "code" | "name" | "unit";

const PAGE_SIZE = 50;

const typeBadge = (id: number) =>
  id === 1
    ? "bg-blue-100 text-blue-700 border-blue-200"
    : "bg-amber-100 text-amber-800 border-amber-200";

export default function LocationRegistryPage() {
  const { token, loading: authLoading } = useAuth();

  // ---- data state ----
  const [itemTypes, setItemTypes] = useState<ItemTypeRow[]>([]);
  const [activeType, setActiveType] = useState<number>(0); // 0 = ทั้งหมด
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locSearch, setLocSearch] = useState("");
  const [selectedLocIds, setSelectedLocIds] = useState<string[]>([]);
  const [locDropdownOpen, setLocDropdownOpen] = useState(false);
  const locDropdownRef = useRef<HTMLDivElement>(null);

  const [items, setItems] = useState<ItemRow[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [debouncedItemSearch, setDebouncedItemSearch] = useState("");
  const [excludeNone, setExcludeNone] = useState(true); // ดีฟอลต์ซ่อน NONE ทุกครั้งที่เปิดหน้า
  const [sortBy, setSortBy] = useState<SortKey>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filteredStats, setFilteredStats] = useState<{
    totalLocations: number;
    totalItems: number;
    byType: Record<number, { locationCount: number; itemCount: number }>;
  } | null>(null);
  const [loadingLocs, setLoadingLocs] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // ---- modal state ----
  const [locForm, setLocForm] = useState<{
    id?: string;
    name: string;
    itemTypeId: number;
    description: string;
  } | null>(null);
  const [itemForm, setItemForm] = useState<{
    id?: string;
    locationId: string;
    seq: string;
    code: string;
    name: string;
    unit: string;
    note: string;
  } | null>(null);
  const [deleteLoc, setDeleteLoc] = useState<{ loc: LocationRow; moveTo: string } | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // ---- import state ----
  const [showImport, setShowImport] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [parsed, setParsed] = useState<LocationParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast((p) => (p?.text === text ? null : p)), 3500);
  };

  // close location dropdown on outside click
  useEffect(() => {
    if (!locDropdownOpen) return;
    const onDown = (e: MouseEvent) => {
      if (locDropdownRef.current && !locDropdownRef.current.contains(e.target as Node)) {
        setLocDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [locDropdownOpen]);

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

  // ---- loaders ----
  const loadItemTypes = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api("/api/locations/item-types");
      setItemTypes(data.itemTypes || []);
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }, [api, token]);

  const loadLocations = useCallback(async () => {
    if (!token) return;
    setLoadingLocs(true);
    try {
      const qs = new URLSearchParams();
      if (activeType) qs.set("itemTypeId", String(activeType));
      const data = await api(`/api/locations?${qs}`);
      setLocations(data.locations || []);
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setLoadingLocs(false);
    }
  }, [api, token, activeType]);

  const selectedLocIdsKey = selectedLocIds.join(",");

  const loadItems = useCallback(async () => {
    if (!token) return;
    setLoadingItems(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (selectedLocIdsKey) qs.set("locationIds", selectedLocIdsKey);
      if (activeType) qs.set("itemTypeId", String(activeType));
      if (debouncedItemSearch) qs.set("search", debouncedItemSearch);
      if (excludeNone) qs.set("excludeNone", "true");
      if (sortBy) {
        qs.set("sortBy", sortBy);
        qs.set("sortOrder", sortOrder);
      }
      const data = await api(`/api/locations/items?${qs}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      if (data.stats) setFilteredStats(data.stats);
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setLoadingItems(false);
    }
  }, [api, token, page, selectedLocIdsKey, activeType, debouncedItemSearch, excludeNone, sortBy, sortOrder]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadItemTypes(), loadLocations(), loadItems()]);
  }, [loadItemTypes, loadLocations, loadItems]);

  useEffect(() => {
    loadItemTypes();
  }, [loadItemTypes]);
  useEffect(() => {
    loadLocations();
  }, [loadLocations]);
  useEffect(() => {
    loadItems();
  }, [loadItems]);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedItemSearch(itemSearch.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [itemSearch]);

  const visibleLocations = useMemo(
    () => (excludeNone ? locations.filter((l) => l.name.toUpperCase() !== "NONE") : locations),
    [locations, excludeNone]
  );

  const filteredLocations = useMemo(() => {
    const q = locSearch.trim().toLowerCase();
    return q
      ? visibleLocations.filter((l) => l.name.toLowerCase().includes(q))
      : visibleLocations;
  }, [visibleLocations, locSearch]);

  const selectedLocSet = useMemo(() => new Set(selectedLocIds), [selectedLocIds]);
  const selectedLocs = useMemo(
    () => locations.filter((l) => selectedLocSet.has(l.id)),
    [locations, selectedLocSet]
  );
  const singleSelectedLoc = selectedLocs.length === 1 ? selectedLocs[0] : null;
  const showLocationCol = selectedLocIds.length !== 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canReorder =
    Boolean(singleSelectedLoc) &&
    !debouncedItemSearch &&
    (sortBy === "" || (sortBy === "seq" && sortOrder === "asc"));

  const totals = useMemo(
    () =>
      itemTypes.reduce(
        (acc, t) => ({ locs: acc.locs + t.locationCount, items: acc.items + t.itemCount }),
        { locs: 0, items: 0 }
      ),
    [itemTypes]
  );

  const selectType = (id: number) => {
    setActiveType(id);
    setSelectedLocIds([]);
    setPage(1);
  };

  const toggleLocation = (id: string) => {
    setSelectedLocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setPage(1);
  };

  const selectSingleLocation = (id: string) => {
    setSelectedLocIds([id]);
    setPage(1);
  };

  const clearLocations = () => {
    setSelectedLocIds([]);
    setPage(1);
  };

  const selectFilteredLocations = () => {
    setSelectedLocIds((prev) => {
      const next = new Set(prev);
      filteredLocations.forEach((l) => next.add(l.id));
      return [...next];
    });
    setPage(1);
  };

  const handleSort = (key: Exclude<SortKey, "">) => {
    if (sortBy === key) {
      if (sortOrder === "asc") {
        setSortOrder("desc");
      } else {
        setSortBy("");
        setSortOrder("asc");
      }
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
    setPage(1);
  };

  // ---- location actions ----
  const saveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locForm) return;
    setSaving(true);
    try {
      const payload = {
        name: locForm.name,
        itemTypeId: locForm.itemTypeId,
        description: locForm.description,
      };
      if (locForm.id) {
        await api(`/api/locations/${locForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast(`บันทึก Location "${locForm.name}" แล้ว`);
      } else {
        const data = await api("/api/locations", { method: "POST", body: JSON.stringify(payload) });
        setSelectedLocIds([data.location.id]);
        showToast(`เพิ่ม Location "${locForm.name}" แล้ว`);
      }
      setLocForm(null);
      await Promise.all([loadItemTypes(), loadLocations()]);
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const doDeleteLocation = async () => {
    if (!deleteLoc) return;
    setSaving(true);
    try {
      const qs = deleteLoc.moveTo ? `?moveItemsTo=${deleteLoc.moveTo}` : "";
      const data = await api(`/api/locations/${deleteLoc.loc.id}${qs}`, { method: "DELETE" });
      showToast(
        deleteLoc.moveTo
          ? `ลบ Location แล้ว ย้าย ${data.moved} รายการ${data.skipped ? ` (ข้ามรหัสซ้ำ ${data.skipped})` : ""}`
          : `ลบ Location "${deleteLoc.loc.name}" แล้ว`
      );
      setSelectedLocIds((prev) => prev.filter((id) => id !== deleteLoc.loc.id));
      setDeleteLoc(null);
      await refreshAll();
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const renumber = async () => {
    if (!singleSelectedLoc) return;
    try {
      const data = await api(`/api/locations/${singleSelectedLoc.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "renumber" }),
      });
      showToast(`เรียงลำดับใหม่แล้ว (${data.updated} รายการ)`);
      loadItems();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  };

  // ---- item actions ----
  const openNewItem = () => {
    const locId = singleSelectedLoc?.id || selectedLocIds[0] || filteredLocations[0]?.id || "";
    if (!locId) {
      showToast("กรุณาสร้าง Location ก่อน", "error");
      return;
    }
    setItemForm({ locationId: locId, seq: "", code: "", name: "", unit: "", note: "" });
  };

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm) return;
    setSaving(true);
    try {
      const payload = {
        locationId: itemForm.locationId,
        seq: itemForm.seq ? Number(itemForm.seq) : undefined,
        code: itemForm.code,
        name: itemForm.name,
        unit: itemForm.unit,
        note: itemForm.note,
      };
      if (itemForm.id) {
        await api(`/api/locations/items/${itemForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showToast(`บันทึกรายการ "${itemForm.code}" แล้ว`);
      } else {
        await api("/api/locations/items", { method: "POST", body: JSON.stringify(payload) });
        showToast(`เพิ่มรายการ "${itemForm.code}" แล้ว`);
      }
      setItemForm(null);
      await Promise.all([loadItems(), loadLocations(), loadItemTypes()]);
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const moveItem = async (item: ItemRow, move: "up" | "down") => {
    try {
      await api(`/api/locations/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ move }) });
      loadItems();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  };

  const deleteItem = (item: ItemRow) =>
    setConfirm({
      title: "ยืนยันการลบรายการ",
      description: `ลบ "${item.code} - ${item.name}" ออกจาก Location ${item.location?.name || ""}?`,
      onConfirm: async () => {
        try {
          await api(`/api/locations/items/${item.id}`, { method: "DELETE" });
          showToast("ลบรายการแล้ว");
          await Promise.all([loadItems(), loadLocations(), loadItemTypes()]);
        } catch (e: any) {
          showToast(e.message, "error");
        }
      },
    });

  // ---- import / export ----
  const handleFile = async (file: File) => {
    setParsing(true);
    setParsed(null);
    setImportFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      await new Promise((r) => setTimeout(r, 0));
      setParsed(parseLocationWorkbook(buf));
    } catch (e: any) {
      showToast("อ่านไฟล์ไม่สำเร็จ: " + e.message, "error");
    } finally {
      setParsing(false);
    }
  };

  const parsedSummary = useMemo(() => {
    if (!parsed) return [];
    return ITEM_TYPES.map((t) => {
      const locs = parsed.locations.filter((l) => l.itemTypeId === t.id);
      return { ...t, locs: locs.length, items: locs.reduce((s, l) => s + l.items.length, 0) };
    }).filter((s) => s.locs > 0);
  }, [parsed]);

  const doImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const data = await api("/api/locations/import", {
        method: "POST",
        body: JSON.stringify({ mode: importMode, locations: parsed.locations }),
      });
      showToast(
        `นำเข้าสำเร็จ: Location ใหม่ ${data.locationsCreated.toLocaleString()} | รายการใหม่ ${data.itemsCreated.toLocaleString()} | อัปเดต ${data.itemsUpdated.toLocaleString()}`
      );
      setShowImport(false);
      setParsed(null);
      setSelectedLocIds([]);
      setPage(1);
      await refreshAll();
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setImporting(false);
    }
  };

  const doExport = async () => {
    try {
      const qs = activeType ? `?itemTypeId=${activeType}` : "";
      const res = await fetch(`/api/locations/export${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("ส่งออกไม่สำเร็จ");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `location_${activeType ? itemTypeLabel(activeType) : "ทั้งหมด"}_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showToast(e.message, "error");
    }
  };

  // ---- render ----
  if (authLoading) {
    return <div className="p-10 text-center text-slate-500">กำลังโหลด...</div>;
  }
  if (!token) {
    return (
      <div className="p-10 text-center text-slate-600">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
        กรุณาเข้าสู่ระบบเพื่อจัดการทะเบียน ITEMSTORE
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <MapPin className="h-6 w-6 text-blue-600" />
            ทะเบียน ITEMSTORE
          </h1>
          <p className="text-sm text-slate-500">
            จัดการตำแหน่งจัดเก็บและรายการสินค้าในแต่ละ Location (Mainstore / พัสดุ)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" /> รีเฟรช
          </Button>
          <Button variant="outline" size="sm" onClick={doExport}>
            <Download className="h-4 w-4" /> ส่งออก Excel
          </Button>
          <Button size="sm" onClick={() => setShowImport(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Upload className="h-4 w-4" /> นำเข้าจาก Excel
          </Button>
        </div>
      </div>

      {/* Compact Stats (reflects active filters) */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatCard
          label="Location ที่แสดง"
          value={filteredStats ? filteredStats.totalLocations : totals.locs}
          icon={<MapPin className="h-4 w-4" />}
          color="text-indigo-600 bg-indigo-50"
        />
        <StatCard
          label="รายการที่แสดง"
          value={filteredStats ? filteredStats.totalItems : totals.items}
          icon={<Layers className="h-4 w-4" />}
          color="text-emerald-600 bg-emerald-50"
        />
        {ITEM_TYPES.map((t) => {
          const s = filteredStats?.byType?.[t.id];
          const fallback = itemTypes.find((x) => x.id === t.id);
          const itemCount = s ? s.itemCount : fallback?.itemCount || 0;
          const locCount = s ? s.locationCount : fallback?.locationCount || 0;
          return (
            <StatCard
              key={t.id}
              label={t.name}
              value={itemCount}
              sub={`${locCount.toLocaleString()} Location`}
              icon={<Package className="h-4 w-4" />}
              color={t.id === 1 ? "text-blue-600 bg-blue-50" : "text-amber-600 bg-amber-50"}
            />
          );
        })}
      </div>

      {/* Top Filter Bar (Compact, Multi-select Location) */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Item type filter */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {[{ id: 0, name: "ทั้งหมด" }, ...ITEM_TYPES].map((t) => (
              <button
                key={t.id}
                onClick={() => selectType(t.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${activeType === t.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-blue-700"
                  }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          {/* Multi-select Location Dropdown */}
          <div className="relative" ref={locDropdownRef}>
            <button
              type="button"
              onClick={() => setLocDropdownOpen((o) => !o)}
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition ${selectedLocIds.length > 0
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>
                {selectedLocIds.length === 0
                  ? `Location: ทั้งหมด (${visibleLocations.length.toLocaleString()})`
                  : selectedLocIds.length === 1 && singleSelectedLoc
                    ? `Location: ${singleSelectedLoc.name}`
                    : `Location: เลือกแล้ว ${selectedLocIds.length} รายการ`}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>

            {locDropdownOpen && (
              <div className="absolute left-0 top-10 z-30 w-[360px] max-w-[92vw] rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="space-y-2 border-b border-slate-100 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        autoFocus
                        value={locSearch}
                        onChange={(e) => setLocSearch(e.target.value)}
                        placeholder="ค้นหา Location เช่น 1F1, 1B2..."
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      onClick={() => {
                        setLocDropdownOpen(false);
                        setLocForm({ name: locSearch.trim(), itemTypeId: activeType || 1, description: "" });
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> เพิ่ม
                    </Button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      พบ {filteredLocations.length.toLocaleString()} Location
                      {selectedLocIds.length > 0 && ` · เลือกแล้ว ${selectedLocIds.length}`}
                    </span>
                    <div className="flex gap-2">
                      {filteredLocations.length > 0 && (
                        <button
                          type="button"
                          onClick={selectFilteredLocations}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          เลือกที่แสดง
                        </button>
                      )}
                      {selectedLocIds.length > 0 && (
                        <button
                          type="button"
                          onClick={clearLocations}
                          className="font-medium text-red-600 hover:underline"
                        >
                          ล้างทั้งหมด
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto p-1.5">
                  {loadingLocs && !locations.length ? (
                    <div className="py-6 text-center text-xs text-slate-400">กำลังโหลด...</div>
                  ) : filteredLocations.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">ไม่พบ Location</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1">
                      {filteredLocations.map((l) => {
                        const checked = selectedLocSet.has(l.id);
                        return (
                          <div
                            key={l.id}
                            onClick={() => toggleLocation(l.id)}
                            className={`group flex cursor-pointer items-center justify-between rounded-lg border px-2 py-1.5 text-xs transition ${checked
                                ? "border-blue-500 bg-blue-50 text-blue-800"
                                : "border-transparent hover:bg-slate-50 text-slate-700"
                              }`}
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span
                                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${checked
                                    ? "border-blue-600 bg-blue-600 text-white"
                                    : "border-slate-300 bg-white"
                                  }`}
                              >
                                {checked && <Check className="h-2.5 w-2.5" />}
                              </span>
                              <span className="truncate font-semibold" title={l.name}>
                                {l.name}
                              </span>
                              {!activeType && (
                                <span className={`shrink-0 rounded border px-1 text-[9px] ${typeBadge(l.itemTypeId)}`}>
                                  {itemTypeLabel(l.itemTypeId)}
                                </span>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <span className="text-[10px] text-slate-400 group-hover:hidden">
                                {l.itemCount}
                              </span>
                              <button
                                type="button"
                                title="แก้ไข"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLocDropdownOpen(false);
                                  setLocForm({
                                    id: l.id,
                                    name: l.name,
                                    itemTypeId: l.itemTypeId,
                                    description: l.description || "",
                                  });
                                }}
                                className="hidden rounded p-0.5 text-slate-500 hover:bg-blue-100 hover:text-blue-700 group-hover:block"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                title="ลบ"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLocDropdownOpen(false);
                                  setDeleteLoc({ loc: l, moveTo: "" });
                                }}
                                className="hidden rounded p-0.5 text-red-500 hover:bg-red-100 group-hover:block"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick add location */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-2.5 text-xs"
            onClick={() => setLocForm({ name: "", itemTypeId: activeType || 1, description: "" })}
            title="เพิ่ม Location ใหม่"
          >
            <Plus className="h-3.5 w-3.5" /> เพิ่ม Location
          </Button>

          {/* Exclude NONE location checkbox (default unchecked) */}
          <label
            className={`inline-flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition ${excludeNone
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
          >
            <input
              type="checkbox"
              checked={excludeNone}
              onChange={(e) => {
                const checked = e.target.checked;
                setExcludeNone(checked);
                if (checked) {
                  setSelectedLocIds((prev) =>
                    prev.filter((id) => {
                      const loc = locations.find((l) => l.id === id);
                      return !loc || loc.name.toUpperCase() !== "NONE";
                    })
                  );
                }
                setPage(1);
              }}
              className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600"
            />
            <span>ไม่แสดง NONE</span>
          </label>

          {/* Item search */}
          <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="ค้นหารหัส / ชื่อ / หน่วย"
              className="h-9 pl-8 text-xs"
            />
          </div>

          {/* Single-location quick actions */}
          {singleSelectedLoc && (
            <>
              <Button variant="outline" size="sm" className="h-9 text-xs" onClick={renumber} title="เรียงลำดับใหม่ 1..n">
                <ListOrdered className="h-3.5 w-3.5" /> เรียงลำดับใหม่
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-2.5 text-xs"
                onClick={() =>
                  setLocForm({
                    id: singleSelectedLoc.id,
                    name: singleSelectedLoc.name,
                    itemTypeId: singleSelectedLoc.itemTypeId,
                    description: singleSelectedLoc.description || "",
                  })
                }
                title="แก้ไข Location นี้"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setDeleteLoc({ loc: singleSelectedLoc, moveTo: "" })}
                title="ลบ Location นี้"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          <Button size="sm" className="h-9 text-xs" onClick={openNewItem}>
            <Plus className="h-3.5 w-3.5" /> เพิ่มรายการ
          </Button>
        </div>

        {/* Selected Locations Chips */}
        {selectedLocs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
            <span className="text-[11px] text-slate-500">กำลังกรอง:</span>
            {selectedLocs.slice(0, 18).map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800"
              >
                <span className="underline underline-offset-2">{l.name}</span>
                <span className="text-[10px] text-blue-500">({l.itemCount})</span>
                <button
                  type="button"
                  onClick={() => toggleLocation(l.id)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-blue-200/70"
                  title="เอาออก"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {selectedLocs.length > 18 && (
              <span className="text-xs text-slate-500">และอีก {selectedLocs.length - 18} Location</span>
            )}
            <button
              type="button"
              onClick={clearLocations}
              className="ml-1 text-xs font-medium text-red-600 hover:underline"
            >
              ล้างตัวกรอง
            </button>
          </div>
        )}
      </div>

      {/* Full-width Items Table */}
      <div className="flex min-h-[460px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">
              {selectedLocs.length === 0
                ? "ทุก Location"
                : selectedLocs.length === 1
                  ? selectedLocs[0].name
                  : `${selectedLocs.length} Location ที่เลือก`}
            </span>
            <span>·</span>
            <span>
              พบ <b className="text-slate-700">{total.toLocaleString()}</b> รายการ
            </span>
            {sortBy && (
              <button
                type="button"
                onClick={() => {
                  setSortBy("");
                  setSortOrder("asc");
                }}
                className="ml-2 inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200"
              >
                เรียงตาม {sortBy} ({sortOrder === "asc" ? "น้อย→มาก" : "มาก→น้อย"})
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <span className="text-[11px] text-slate-400">คลิกที่หัวคอลัมน์เพื่อเรียงลำดับข้อมูล</span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <SortableTh
                  label="ลำดับ"
                  sortKey="seq"
                  activeKey={sortBy}
                  order={sortOrder}
                  onSort={handleSort}
                  align="center"
                  className="w-20"
                />
                {showLocationCol && (
                  <SortableTh
                    label="Location"
                    sortKey="location"
                    activeKey={sortBy}
                    order={sortOrder}
                    onSort={handleSort}
                  />
                )}
                <SortableTh
                  label="itemtype"
                  sortKey="itemTypeId"
                  activeKey={sortBy}
                  order={sortOrder}
                  onSort={handleSort}
                  align="center"
                  className="w-28"
                />
                <SortableTh
                  label="code"
                  sortKey="code"
                  activeKey={sortBy}
                  order={sortOrder}
                  onSort={handleSort}
                />
                <SortableTh
                  label="name"
                  sortKey="name"
                  activeKey={sortBy}
                  order={sortOrder}
                  onSort={handleSort}
                />
                <SortableTh
                  label="unit"
                  sortKey="unit"
                  activeKey={sortBy}
                  order={sortOrder}
                  onSort={handleSort}
                />
                <th className="w-32 px-3 py-2.5 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingItems && !items.length ? (
                <tr>
                  <td colSpan={showLocationCol ? 7 : 6} className="py-14 text-center text-slate-400">
                    <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" /> กำลังโหลด...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={showLocationCol ? 7 : 6} className="py-14 text-center text-slate-400">
                    <Package className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    ไม่พบรายการ
                    {totals.items === 0 && (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          onClick={() => setShowImport(true)}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Upload className="h-4 w-4" /> นำเข้าไฟล์ location.xls
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => (
                  <tr key={it.id} className={`hover:bg-blue-50/40 ${loadingItems ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2 text-center font-mono text-slate-600">{it.seq}</td>
                    {showLocationCol && (
                      <td className="px-3 py-2">
                        <button
                          onClick={() => selectSingleLocation(it.locationId)}
                          className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                          title="กรองเฉพาะ Location นี้"
                        >
                          {it.location?.name}
                        </button>
                      </td>
                    )}
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-medium ${typeBadge(it.itemTypeId)}`}>
                        {itemTypeLabel(it.itemTypeId)}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-800">{it.code}</td>
                    <td className="px-3 py-2 text-slate-700">
                      <div className="max-w-[560px] truncate" title={it.name}>
                        {it.name}
                      </div>
                      {it.note && <div className="truncate text-xs text-slate-400">{it.note}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{it.unit || "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-0.5">
                        {canReorder && (
                          <>
                            <IconBtn
                              title="เลื่อนขึ้น"
                              disabled={page === 1 && idx === 0}
                              onClick={() => moveItem(it, "up")}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              title="เลื่อนลง"
                              disabled={page === totalPages && idx === items.length - 1}
                              onClick={() => moveItem(it, "down")}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </IconBtn>
                          </>
                        )}
                        <IconBtn
                          title="แก้ไข / ย้าย Location"
                          onClick={() =>
                            setItemForm({
                              id: it.id,
                              locationId: it.locationId,
                              seq: String(it.seq),
                              code: it.code,
                              name: it.name,
                              unit: it.unit || "",
                              note: it.note || "",
                            })
                          }
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn title="ลบ" danger onClick={() => deleteItem(it)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
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
              disabled={page <= 1 || loadingItems}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> ก่อนหน้า
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={page >= totalPages || loadingItems}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ถัดไป <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ===== Location form ===== */}
      <Dialog open={Boolean(locForm)} onOpenChange={(o) => !o && setLocForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{locForm?.id ? "แก้ไข Location" : "เพิ่ม Location ใหม่"}</DialogTitle>
            <DialogDescription>ชื่อ Location ต้องไม่ซ้ำกันภายในประเภทคลังเดียวกัน</DialogDescription>
          </DialogHeader>
          {locForm && (
            <form onSubmit={saveLocation} className="space-y-4">
              <div className="space-y-1.5">
                <Label>ชื่อ Location *</Label>
                <Input
                  autoFocus
                  value={locForm.name}
                  onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                  placeholder="เช่น 1F1"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>ประเภทคลัง (itemtype) *</Label>
                <TypeSelect
                  value={locForm.itemTypeId}
                  onChange={(v) => setLocForm({ ...locForm, itemTypeId: v })}
                />
                {locForm.id && (
                  <p className="text-xs text-amber-600">
                    การเปลี่ยนประเภทจะเปลี่ยน itemtype ของทุกรายการใน Location นี้ด้วย
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>รายละเอียด</Label>
                <Input
                  value={locForm.description}
                  onChange={(e) => setLocForm({ ...locForm, description: e.target.value })}
                  placeholder="เช่น ชั้น 1 ตู้ F แถว 1"
                />
              </div>
              <FormButtons saving={saving} onCancel={() => setLocForm(null)} />
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Item form ===== */}
      <Dialog open={Boolean(itemForm)} onOpenChange={(o) => !o && setItemForm(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{itemForm?.id ? "แก้ไขรายการ" : "เพิ่มรายการเข้า Location"}</DialogTitle>
            <DialogDescription>รหัส (code) ต้องไม่ซ้ำกันภายใน Location เดียวกัน</DialogDescription>
          </DialogHeader>
          {itemForm && (
            <form onSubmit={saveItem} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Location *</Label>
                  <select
                    value={itemForm.locationId}
                    onChange={(e) => setItemForm({ ...itemForm, locationId: e.target.value })}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                    required
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({itemTypeLabel(l.itemTypeId)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>ลำดับ</Label>
                  <Input
                    type="number"
                    min={1}
                    value={itemForm.seq}
                    onChange={(e) => setItemForm({ ...itemForm, seq: e.target.value })}
                    placeholder="อัตโนมัติ"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>รหัส (code) *</Label>
                <Input
                  autoFocus
                  value={itemForm.code}
                  onChange={(e) => setItemForm({ ...itemForm, code: e.target.value })}
                  className="font-mono"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>ชื่อรายการ (name) *</Label>
                <Input
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>หน่วย (unit)</Label>
                  <Input
                    value={itemForm.unit}
                    onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                    placeholder="เช่น หลอด, ขวด"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>หมายเหตุ</Label>
                  <Input
                    value={itemForm.note}
                    onChange={(e) => setItemForm({ ...itemForm, note: e.target.value })}
                  />
                </div>
              </div>
              <FormButtons saving={saving} onCancel={() => setItemForm(null)} />
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Delete location ===== */}
      <Dialog open={Boolean(deleteLoc)} onOpenChange={(o) => !o && setDeleteLoc(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" /> ลบ Location &quot;{deleteLoc?.loc.name}&quot;
            </DialogTitle>
            <DialogDescription>
              Location นี้มี {deleteLoc?.loc.itemCount.toLocaleString()} รายการ
              เลือกย้ายรายการไป Location อื่นก่อนลบ หรือลบรายการทั้งหมดไปพร้อมกัน
            </DialogDescription>
          </DialogHeader>
          {deleteLoc && (
            <div className="space-y-4">
              {deleteLoc.loc.itemCount > 0 && (
                <div className="space-y-1.5">
                  <Label>ย้ายรายการไปที่</Label>
                  <select
                    value={deleteLoc.moveTo}
                    onChange={(e) => setDeleteLoc({ ...deleteLoc, moveTo: e.target.value })}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">— ไม่ย้าย (ลบรายการทั้งหมด) —</option>
                    {locations
                      .filter((l) => l.id !== deleteLoc.loc.id)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({itemTypeLabel(l.itemTypeId)})
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDeleteLoc(null)}>
                  ยกเลิก
                </Button>
                <Button variant="destructive" size="sm" disabled={saving} onClick={doDeleteLocation}>
                  <Trash2 className="h-3.5 w-3.5" /> {deleteLoc.moveTo ? "ย้ายและลบ" : "ลบ"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Generic confirm ===== */}
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

      {/* ===== Import ===== */}
      <Dialog
        open={showImport}
        onOpenChange={(o) => {
          if (!o && !importing) {
            setShowImport(false);
            setParsed(null);
            setImportFileName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> นำเข้าทะเบียน ITEMSTORE จาก Excel
            </DialogTitle>
            <DialogDescription>
              รูปแบบไฟล์: คอลัม A = ชื่อ Location (แถวที่มีข้อมูลแค่ A,B) หรือ ลำดับ, B = itemtype (1 = Mainstore, 2 = พัสดุ), C = code, D = name, E = unit
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-6 text-center hover:bg-emerald-50"
            >
              <Upload className="mx-auto mb-2 h-7 w-7 text-emerald-600" />
              <p className="text-sm font-medium text-slate-700">
                {importFileName || "คลิกเพื่อเลือกไฟล์ .xls / .xlsx"}
              </p>
              {parsing && <p className="mt-1 text-xs text-slate-500">กำลังอ่านไฟล์...</p>}
              <input
                ref={fileRef}
                type="file"
                accept=".xls,.xlsx,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>

            {parsed && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">Location</div>
                    <div className="text-xl font-bold">{parsed.locations.length.toLocaleString()}</div>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">รายการ</div>
                    <div className="text-xl font-bold">{parsed.totalItems.toLocaleString()}</div>
                  </div>
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">คำเตือน</div>
                    <div className={`text-xl font-bold ${parsed.warnings.length ? "text-amber-600" : "text-emerald-600"}`}>
                      {parsed.warnings.length.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {parsedSummary.map((s) => (
                    <span key={s.id} className={`rounded-lg border px-3 py-1 text-xs ${typeBadge(s.id)}`}>
                      {s.name}: {s.locs.toLocaleString()} Location / {s.items.toLocaleString()} รายการ
                    </span>
                  ))}
                </div>

                <div className="max-h-40 overflow-auto rounded-lg border text-xs">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-slate-100">
                      <tr>
                        <th className="px-2 py-1 text-left">Location</th>
                        <th className="px-2 py-1">itemtype</th>
                        <th className="px-2 py-1 text-right">รายการ</th>
                        <th className="px-2 py-1 text-left">ตัวอย่าง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.locations.slice(0, 50).map((l) => (
                        <tr key={`${l.name}|${l.itemTypeId}`} className="border-t">
                          <td className="px-2 py-1 font-semibold underline">{l.name}</td>
                          <td className="px-2 py-1 text-center">{itemTypeLabel(l.itemTypeId)}</td>
                          <td className="px-2 py-1 text-right">{l.items.length}</td>
                          <td className="max-w-[260px] truncate px-2 py-1 text-slate-500">
                            {l.items[0] ? `${l.items[0].code} ${l.items[0].name}` : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {parsed.warnings.length > 0 && (
                  <div className="max-h-24 overflow-auto rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    {parsed.warnings.slice(0, 30).map((w, i) => (
                      <div key={i}>• {w}</div>
                    ))}
                    {parsed.warnings.length > 30 && <div>... และอีก {parsed.warnings.length - 30} รายการ</div>}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>วิธีการนำเข้า</Label>
                  <ModeOption
                    checked={importMode === "replace"}
                    onClick={() => setImportMode("replace")}
                    title="แทนที่ทั้งหมด (แนะนำสำหรับนำเข้าครั้งแรก)"
                    desc="ลบ Location และรายการเดิมของประเภทคลังที่อยู่ในไฟล์ แล้วนำเข้าใหม่ทั้งหมด"
                  />
                  <ModeOption
                    checked={importMode === "merge"}
                    onClick={() => setImportMode("merge")}
                    title="เพิ่ม / อัปเดต (ไม่ลบข้อมูลเดิม)"
                    desc="เพิ่ม Location / รายการใหม่ และอัปเดต ลำดับ ชื่อ หน่วย ของรหัสที่มีอยู่แล้ว"
                  />
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
                  setParsed(null);
                  setImportFileName("");
                }}
              >
                ยกเลิก
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={!parsed || !parsed.locations.length || importing}
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

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-sm text-white shadow-lg ${toast.type === "error" ? "border-red-700 bg-red-600" : "border-slate-800 bg-slate-900"
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

// ---------- small components ----------
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
  align?: "left" | "center";
  className?: string;
}) {
  const isActive = activeKey === sortKey;
  return (
    <th className={`px-3 py-2.5 ${align === "center" ? "text-center" : "text-left"} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 font-semibold uppercase transition hover:text-blue-600 ${isActive ? "text-blue-600" : "text-slate-500"
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
  sub,
  icon,
  color,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] text-slate-500">{label}</div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-slate-800">{value.toLocaleString()}</span>
          {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 transition disabled:opacity-30 ${danger ? "text-red-500 hover:bg-red-50" : "text-slate-500 hover:bg-blue-50 hover:text-blue-700"
        }`}
    >
      {children}
    </button>
  );
}

function TypeSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-2">
      {ITEM_TYPES.map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${value === t.id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 hover:bg-slate-50"
            }`}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}

function FormButtons({ saving, onCancel }: { saving: boolean; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" size="sm" onClick={onCancel}>
        ยกเลิก
      </Button>
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} บันทึก
      </Button>
    </div>
  );
}

function ModeOption({
  checked,
  onClick,
  title,
  desc,
}: {
  checked: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition ${checked ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"
        }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border ${checked ? "border-emerald-600 bg-emerald-600" : "border-slate-300"
          }`}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      <span>
        <span className="block text-sm font-medium text-slate-800">{title}</span>
        <span className="block text-xs text-slate-500">{desc}</span>
      </span>
    </button>
  );
}
