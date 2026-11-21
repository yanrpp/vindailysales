import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getTokenFromRequest } from "@/lib/auth/auth-utils";
import { checkItemPermission, readDriveFileBuffer } from "@/lib/drive-utils";
import { fixThaiEncoding } from "@/lib/excel-validator";
import * as XLSX from "xlsx";

// GET /api/drive/[id]/download - ดาวน์โหลดหรือพรีวิวไฟล์ (รองรับ Image, PDF, Text, Excel Preview JSON)
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const token = getTokenFromRequest(req.headers);
    const user = token ? verifyToken(token) : null;

    const { searchParams } = new URL(req.url);
    const shareToken = searchParams.get("token");
    const sharePassword = searchParams.get("password");
    const inline = searchParams.get("inline") === "true";
    const format = searchParams.get("format"); // "excel-json" | "text" | null

    const access = await checkItemPermission(
      id,
      user?.userId,
      user?.role,
      shareToken,
      sharePassword
    );

    if (!access.allowed || !access.item) {
      return NextResponse.json(
        {
          error: access.reason || "คุณไม่มีสิทธิ์ดาวน์โหลดไฟล์นี้",
          requiresPassword: access.requiresPassword || false,
        },
        { status: access.requiresPassword ? 401 : 403 }
      );
    }

    const item = access.item;

    if (item.type === "FOLDER") {
      return NextResponse.json(
        { error: "ไม่สามารถดาวน์โหลดโฟลเดอร์โดยตรงได้" },
        { status: 400 }
      );
    }

    if (access.permission === "PUBLIC" && !item.allowDownload && !inline && !format) {
      return NextResponse.json(
        { error: "เจ้าของไฟล์ไม่อนุญาตให้ดาวน์โหลดไฟล์นี้ (อนุญาตให้เปิดดูเท่านั้น)" },
        { status: 403 }
      );
    }

    const buffer = await readDriveFileBuffer(item.id, item.localPath, item.blobUrl);
    if (!buffer) {
      return NextResponse.json(
        { error: "ไม่พบข้อมูลเนื้อหาไฟล์ในระบบจัดเก็บข้อมูล" },
        { status: 404 }
      );
    }

    // กรณีขอพรีวิวไฟล์ Excel / CSV เป็น JSON ตาราง
    if (format === "excel-json") {
      try {
        const workbook = XLSX.read(buffer, { type: "buffer", codepage: 874 });
        const sheets = workbook.SheetNames.map((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, {
            header: 1,
            defval: "",
          });
          // แก้ไขการถอดรหัสภาษาไทย (Windows-874 / TIS-620 Mojibake)
          const rows = rawRows.slice(0, 150).map((row) =>
            Array.isArray(row)
              ? row.map((cell) => {
                  if (cell === null || cell === undefined) return "";
                  if (typeof cell === "string") return fixThaiEncoding(cell);
                  return cell;
                })
              : row
          );
          return {
            name: fixThaiEncoding(sheetName),
            rows, // แสดงพรีวิวสูงสุด 150 แถวแรกต่อชีต
            totalRows: rawRows.length,
          };
        });
        return NextResponse.json({
          success: true,
          sheets,
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: "ไม่สามารถอ่านข้อมูลตาราง Excel ได้: " + err.message },
          { status: 400 }
        );
      }
    }

    // กรณีขอพรีวิวไฟล์ข้อความ (Text / JSON / CSV / MD)
    if (format === "text") {
      let textContent = buffer.toString("utf-8").slice(0, 200000);
      textContent = fixThaiEncoding(textContent);
      return NextResponse.json({
        success: true,
        text: textContent,
      });
    }

    // ส่งไฟล์ Binary สำหรับดาวน์โหลดหรือแสดงผล Inline (เช่น รูปภาพ, PDF, วิดีโอ, เสียง)
    const encodedName = encodeURIComponent(item.name);
    const disposition = inline
      ? `inline; filename*=UTF-8''${encodedName}`
      : `attachment; filename*=UTF-8''${encodedName}`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": item.mimeType || "application/octet-stream",
        "Content-Disposition": disposition,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("GET /api/drive/[id]/download error:", error);
    return NextResponse.json(
      { error: error.message || "เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์" },
      { status: 500 }
    );
  }
}
