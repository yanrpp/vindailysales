"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/app/drive/page";
import {
  HardDrive,
  Download,
  Lock,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  Folder,
  File as FileIcon,
  AlertCircle,
  Eye,
  ArrowLeft,
} from "lucide-react";

interface ExcelSheetPreview {
  name: string;
  rows: any[][];
  totalRows: number;
}

export default function PublicSharedDrivePage() {
  const params = useParams();
  const token = params?.token as string;

  const [item, setItem] = useState<any>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [submittedPassword, setSubmittedPassword] = useState("");
  const [itemSummary, setItemSummary] = useState<{
    name: string;
    type: string;
    ownerName: string;
  } | null>(null);

  // Preview state
  const [excelSheets, setExcelSheets] = useState<ExcelSheetPreview[]>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [blobPreviewUrl, setBlobPreviewUrl] = useState<string | null>(null);

  const loadSharedItem = useCallback(
    async (pass = "") => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const q = pass ? `?password=${encodeURIComponent(pass)}` : "";
        const res = await fetch(`/api/drive/public/${token}${q}`);
        const data = await res.json();

        if (res.status === 401 && data.requiresPassword) {
          setRequiresPassword(true);
          setItemSummary(data.itemSummary || null);
          if (pass) setError(data.error || "รหัสผ่านไม่ถูกต้อง");
          setLoading(false);
          return;
        }

        if (!res.ok || !data.success) {
          setError(data.error || "ไม่พบไฟล์ที่แชร์ หรือลิงก์หมดอายุแล้ว");
          setLoading(false);
          return;
        }

        setRequiresPassword(false);
        setItem(data.item);
        setChildren(data.children || []);

        // โหลดพรีวิวอัตโนมัติหากเป็นไฟล์เดี่ยว
        if (data.item && data.item.type === "FILE") {
          const ext = (data.item.extension || "").toLowerCase();
          const mime = (data.item.mimeType || "").toLowerCase();
          const authQuery = `token=${encodeURIComponent(token)}${
            pass ? `&password=${encodeURIComponent(pass)}` : ""
          }`;

          if (["xls", "xlsx", "csv"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel")) {
            const pRes = await fetch(
              `/api/drive/${data.item.id}/download?format=excel-json&${authQuery}`
            );
            const pData = await pRes.json();
            if (pRes.ok && pData.sheets) setExcelSheets(pData.sheets);
          } else if (["txt", "md", "json", "log"].includes(ext) || mime.startsWith("text/")) {
            const pRes = await fetch(
              `/api/drive/${data.item.id}/download?format=text&${authQuery}`
            );
            const pData = await pRes.json();
            if (pRes.ok && typeof pData.text === "string") setTextPreview(pData.text);
          } else if (
            mime.startsWith("image/") ||
            mime === "application/pdf" ||
            mime.startsWith("video/") ||
            mime.startsWith("audio/")
          ) {
            const pRes = await fetch(
              `/api/drive/${data.item.id}/download?inline=true&${authQuery}`
            );
            if (pRes.ok) {
              const blob = await pRes.blob();
              setBlobPreviewUrl(URL.createObjectURL(blob));
            }
          }
        }
      } catch {
        setError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    loadSharedItem();
  }, [loadSharedItem]);

  const handleDownloadFile = async (targetItem: any) => {
    const authQuery = `token=${encodeURIComponent(token)}${
      submittedPassword ? `&password=${encodeURIComponent(submittedPassword)}` : ""
    }`;
    const res = await fetch(`/api/drive/${targetItem.id}/download?${authQuery}`);
    if (!res.ok) {
      alert("ไม่สามารถดาวน์โหลดไฟล์ได้");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = targetItem.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const renderIcon = (it: any) => {
    if (it.type === "FOLDER") return <Folder className="h-8 w-8 text-blue-600" />;
    const ext = (it.extension || "").toLowerCase();
    const mime = (it.mimeType || "").toLowerCase();
    if (mime.startsWith("image/")) return <ImageIcon className="h-8 w-8 text-rose-500" />;
    if (["xls", "xlsx", "csv"].includes(ext))
      return <FileSpreadsheet className="h-8 w-8 text-emerald-600" />;
    if (ext === "pdf") return <FileText className="h-8 w-8 text-red-600" />;
    return <FileIcon className="h-8 w-8 text-blue-600" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50/40 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Top Brand Bar */}
        <div className="flex items-center justify-between bg-white px-6 py-4 rounded-2xl shadow-xs border border-slate-200/80">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">
                Drug Management Cloud Drive
              </h1>
              <p className="text-xs text-slate-500">ระบบรับ-ส่งและแชร์ไฟล์ออนไลน์</p>
            </div>
          </div>
          <Link href="/drive">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              เข้าสู่คลังไฟล์ของฉัน
            </Button>
          </Link>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-16 text-center space-y-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
              <p className="text-sm text-slate-500">กำลังโหลดข้อมูลไฟล์ที่แชร์...</p>
            </CardContent>
          </Card>
        ) : requiresPassword ? (
          <Card className="max-w-md mx-auto border-blue-100 shadow-md">
            <CardHeader className="text-center">
              <div className="h-12 w-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-2">
                <Lock className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">ไฟล์นี้มีการป้องกันด้วยรหัสผ่าน</CardTitle>
              {itemSummary && (
                <p className="text-xs text-slate-500 mt-1">
                  รายการ: <strong>{itemSummary.name}</strong> (แชร์โดย {itemSummary.ownerName})
                </p>
              )}
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmittedPassword(passwordInput);
                  loadSharedItem(passwordInput);
                }}
                className="space-y-4"
              >
                {error && (
                  <div className="p-3 rounded-lg bg-red-50 text-red-600 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <Input
                  type="password"
                  placeholder="กรอกรหัสผ่านเพื่อเข้าถึงไฟล์..."
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  required
                  autoFocus
                />
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                  ปลดล็อกและเปิดไฟล์
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : error || !item ? (
          <Card className="max-w-lg mx-auto">
            <CardContent className="py-14 text-center space-y-3">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
              <h3 className="text-lg font-bold text-slate-800">ไม่สามารถเข้าถึงไฟล์ได้</h3>
              <p className="text-sm text-slate-500">{error}</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  {renderIcon(item)}
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-800">{item.name}</CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    ส่งโดย:{" "}
                    <span className="font-semibold text-slate-700">
                      {item.owner?.name || item.owner?.username}
                    </span>{" "}
                    • {item.type === "FOLDER" ? "โฟลเดอร์" : formatBytes(item.size)} •{" "}
                    {new Date(item.updatedAt).toLocaleString("th-TH")}
                  </p>
                  {item.description && (
                    <p className="text-sm text-slate-600 mt-1.5">{item.description}</p>
                  )}
                </div>
              </div>

              {item.type === "FILE" && item.allowDownload && (
                <Button
                  onClick={() => handleDownloadFile(item)}
                  className="bg-blue-600 hover:bg-blue-700 gap-2"
                >
                  <Download className="h-4 w-4" />
                  ดาวน์โหลดไฟล์ ({formatBytes(item.size)})
                </Button>
              )}
            </CardHeader>

            <CardContent className="p-6">
              {item.type === "FOLDER" ? (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700">
                    รายการไฟล์ในโฟลเดอร์ ({children.length})
                  </h4>
                  {children.length === 0 ? (
                    <p className="text-sm text-slate-400 py-8 text-center">
                      ไม่มีไฟล์ในโฟลเดอร์นี้
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {children.map((ch) => (
                        <div
                          key={ch.id}
                          className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-3">
                            {renderIcon(ch)}
                            <div>
                              <p className="text-sm font-medium text-slate-800">{ch.name}</p>
                              <p className="text-xs text-slate-400">
                                {ch.type === "FOLDER" ? "โฟลเดอร์" : formatBytes(ch.size)}
                              </p>
                            </div>
                          </div>
                          {ch.type === "FILE" && item.allowDownload && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadFile(ch)}
                              className="gap-1.5"
                            >
                              <Download className="h-3.5 w-3.5" />
                              ดาวน์โหลด
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* File Preview Section */
                <div className="min-h-[340px] bg-slate-50 rounded-xl p-4 flex items-center justify-center border border-slate-200/60">
                  {excelSheets.length > 0 ? (
                    <div className="w-full space-y-3">
                      <div className="flex items-center gap-2">
                        {excelSheets.map((sh, idx) => (
                          <button
                            key={sh.name}
                            onClick={() => setActiveSheetIdx(idx)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                              activeSheetIdx === idx
                                ? "bg-emerald-600 text-white"
                                : "bg-white border border-slate-200 text-slate-700"
                            }`}
                          >
                            {sh.name} ({sh.totalRows} แถว)
                          </button>
                        ))}
                      </div>
                      <div className="overflow-auto max-h-[60vh] border border-slate-200 rounded-lg bg-white">
                        <table className="w-full text-xs border-collapse">
                          <tbody>
                            {excelSheets[activeSheetIdx]?.rows.map((row, rIdx) => (
                              <tr
                                key={rIdx}
                                className={
                                  rIdx === 0
                                    ? "bg-slate-100 font-semibold sticky top-0"
                                    : "border-t border-slate-100"
                                }
                              >
                                {row.map((cell, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="px-3 py-1.5 border-r border-slate-100 whitespace-nowrap"
                                  >
                                    {cell !== null && cell !== undefined ? String(cell) : ""}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : textPreview !== null ? (
                    <pre className="w-full bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-auto max-h-[60vh] whitespace-pre-wrap">
                      {textPreview}
                    </pre>
                  ) : blobPreviewUrl && item.mimeType?.startsWith("image/") ? (
                    <img
                      src={blobPreviewUrl}
                      alt={item.name}
                      className="max-h-[65vh] max-w-full object-contain rounded-lg"
                    />
                  ) : blobPreviewUrl && item.mimeType === "application/pdf" ? (
                    <iframe
                      src={blobPreviewUrl}
                      title={item.name}
                      className="w-full h-[65vh] rounded-lg bg-white"
                    />
                  ) : (
                    <div className="text-center space-y-3 py-10">
                      <Eye className="h-10 w-10 text-slate-400 mx-auto" />
                      <p className="text-sm text-slate-600">
                        พร้อมสำหรับการดาวน์โหลด ({formatBytes(item.size)})
                      </p>
                      {item.allowDownload && (
                        <Button
                          onClick={() => handleDownloadFile(item)}
                          className="bg-blue-600 hover:bg-blue-700 gap-2"
                        >
                          <Download className="h-4 w-4" />
                          ดาวน์โหลดไฟล์
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
