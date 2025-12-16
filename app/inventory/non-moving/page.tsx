"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import Link from "next/link";
import { Package, Search, Filter, Calendar, MapPin, UploadCloud, Download } from "lucide-react";
import { UploadInventoryModal } from "@/components/upload/UploadInventoryModal";
import ExcelJS from "exceljs";

interface ProductLot {
  id: string;
  lot_no: string;
  exp: string | null;
  qty: number;
  store: string | null;
}

interface ProductStore {
  store_location: string;
  lots: ProductLot[];
  total_qty: number;
}

interface Product {
  id: string;
  product_code: string;
  description: string;
  um: string;
  cost: number;
  item_type: string | null;
  date_report: {
    id: string;
    detail_date: string;
  } | null;
  stores: ProductStore[];
  store_qty: number[]; // จำนวนแต่ละ store (ตามลำดับ top_stores)
  lots: ProductLot[];
  total_lots: number;
  total_qty: number;
}

interface DateReport {
  id: string;
  detail_date: string;
}

export default function NonMovingPage() {
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDateReport, setSelectedDateReport] = useState<string>("");
  const [selectedStoreLocation, setSelectedStoreLocation] = useState<string>("");
  const [selectedItemType, setSelectedItemType] = useState<string>("");
  const [dateReports, setDateReports] = useState<DateReport[]>([]);
  const [storeLocations, setStoreLocations] = useState<string[]>([]);
  const [itemTypes, setItemTypes] = useState<string[]>([]);
  const [topStores, setTopStores] = useState<string[]>([]);
  const [actualStores, setActualStores] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  });
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dateReport, setDateReport] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });

      if (searchTerm) {
        params.append("search", searchTerm);
      }
      if (selectedDateReport) {
        params.append("date_report_id", selectedDateReport);
      }
      if (selectedStoreLocation) {
        params.append("store_location", selectedStoreLocation);
      }
      if (selectedItemType) {
        params.append("item_type", selectedItemType);
      }

      const response = await fetch(`/api/inventory/uploaded?${params}`);
        const json = await response.json();

        if (response.ok && json.success) {
          setData(json.data || []);
        setPagination(json.pagination || { page: 1, pageSize: 50, total: 0, totalPages: 0 });
        if (json.filters) {
          setDateReports(json.filters.date_reports || []);
          setStoreLocations(json.filters.store_locations || []);
          setItemTypes(json.filters.item_types || []);
          const apiTopStores = json.filters.top_stores || [];
          setTopStores(apiTopStores);
          setActualStores(apiTopStores); // ใช้ top_stores จาก API ที่คำนวณจากข้อมูลทั้งหมดที่ filter แล้ว
        }
        // ดึงวันที่รายงานที่เลือก (ถ้ามี)
        if (selectedDateReport) {
          const selectedReport = json.filters?.date_reports?.find((dr: DateReport) => dr.id === selectedDateReport);
          setDateReport(selectedReport ? selectedReport.detail_date : null);
        } else {
          // ถ้าไม่เลือก ให้ใช้ล่าสุด
          const latestReport = json.filters?.date_reports?.[0];
          setDateReport(latestReport ? latestReport.detail_date : null);
        }
        } else {
          setError(json.error || "Failed to load data");
        }
      } catch (err) {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
  }, [page, pageSize, searchTerm, selectedDateReport, selectedStoreLocation, selectedItemType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleProduct = (productId: string) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedProducts(newExpanded);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency: "THB",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Export to Excel
  const exportToExcel = async () => {
    if (data.length === 0) {
      alert("ไม่มีข้อมูลให้ export");
      return;
    }

    setExporting(true);
    try {
      // ดึงข้อมูลทั้งหมดที่ filter แล้ว (ไม่ใช่แค่หน้าปัจจุบัน)
      const params = new URLSearchParams({
        page: "1",
        pageSize: "10000", // ดึงข้อมูลทั้งหมด
      });

      if (searchTerm) {
        params.append("search", searchTerm);
      }
      if (selectedDateReport) {
        params.append("date_report_id", selectedDateReport);
      }
      if (selectedStoreLocation) {
        params.append("store_location", selectedStoreLocation);
      }
      if (selectedItemType) {
        params.append("item_type", selectedItemType);
      }

      const response = await fetch(`/api/inventory/uploaded?${params}`);
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || "Failed to fetch data for export");
      }

      const allData: Product[] = json.data || [];

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("รายงานสินค้าไม่เคลื่อนไหว");

      // helper แปลงวันที่เป็นข้อความ พ.ศ. ไทย สำหรับใส่ใน Excel
      const formatThaiDateForExcel = (dateString: string) => {
        try {
          const d = new Date(dateString);
          if (isNaN(d.getTime())) return dateString;
          return d.toLocaleDateString("th-TH", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        } catch {
          return dateString;
        }
      };

      // หาช่วงวันที่จาก date_reports
      const dateReports = json.filters?.date_reports || [];
      let dateRange = "";
      const detailDateList =
        dateReports && dateReports.length > 0
          ? dateReports.map((dr: DateReport) => dr.detail_date).join(", ")
          : "";
      let reportDateForCheck: Date | null = null;

      if (dateReports.length > 0) {
        // ใช้ค่า detail_date ตรงๆ สำหรับแสดงช่วงวันที่ (ไม่พยายาม parse เป็น Date เพื่อไม่ให้หายกรณีเป็นรูปแบบภาษาไทย)
        const rawDates = dateReports.map((dr: DateReport) => dr.detail_date);
        if (rawDates.length === 1) {
          dateRange = rawDates[0];
        } else if (rawDates.length > 1) {
          dateRange = `${rawDates[0]} ถึง ${rawDates[rawDates.length - 1]}`;
        }

        // แยกอีกครั้งสำหรับใช้ตรวจสอบวันหมดอายุ (พยายาม parse เป็น Date ถ้าทำได้)
        const parsedDates = rawDates
          .map((d: string) => new Date(d))
          .filter((dt: Date) => !isNaN(dt.getTime()))
          .sort((a: Date, b: Date) => a.getTime() - b.getTime());

        if (parsedDates.length > 0) {
          reportDateForCheck = parsedDates[parsedDates.length - 1];
        }
      }
      // ถ้าไม่มีข้อมูลวันที่ในรายงาน ให้ใช้วันที่ปัจจุบันเป็นวันที่ออกรายงาน
      if (!reportDateForCheck) {
        reportDateForCheck = new Date();
      }

      // Header: ชื่อโรงพยาบาล
      const hospitalName = "โรงพยาบาลวิชัยเวชอินเตอร์เนชั่นแนล หนองแขม";
      worksheet.mergeCells("A1:L1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = hospitalName;
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };

      // Header: ชื่อรายงาน
      worksheet.mergeCells("A2:L2");
      const reportTitleCell = worksheet.getCell("A2");
      reportTitleCell.value = "รายงานสินค้าไม่เคลื่อนไหว";
      reportTitleCell.font = { bold: true, size: 12 };
      reportTitleCell.alignment = { horizontal: "center", vertical: "middle" };

      // Header: ช่วงวันที่ข้อมูลในรายงาน + รายการวันที่รายงาน (ถ้ามี)
      if (dateRange) {
        worksheet.mergeCells("A3:L3");
        const dateCell = worksheet.getCell("A3");
        dateCell.value = detailDateList
          ? `ช่วงวันที่ข้อมูลในรายงาน: ${dateRange}`
          : `ช่วงวันที่ข้อมูลในรายงาน: ${dateRange}`;
        dateCell.font = { size: 11 };
        dateCell.alignment = { horizontal: "center", vertical: "middle" };
      }

      // แสดงวันที่-เวลาออกรายงาน มุมซ้ายบน (ใต้หัวรายงาน)
      const printInfoRowIndex = dateRange ? 4 : 3;
      const printInfoCell = worksheet.getCell(`A${printInfoRowIndex}`);
      const printedAtText = new Date().toLocaleString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      printInfoCell.value = `วันที่ออกรายงาน: ${printedAtText}`;
      printInfoCell.alignment = { horizontal: "left", vertical: "middle" };

      // Empty row
      worksheet.addRow([]);

      // Table Headers (ตามตัวอย่างไฟล์ Excel)
      const headerRowIndex = dateRange ? 5 : 4;
      const headers = [
        "no",
        "หมวดหมู่",
        "รหัสสินค้า",
        "รายการสินค้า",
        "หน่วย",
        ...actualStores.map((store) => formatStoreLocation(store, true)),
        "รวมจำนวน",
        "ราคา/หน่วย",
        "รวมราคา",
        "LOT No.",
        "วันหมดอายุ",
        "จำนวน",
        "สถานที่เก็บ",
      ];

      const headerRow = worksheet.getRow(headerRowIndex);
      headers.forEach((header, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = header;
        cell.font = { bold: true };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE3F2FD" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Data rows (แปลงให้แต่ละ LOT เป็นแถว ตามตัวอย่างไฟล์)
      let totalQty = 0;
      let totalPrice = 0;

      // คำนวณ index ของคอลัมน์ต่าง ๆ ให้ตรงกับ headers ด้านบน
      const noColIndex = 1;
      const categoryColIndex = 2;
      const codeColIndex = 3;
      const nameColIndex = 4;
      const unitColIndex = 5;
      const firstStoreColIndex = 6;
      const lastStoreColIndex = 5 + actualStores.length;
      const totalQtyColIndex = lastStoreColIndex + 1;
      const costColIndex = totalQtyColIndex + 1;
      const totalPriceColIndex = costColIndex + 1;
      const lotNoColIndex = totalPriceColIndex + 1;
      const lotExpColIndex = lotNoColIndex + 1;
      const lotQtyColIndex = lotExpColIndex + 1;
      const lotStoreColIndex = lotQtyColIndex + 1;

      let currentRowIndex = headerRowIndex + 1;

      allData.forEach((product, productIndex) => {
        const productTotalPrice =
          product.cost && product.total_qty ? product.cost * product.total_qty : 0;

        const sortedLots =
          product.lots && product.lots.length > 0
            ? [...product.lots].sort((a, b) => {
                if (!a.exp && !b.exp) return 0;
                if (!a.exp) return 1;
                if (!b.exp) return -1;
                const da = new Date(a.exp);
                const db = new Date(b.exp);
                if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
                return da.getTime() - db.getTime();
              })
            : [null];

        sortedLots.forEach((lot, lotIndex) => {
          const row = worksheet.getRow(currentRowIndex);

          const isFirstLotRow = lotIndex === 0;

          if (isFirstLotRow) {
            // no
            row.getCell(noColIndex).value = productIndex + 1;
            row.getCell(noColIndex).alignment = { horizontal: "center" };
            row.getCell(noColIndex).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };

            // หมวดหมู่
            row.getCell(categoryColIndex).value = product.item_type || "";
            row.getCell(categoryColIndex).alignment = { horizontal: "left" };
            row.getCell(categoryColIndex).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };

            // รหัสสินค้า
            row.getCell(codeColIndex).value = product.product_code || "";
            row.getCell(codeColIndex).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };

            // รายการสินค้า (product_code + description)
            const productName = product.description || "";
            row.getCell(nameColIndex).value = productName;
            row.getCell(nameColIndex).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };

            // หน่วย
            row.getCell(unitColIndex).value = product.um || "";
            row.getCell(unitColIndex).alignment = { horizontal: "center" };
            row.getCell(unitColIndex).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };

            // จำนวนแต่ละ store (รวมทั้งหมดของ product ต่อ store)
            let storeColIndex = firstStoreColIndex;
            actualStores.forEach((store) => {
              const storeIndexInTopStores = topStores.indexOf(store);
              const qty =
                product.store_qty &&
                storeIndexInTopStores >= 0 &&
                product.store_qty[storeIndexInTopStores] !== undefined
                  ? product.store_qty[storeIndexInTopStores]
                  : 0;
              row.getCell(storeColIndex).value = qty;
              row.getCell(storeColIndex).numFmt = "#,##0.00";
              row.getCell(storeColIndex).alignment = { horizontal: "right" };
              row.getCell(storeColIndex).border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
              storeColIndex++;
            });

            // รวมจำนวน (ของ product ทั้งหมด)
            row.getCell(totalQtyColIndex).value = product.total_qty || 0;
            row.getCell(totalQtyColIndex).numFmt = "#,##0.00";
            row.getCell(totalQtyColIndex).alignment = { horizontal: "right" };
            row.getCell(totalQtyColIndex).font = { bold: true };
            row.getCell(totalQtyColIndex).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };

            // ราคา/หน่วย
            row.getCell(costColIndex).value = product.cost || 0;
            row.getCell(costColIndex).numFmt = "#,##0.00";
            row.getCell(costColIndex).alignment = { horizontal: "right" };
            row.getCell(costColIndex).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };

            // รวมราคา
            row.getCell(totalPriceColIndex).value = productTotalPrice;
            row.getCell(totalPriceColIndex).numFmt = "#,##0.00";
            row.getCell(totalPriceColIndex).alignment = { horizontal: "right" };
            row.getCell(totalPriceColIndex).font = { bold: true };
            row.getCell(totalPriceColIndex).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          } else {
            // แถว LOT เพิ่มเติม ให้ border ครอบคลุมช่องว่างด้านหน้า เพื่อความสวยงาม
            for (let col = noColIndex; col <= totalPriceColIndex; col++) {
              const cell = row.getCell(col);
              cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            }
          }

          // ข้อมูล LOT (ถ้ามี)
          if (lot) {
            const lotExpired =
              !!lot.exp &&
              !!reportDateForCheck &&
              (() => {
                const expDate = new Date(lot.exp as string);
                return !isNaN(expDate.getTime()) && expDate.getTime() < reportDateForCheck!.getTime();
              })();

            // LOT No.
            row.getCell(lotNoColIndex).value = lot.lot_no;
            row.getCell(lotNoColIndex).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };

            // วันหมดอายุ
            if (lot.exp) {
              row.getCell(lotExpColIndex).value = formatThaiDateForExcel(lot.exp);
            }
            row.getCell(lotExpColIndex).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };

            // จำนวน LOT
            row.getCell(lotQtyColIndex).value = lot.qty;
            row.getCell(lotQtyColIndex).numFmt = "#,##0.00";
            row.getCell(lotQtyColIndex).alignment = { horizontal: "right" };
            row.getCell(lotQtyColIndex).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };

            // สถานที่เก็บ
            row.getCell(lotStoreColIndex).value = lot.store
              ? formatStoreLocation(lot.store, true)
              : "";
            row.getCell(lotStoreColIndex).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };

            // ถ้า LOT หมดอายุแล้ว (เมื่อเทียบกับวันที่ออกรายงาน) ให้ตัวหนังสือ 4 คอลัมน์ LOT เป็นสีแดง
            if (lotExpired) {
              [lotNoColIndex, lotExpColIndex, lotQtyColIndex, lotStoreColIndex].forEach(
                (colIndex) => {
                  const cell = row.getCell(colIndex);
                  const existingFont = cell.font || {};
                  cell.font = {
                    ...existingFont,
                    color: { argb: "FFFF0000" }, // แดง
                  };
                }
              );
            }
          } else {
            // product ที่ไม่มี LOT ให้ใส่ border ช่อง LOT ว่าง
            [lotNoColIndex, lotExpColIndex, lotQtyColIndex, lotStoreColIndex].forEach(
              (col) => {
                const cell = row.getCell(col);
                cell.border = {
                  top: { style: "thin" },
                  left: { style: "thin" },
                  bottom: { style: "thin" },
                  right: { style: "thin" },
                };
              }
            );
          }

          currentRowIndex++;
        });

        totalQty += product.total_qty || 0;
        totalPrice += productTotalPrice;
      });

      // Footer: รวมจำนวนและรวมราคา
      const footerRowIndex = currentRowIndex;
      const footerRow = worksheet.getRow(footerRowIndex);
      
      // Merge cells สำหรับ "รวม"
      const mergeEndCol = lastStoreColIndex;
      worksheet.mergeCells(footerRowIndex, 1, footerRowIndex, mergeEndCol + 1);
      const mergedCell = footerRow.getCell(1);
      mergedCell.value = "รวม";
      mergedCell.font = { bold: true };
      mergedCell.alignment = { horizontal: "center" };
      mergedCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE3F2FD" },
      };
      mergedCell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };

      // รวมจำนวน
      footerRow.getCell(totalQtyColIndex).value = totalQty;
      footerRow.getCell(totalQtyColIndex).numFmt = "#,##0.00";
      footerRow.getCell(totalQtyColIndex).alignment = { horizontal: "right" };
      footerRow.getCell(totalQtyColIndex).font = { bold: true };
      footerRow.getCell(totalQtyColIndex).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE3F2FD" },
      };
      footerRow.getCell(totalQtyColIndex).border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };

      // รวมราคา
      footerRow.getCell(totalPriceColIndex).value = totalPrice;
      footerRow.getCell(totalPriceColIndex).numFmt = "#,##0.00";
      footerRow.getCell(totalPriceColIndex).alignment = { horizontal: "right" };
      footerRow.getCell(totalPriceColIndex).font = { bold: true };
      footerRow.getCell(totalPriceColIndex).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE3F2FD" },
      };
      footerRow.getCell(totalPriceColIndex).border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };

      // Set column widths ให้เหมาะกับรูปแบบรายงานใหม่
      worksheet.getColumn(noColIndex).width = 6; // no
      worksheet.getColumn(categoryColIndex).width = 15; // หมวดหมู่
      worksheet.getColumn(codeColIndex).width = 18; // รหัสสินค้า
      worksheet.getColumn(nameColIndex).width = 45; // รายการสินค้า
      worksheet.getColumn(unitColIndex).width = 10; // หน่วย
      actualStores.forEach((_, index) => {
        worksheet.getColumn(firstStoreColIndex + index).width = 15; // stores
      });
      worksheet.getColumn(totalQtyColIndex).width = 15; // รวมจำนวน
      worksheet.getColumn(costColIndex).width = 15; // ราคา/หน่วย
      worksheet.getColumn(totalPriceColIndex).width = 15; // รวมราคา
      worksheet.getColumn(lotNoColIndex).width = 15; // LOT No.
      worksheet.getColumn(lotExpColIndex).width = 15; // วันหมดอายุ
      worksheet.getColumn(lotQtyColIndex).width = 15; // จำนวน
      worksheet.getColumn(lotStoreColIndex).width = 20; // สถานที่เก็บ

      // เส้นขอบตารางช่วงท้าย: เติม border ให้ทุกคอลัมน์ของแถว footer ถึงคอลัมน์สุดท้าย
      for (let col = 1; col <= lotStoreColIndex; col++) {
        const cell = footerRow.getCell(col);
        const existingBorder = cell.border || {};
        cell.border = {
          top: existingBorder.top || { style: "thin" },
          left: existingBorder.left || { style: "thin" },
          bottom: existingBorder.bottom || { style: "thin" },
          right: existingBorder.right || { style: "thin" },
        };
      }

      // ตั้งค่าฟอนต์ทั้งชีตเป็น Angsana New ขนาด 16 โดยคงค่า bold/ลักษณะเดิมของ cell ไว้
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          const existingFont = cell.font || {};
          cell.font = {
            ...existingFont,
            name: "Angsana New",
            size: 16,
          };
        });
      });

      // Generate file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().split("T")[0];
      link.download = `รายงานสินค้าไม่เคลื่อนไหว-${dateStr}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Export error:", error);
      alert(`เกิดข้อผิดพลาดในการ export: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  // Export to CSV
  const exportToCSV = async () => {
    if (data.length === 0) {
      alert("ไม่มีข้อมูลให้ export");
      return;
    }

    setExporting(true);
    try {
      // ดึงข้อมูลทั้งหมดที่ filter แล้ว (ไม่ใช่แค่หน้าปัจจุบัน)
      const params = new URLSearchParams({
        page: "1",
        pageSize: "10000", // ดึงข้อมูลทั้งหมด
      });

      if (searchTerm) {
        params.append("search", searchTerm);
      }
      if (selectedDateReport) {
        params.append("date_report_id", selectedDateReport);
      }
      if (selectedStoreLocation) {
        params.append("store_location", selectedStoreLocation);
      }
      if (selectedItemType) {
        params.append("item_type", selectedItemType);
      }

      const response = await fetch(`/api/inventory/uploaded?${params}`);
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || "Failed to fetch data for export");
      }

      const allData: Product[] = json.data || [];

      // Headers
      const headers = [
        "รหัสสินค้า",
        "รายละเอียด",
        "หน่วย",
        "ราคา/หน่วย",
        ...actualStores.map((store) => formatStoreLocation(store, true)),
        "หมวดหมู่",
        "วันที่รายงาน",
        "จำนวน LOT",
        "รวมจำนวน",
      ];

      // CSV content
      const csvRows = [headers.join(",")];

      // Data rows
      allData.forEach((product) => {
        const row = [
          `"${product.product_code}"`,
          `"${(product.description || "").replace(/"/g, '""')}"`,
          `"${product.um || ""}"`,
          product.cost || 0,
          ...actualStores.map((store) => {
            const storeIndexInTopStores = topStores.indexOf(store);
            const qty = product.store_qty && storeIndexInTopStores >= 0 && product.store_qty[storeIndexInTopStores] !== undefined
              ? product.store_qty[storeIndexInTopStores]
              : 0;
            return qty;
          }),
          `"${product.item_type || ""}"`,
          `"${product.date_report?.detail_date || ""}"`,
          product.total_lots || 0,
          product.cost && product.total_qty ? product.cost * product.total_qty : 0,
        ];
        csvRows.push(row.join(","));
      });

      // Generate file
      const csvContent = csvRows.join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().split("T")[0];
      link.download = `รายงานสินค้าไม่เคลื่อนไหว-${dateStr}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Export error:", error);
      alert(`เกิดข้อผิดพลาดในการ export: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  const formatStoreLocation = (storeCode: string, includeCode: boolean = false): string => {
    if (!storeCode) return storeCode;
    
    // Mapping store codes to display names
    const storeMapping: { [key: string]: string } = {
      "D2": "ห้องยาอาคาร 2",
      "D5": "ห้องยาอาคาร 5",
      "D5A": "ห้องยาอาคาร 5A",
      "P": "คลังสินค้า",
      "S": "พัสดุ",
    };

    // Check if storeCode matches exactly
    if (storeMapping[storeCode]) {
      return includeCode ? `${storeMapping[storeCode]}(${storeCode})` : storeMapping[storeCode];
    }

    // Check if storeCode starts with any key (for cases like D2-xxx)
    for (const [key, value] of Object.entries(storeMapping)) {
      if (storeCode.startsWith(key)) {
        if (includeCode) {
          return `${value}(${key})`;
        }
        return value;
      }
    }

    // Return original if no match
    return storeCode;
  };

  return (
    <div className="w-full py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 flex items-center gap-2">
            <Package className="h-8 w-8" />
            รายงานสินค้าไม่เคลื่อนไหว
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            แสดงข้อมูลสินค้าที่อัปโหลดจากไฟล์ Excel พร้อมรายละเอียด LOT และวันที่รายงาน
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setUploadModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <UploadCloud className="h-4 w-4 mr-2" />
            อัปโหลดไฟล์
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToExcel}
            disabled={exporting || data.length === 0}
            className="bg-green-50 hover:bg-green-100 text-green-700 border-green-300"
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "กำลัง export..." : "Export Excel"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            disabled={exporting || data.length === 0}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300"
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "กำลัง export..." : "Export CSV"}
          </Button>
          <Link href="/inventory">
            <Button variant="outline" size="sm">
              Dashboard
            </Button>
          </Link>
        </div>
      </div>

      {/* Upload Modal */}
      <UploadInventoryModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onUploadSuccess={() => {
          // Reload data after successful upload
          loadData();
        }}
      />

      {/* Filters */}
      <Card className="mb-6 mx-0">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            กรองข้อมูล
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                ค้นหา
              </Label>
              <Input
                id="search"
                placeholder="ค้นหารหัสสินค้า, ชื่อสินค้า..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date-report" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                วันที่รายงาน
              </Label>
              <select
                id="date-report"
                value={selectedDateReport}
                onChange={(e) => {
                  setSelectedDateReport(e.target.value);
                  setPage(1);
                }}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">ทั้งหมด</option>
                {dateReports.map((dr) => (
                  <option key={dr.id} value={dr.id}>
                    {dr.detail_date}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-location" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                สถานที่เก็บ
              </Label>
              <select
                id="store-location"
                value={selectedStoreLocation}
                onChange={(e) => {
                  setSelectedStoreLocation(e.target.value);
                  setPage(1);
                }}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">ทั้งหมด</option>
                {storeLocations.map((sl) => (
                  <option key={sl} value={sl}>
                    {formatStoreLocation(sl, true)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-type" className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                หมวดหมู่
              </Label>
              <select
                id="item-type"
                value={selectedItemType}
                onChange={(e) => {
                  setSelectedItemType(e.target.value);
                  setPage(1);
                }}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">ทั้งหมด</option>
                {itemTypes.map((it) => (
                  <option key={it} value={it}>
                    {it}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="pageSize" className="text-sm">
                แสดงต่อหน้า:
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
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setSelectedDateReport("");
                setSelectedStoreLocation("");
                setSelectedItemType("");
                setPage(1);
              }}
            >
              ล้างตัวกรอง
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card className="mx-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>รายการสินค้า</CardTitle>
            <div className="text-sm text-gray-600">
              ทั้งหมด {pagination.total} รายการ | หน้า {pagination.page} จาก {pagination.totalPages}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {data.length > 0 && (
            <div className="mb-4 flex items-center gap-4 text-sm text-gray-600">
              <span>
                แสดง {(pagination.page - 1) * pagination.pageSize + 1} ถึง{" "}
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} จาก{" "}
                {pagination.total} รายการ
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
          )}
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : data.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-semibold text-gray-700 mb-2">
                ไม่พบข้อมูล
              </p>
              <p className="text-sm text-gray-500">
                {searchTerm || selectedDateReport || selectedStoreLocation || selectedItemType
                  ? "ลองเปลี่ยนเงื่อนไขการค้นหา"
                  : "ยังไม่มีข้อมูลที่อัปโหลด"}
              </p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto w-full">
              <Table className="w-full">
                <TableHeader>
                    <TableRow className="bg-blue-50">
                      <TableHead className="w-12" rowSpan={2}></TableHead>
                      <TableHead rowSpan={2}>หมวดหมู่</TableHead>
                      <TableHead rowSpan={2}>รหัสสินค้า</TableHead>
                      <TableHead rowSpan={2}>รายละเอียด</TableHead>
                      <TableHead rowSpan={2}>หน่วย</TableHead>
                      <TableHead rowSpan={2}>ราคา/หน่วย</TableHead>
                      <TableHead colSpan={actualStores.length || 5} className="text-center">จำนวนแต่ละ store(รวม)</TableHead>
                      <TableHead rowSpan={2} className="text-right">รวมจำนวน</TableHead>
                      <TableHead rowSpan={2} className="text-right">จำนวน LOT</TableHead>
                      <TableHead rowSpan={2} className="text-right">รวม</TableHead>
                    </TableRow>
                    <TableRow className="bg-blue-50">
                      {actualStores.map((store, index) => (
                        <TableHead key={store || `store-${index}`} className="text-right text-xs">
                          {formatStoreLocation(store || `Store ${index + 1}`, true)}
                        </TableHead>
                      ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((product) => (
                      <Fragment key={product.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-blue-50"
                          onClick={() => toggleProduct(product.id)}
                        >
                      <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                            >
                              {expandedProducts.has(product.id) ? "−" : "+"}
                            </Button>
                          </TableCell>
                          <TableCell>{product.item_type || "-"}</TableCell>
                          <TableCell className="font-medium">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                              {product.product_code}
                        </code>
                      </TableCell>
                          <TableCell>{product.description || "-"}</TableCell>
                          <TableCell>{product.um || "-"}</TableCell>
                      <TableCell>
                            {product.cost ? formatCurrency(product.cost) : "-"}
                          </TableCell>
                          {/* จำนวนแต่ละ store (ทุกคอลัมน์) */}
                          {actualStores.map((store, index) => {
                            // หา index ของ store ใน topStores เพื่อดึงข้อมูล qty ที่ถูกต้อง
                            const storeIndexInTopStores = topStores.indexOf(store);
                            const qty = product.store_qty && storeIndexInTopStores >= 0 && product.store_qty[storeIndexInTopStores] !== undefined 
                              ? product.store_qty[storeIndexInTopStores] 
                              : 0;
                            return (
                              <TableCell key={store || `store-${index}`} className="text-right font-semibold">
                                {qty > 0 ? qty.toLocaleString() : "-"}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-right font-semibold text-blue-600">
                            {product.total_qty ? Math.round(product.total_qty).toLocaleString() : "-"}
                          </TableCell>
                      <TableCell className="text-right font-semibold">
                            {product.total_lots}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {product.cost && product.total_qty
                              ? formatCurrency(product.cost * product.total_qty)
                              : "-"}
                          </TableCell>
                        </TableRow>
                        {expandedProducts.has(product.id) && product.lots.length > 0 && (
                          <TableRow key={`${product.id}-lots`} className="bg-gray-50">
                            <TableCell colSpan={10 + (actualStores.length || 5)}>
                              <div className="pl-8 py-4">
                                <h4 className="text-sm font-semibold mb-3 text-gray-700">
                                  รายละเอียด LOT ({product.lots.length} รายการ)
                                </h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                                      <TableRow className="bg-gray-100">
                                        <TableHead>LOT No.</TableHead>
                                        <TableHead>วันหมดอายุ</TableHead>
                                        <TableHead>จำนวน</TableHead>
                                        <TableHead>สถานที่เก็บ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                                      {product.lots.map((lot) => (
                                        <TableRow key={lot.id}>
                      <TableCell>
                                            <code className="text-xs bg-white px-2 py-1 rounded border">
                                              {lot.lot_no}
                        </code>
                      </TableCell>
                      <TableCell>
                                            {lot.exp ? formatDate(lot.exp) : "ไม่ระบุ"}
                      </TableCell>
                                          <TableCell className="font-semibold">
                                            {lot.qty.toLocaleString()}
                      </TableCell>
                                          <TableCell>{lot.store ? formatStoreLocation(lot.store, true) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
                              </div>
                      </TableCell>
                    </TableRow>
                        )}
                      </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    แสดง {(pagination.page - 1) * pagination.pageSize + 1} ถึง{" "}
                    {Math.min(pagination.page * pagination.pageSize, pagination.total)} จาก{" "}
                    {pagination.total} รายการ
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
                      disabled={page >= pagination.totalPages}
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
