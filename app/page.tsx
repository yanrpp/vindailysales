"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    sheets_processed: number;
    total_rows: number;
    details: Array<{ sheet_name: string; report_id: number; rows: number }>;
  } | null>(null);

  const upload = async () => {
    if (!file) {
      setStatus({ type: "error", message: "Please select a file first" });
      return;
    }

    setIsUploading(true);
    setStatus(null);
    setUploadResult(null);

    const form = new FormData();
    form.append("file", file);

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
          message: `Successfully processed ${json.sheets_processed} sheet(s) with ${json.total_rows} total rows`,
        });
        setUploadResult(json);
        setFile(null);
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
              <CardTitle className="text-2xl font-semibold">Upload Sales Report</CardTitle>
              <p className="mt-1 text-sm text-gray-600">
                Upload Excel files to import daily sales data
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard">
                <Button variant="outline" size="sm">
                  Dashboard
                </Button>
              </Link>
              <Link href="/data">
                <Button variant="outline" size="sm">
                  Data Display
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Excel File
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-gray-400 transition-colors">
              <div className="space-y-1 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 48 48"
                  aria-hidden="true"
                >
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="file-upload"
                    className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                  >
                    <span>Upload a file</span>
                    <Input
                      id="file-upload"
                      name="file-upload"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="sr-only"
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">XLSX, XLS up to 10MB</p>
                {file && (
                  <p className="mt-2 text-sm font-medium text-gray-900">{file.name}</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-500 mb-4">
              Supports multiple sheets in a single Excel file (e.g., 2–3 dates in one file)
            </p>
            <Button
              onClick={upload}
              disabled={!file || isUploading}
              className="w-full"
            >
              {isUploading ? "Uploading..." : "Upload File"}
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
                      Sheet Details
                    </h4>
                    <ul className="space-y-2">
                      {uploadResult.details.map((detail, idx) => (
                        <li
                          key={idx}
                          className="flex justify-between items-center text-sm"
                        >
                          <span className="text-gray-700">
                            <span className="font-medium">{detail.sheet_name}</span>
                          </span>
                          <span className="text-gray-500">
                            {detail.rows} {detail.rows === 1 ? "row" : "rows"}
                          </span>
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
