"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    files_processed: number;
    sheets_processed: number;
    total_rows: number;
    details: Array<{ filename: string; sheet_name: string; report_id: number; rows: number }>;
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

    try {
      const res = await fetch("/api/upload-excel", {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!res.ok) {
        // Handle duplicate report error specifically
        if (res.status === 409 && json.error === "DUPLICATE_REPORT") {
          setStatus({
            type: "error",
            message: `⚠️ พบรายการซ้ำ: ${json.message || "A report with the same date, store, and category already exists."}`,
          });
        } else {
          setStatus({ type: "error", message: `Error: ${json.error || json.message || "Unknown error occurred"}` });
        }
        setUploadResult(null);
      } else {
        setStatus({
          type: "success",
          message: `Successfully processed ${json.files_processed || 1} file(s), ${json.sheets_processed} sheet(s) with ${json.total_rows} total rows`,
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
    <div className="flex items-center justify-center">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div>
            <CardTitle className="text-2xl font-semibold">Upload Sales Report</CardTitle>
            <p className="mt-1 text-sm text-gray-600">
              Upload Excel files to import drug data
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Excel Files (เลือกพร้อมกันได้หลายๆ ไฟล์พร้อมกัน)
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
                    // รวมกับไฟล์ที่มีอยู่แล้ว (ถ้าต้องการเพิ่มไฟล์)
                    setFiles((prevFiles) => {
                      const newFiles = [...prevFiles];
                      selectedFiles.forEach((file) => {
                        // ตรวจสอบว่าไฟล์ซ้ำหรือไม่
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
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
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
            <p className="text-sm text-gray-500 mb-4">
              รองรับหลายไฟล์และหลาย sheet ต่อไฟล์ ไฟล์ทั้งหมดต้องมีโครงสร้างเดียวกัน
            </p>
            <Button
              onClick={upload}
              disabled={files.length === 0 || isUploading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isUploading ? "กำลังอัปโหลด..." : `อัปโหลด ${files.length > 0 ? `${files.length} ` : ""}ไฟล์${files.length !== 1 ? "" : ""}`}
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
                className={
                  status.type === "error" ? "text-red-800" : "text-green-800"
                }
              >
                <div className="whitespace-pre-line">{status.message}</div>
              </AlertDescription>
            </Alert>
          )}

          {uploadResult && (
            <div className="mt-4 border border-gray-200 rounded-lg bg-white">
              <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">Upload Details</h3>
              </div>
              <div className="px-4 py-3">
                <dl className="space-y-3">
                  {uploadResult.files_processed !== undefined && (
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500">Files Processed</dt>
                      <dd className="text-sm font-medium text-gray-900">
                        {uploadResult.files_processed}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Sheets Processed</dt>
                    <dd className="text-sm font-medium text-gray-900">
                      {uploadResult.sheets_processed}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Total Rows</dt>
                    <dd className="text-sm font-medium text-gray-900">
                      {uploadResult.total_rows}
                    </dd>
                  </div>
                </dl>
                {uploadResult.details.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      File & Sheet Details
                    </h4>
                    <ul className="space-y-3">
                      {uploadResult.details.map((detail, idx) => (
                        <li
                          key={idx}
                          className="border-b border-gray-100 pb-2 last:border-0"
                        >
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-700">
                              <span className="font-medium">{detail.filename || "Unknown"}</span>
                              {detail.sheet_name && (
                                <span className="text-gray-500 ml-2">- {detail.sheet_name}</span>
                              )}
                            </span>
                            <span className="text-gray-500">
                              {detail.rows} {detail.rows === 1 ? "row" : "rows"}
                              {detail.report_id && ` (ID: ${detail.report_id})`}
                            </span>
                          </div>
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

