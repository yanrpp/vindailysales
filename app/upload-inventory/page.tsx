"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";

export default function UploadInventoryPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    total_files: number;
    total_records: number;
    successCount: number;
    errorCount: number;
    results: Array<{
      filename: string;
      product_code: string;
      lot_no: string;
      success: boolean;
      error?: string;
    }>;
  } | null>(null);

  const upload = async () => {
    if (files.length === 0) {
      setStatus({ type: "error", message: "Please select at least one file first" });
      return;
    }

    setIsUploading(true);
    setStatus(null);
    setUploadResult(null);

    const form = new FormData();
    // รองรับหลายไฟล์
    files.forEach((file) => {
      form.append("files", file);
    });
    // กำหนดรูปแบบการ upload เป็น non_moving (ไฟล์สินค้าไม่เคลื่อนไหวย้อนหลัง 6 เดือน)
    form.append("format", "non_moving");

    try {
      const res = await fetch("/api/upload-inventory", {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!res.ok) {
        setStatus({ type: "error", message: json.error || "Upload failed" });
        setUploadResult(null);
      } else {
        setStatus({
          type: "success",
          message: json.message || `Successfully processed ${json.total_files} file(s) with ${json.successCount} records`,
        });
        setUploadResult(json);
        setFiles([]);
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: "Failed to upload file. Please try again.",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl font-semibold">อัปโหลดไฟล์</CardTitle>
              <p className="mt-1 text-sm text-gray-600">
                อัปโหลดไฟล์ Excel สำหรับจัดการสต็อกสินค้า
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/inventory/uploaded">
                <Button variant="outline" size="sm">
                  📋 ดูข้อมูลที่อัปโหลดแล้ว
                </Button>
              </Link>
              <Link href="/inventory">
                <Button variant="outline" size="sm">
                  📦 Dashboard
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" size="sm">
                  กลับหน้าหลัก
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* ข้อมูลรูปแบบการ upload */}
          <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <label className="text-sm font-medium text-gray-700">รูปแบบการอัปโหลด:</label>
            <p className="text-sm text-gray-700 font-semibold">
              ไฟล์ &quot;สินค้าไม่เคลื่อนไหวย้อนหลัง 6 เดือน&quot; (สินค้า + LOT + QTY + STORE)
            </p>
            <p className="text-xs text-gray-600 mt-2">
              <strong>คำอธิบาย:</strong> ใช้เทมเพลตไฟล์รายงานเดิมที่มีข้อมูลสินค้า, LOT, QTY และ STORE ในไฟล์เดียว
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              เลือกไฟล์ Excel (เลือกพร้อมกันได้หลายๆ ไฟล์)
            </label>
            <label
              htmlFor="file-upload"
              className="mt-1 flex flex-col items-center justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer"
            >
              <div className="space-y-2 text-center">
                <div className="flex text-sm text-gray-600">
                  <span className="font-medium text-blue-600 hover:text-blue-500">
                    คลิกเพื่อเลือกไฟล์
                  </span>
                  <span className="pl-1">หรือลากวางไฟล์ที่นี่</span>
                </div>
                <p className="text-xs text-gray-500">รองรับเฉพาะไฟล์ .XLSX เท่านั้น</p>
                <Input
                  id="file-upload"
                  name="file-upload"
                  type="file"
                  accept=".xlsx"
                  multiple
                  onChange={(e) => {
                    const selectedFiles = Array.from(e.target.files || []);
                    setFiles((prevFiles) => {
                      const newFiles = [...prevFiles];
                      selectedFiles.forEach((file) => {
                        if (!newFiles.some((f) => f.name === file.name && f.size === file.size)) {
                          newFiles.push(file);
                        }
                      });
                      return newFiles;
                    });
                  }}
                  className="sr-only"
                />
              </div>
              {files.length > 0 && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 w-full">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {files.length} {files.length === 1 ? "file" : "files"} selected
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFiles([])}
                      className="h-6 px-2 text-xs"
                    >
                      Clear
                    </Button>
                  </div>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${file.size}-${index}`}
                        className="flex items-center justify-between text-xs text-gray-700 bg-white px-2 py-1 rounded border border-gray-200"
                      >
                        <span className="truncate flex-1">{file.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">
                            ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
                            }}
                            className="text-red-500 hover:text-red-700 text-xs"
                            aria-label="Remove file"
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </label>
          </div>

          <div>
            <Button
              onClick={upload}
              disabled={files.length === 0 || isUploading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isUploading ? "กำลังอัปโหลด..." : `อัปโหลด ${files.length > 0 ? `${files.length} ` : ""}ไฟล์`}
            </Button>
          </div>

          {status && (
            <Alert
              className={
                status.type === "error"
                  ? "bg-red-50 border-red-200"
                  : "bg-green-50 border-green-200"
              }
            >
              <AlertDescription
                className={status.type === "error" ? "text-red-800" : "text-green-800"}
              >
                {status.message}
              </AlertDescription>
            </Alert>
          )}

          {uploadResult && (
            <div className="mt-4 border border-gray-200 rounded-lg bg-white">
              <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">ผลการอัปโหลด</h3>
              </div>
              <div className="px-4 py-3">
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">จำนวนไฟล์</dt>
                    <dd className="text-sm font-medium text-gray-900">{uploadResult.total_files}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">รวมทั้งหมด</dt>
                    <dd className="text-sm font-medium text-gray-900">{uploadResult.total_records}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">สำเร็จ</dt>
                    <dd className="text-sm font-medium text-green-600">
                      {uploadResult.successCount}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">ล้มเหลว</dt>
                    <dd className="text-sm font-medium text-red-600">
                      {uploadResult.errorCount}
                    </dd>
                  </div>
                </dl>
                {uploadResult.errorCount > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      รายการที่ล้มเหลว
                    </h4>
                    <ul className="space-y-2 max-h-40 overflow-y-auto">
                      {uploadResult.results
                        .filter((r) => !r.success)
                        .map((result, idx) => (
                          <li key={idx} className="text-xs text-red-600">
                            {result.filename && <span className="font-medium">{result.filename}: </span>}
                            {result.product_code && result.lot_no ? (
                              <span>{result.product_code} - {result.lot_no}: {result.error}</span>
                            ) : (
                              <span>{result.error}</span>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

