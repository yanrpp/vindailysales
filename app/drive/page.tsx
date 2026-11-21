"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HardDrive,
  FolderPlus,
  Upload,
  Folder,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  File as FileIcon,
  Star,
  Trash2,
  Share2,
  Download,
  Eye,
  MoreVertical,
  Search,
  LayoutGrid,
  List as ListIcon,
  ChevronRight,
  Users,
  Send,
  Clock,
  RotateCcw,
  Edit3,
  FolderInput,
  Link2,
  Copy,
  Check,
  X,
  Lock,
  Globe,
  UserPlus,
  Sparkles,
  AlertCircle,
  ExternalLink,
  Info,
} from "lucide-react";

interface DriveUser {
  id: string;
  username: string;
  name: string | null;
  role?: string;
}

interface DriveShareRecord {
  id: string;
  itemId: string;
  sharedWithUserId: string;
  sharedByUserId: string;
  permission: "VIEW" | "EDIT";
  note: string | null;
  createdAt: string;
  sharedWithUser?: DriveUser;
  sharedByUser?: DriveUser;
}

interface DriveItem {
  id: string;
  name: string;
  type: "FILE" | "FOLDER";
  mimeType: string | null;
  size: number;
  extension: string | null;
  description: string | null;
  parentId: string | null;
  ownerId: string;
  owner: DriveUser;
  isStarred: boolean;
  isTrashed: boolean;
  trashedAt: string | null;
  isPublic: boolean;
  shareToken: string | null;
  sharePassword?: string | null;
  shareExpiresAt: string | null;
  allowDownload: boolean;
  color: string | null;
  storageType?: string;
  blobUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  shares: DriveShareRecord[];
  _count?: {
    children: number;
    shares: number;
  };
  myPermission?: "VIEW" | "EDIT";
  sharedNote?: string | null;
  sharedBy?: DriveUser;
}

interface Breadcrumb {
  id: string;
  name: string;
}

interface ExcelSheetPreview {
  name: string;
  rows: any[][];
  totalRows: number;
}

type DriveSection =
  | "my-drive"
  | "shared-with-me"
  | "shared-by-me"
  | "starred"
  | "recent"
  | "trash";

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function DrivePage() {
  const { token, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Navigation & Filtering State
  const [section, setSection] = useState<DriveSection>("my-drive");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"updatedAt" | "name" | "size">("updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Data State
  const [items, setItems] = useState<DriveItem[]>([]);
  const [allFolders, setAllFolders] = useState<Array<{ id: string; name: string; parentId: string | null }>>([]);
  const [systemUsers, setSystemUsers] = useState<DriveUser[]>([]);
  const [storage, setStorage] = useState({
    usedBytes: 0,
    quotaBytes: 500 * 1024 * 1024,
    totalFilesCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Modals State
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#3b82f6");

  // Quick Send / Upload Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadShareUserId, setUploadShareUserId] = useState("");
  const [uploadShareNote, setUploadShareNote] = useState("");

  // Rename / Edit Item Modal
  const [editingItem, setEditingItem] = useState<DriveItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("#3b82f6");

  // Move Item Modal
  const [movingItem, setMovingItem] = useState<DriveItem | null>(null);
  const [targetMoveFolderId, setTargetMoveFolderId] = useState<string | null>(null);

  // Share & Send File Modal
  const [sharingItem, setSharingItem] = useState<DriveItem | null>(null);
  const [shareTargetUserId, setShareTargetUserId] = useState("");
  const [sharePermission, setSharePermission] = useState<"VIEW" | "EDIT">("VIEW");
  const [shareNote, setShareNote] = useState("");
  const [publicLinkEnabled, setPublicLinkEnabled] = useState(false);
  const [publicPassword, setPublicPassword] = useState("");
  const [publicExpiresAt, setPublicExpiresAt] = useState("");
  const [publicAllowDownload, setPublicAllowDownload] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // File Preview Modal
  const [previewItem, setPreviewItem] = useState<DriveItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [excelSheets, setExcelSheets] = useState<ExcelSheetPreview[]>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [blobPreviewUrl, setBlobPreviewUrl] = useState<string | null>(null);

  // Detail Drawer State
  const [detailItem, setDetailItem] = useState<DriveItem | null>(null);

  // Modern Non-blocking Confirmation Dialog State (แก้ปัญหา INP จาก window.confirm)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    variant?: "destructive" | "default";
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const askConfirmation = (options: {
    title: string;
    description: string;
    confirmText?: string;
    variant?: "destructive" | "default";
    onConfirm: () => Promise<void> | void;
  }) => {
    setConfirmDialog({
      isOpen: true,
      title: options.title,
      description: options.description,
      confirmText: options.confirmText || "ยืนยัน",
      variant: options.variant || "destructive",
      onConfirm: options.onConfirm,
    });
  };

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 3500);
  };

  // โหลดรายการไฟล์
  const fetchDriveItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        section,
        fileType: fileTypeFilter,
        sortBy,
        sortOrder,
      });
      if (currentFolderId) params.set("parentId", currentFolderId);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`/api/drive?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setItems(data.items || []);
        setBreadcrumbs(data.breadcrumbs || []);
        setAllFolders(data.allFolders || []);
        if (data.storage) setStorage(data.storage);
      } else {
        showToast(data.error || "ไม่สามารถโหลดข้อมูลคลังไฟล์ได้", "error");
      }
    } catch {
      showToast("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", "error");
    } finally {
      setLoading(false);
    }
  }, [token, section, currentFolderId, searchQuery, fileTypeFilter, sortBy, sortOrder]);

  // โหลดรายชื่อผู้ใช้ในระบบสำหรับส่งไฟล์
  const fetchUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/drive/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSystemUsers(data.users || []);
      }
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    fetchDriveItems();
  }, [fetchDriveItems]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // เปลี่ยนหมวดหมู่เมนูด้านซ้าย
  const handleSelectSection = (newSection: DriveSection) => {
    setSection(newSection);
    setCurrentFolderId(null);
    setDetailItem(null);
  };

  // สร้างโฟลเดอร์ใหม่
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const res = await fetch("/api/drive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: section === "my-drive" ? currentFolderId : null,
          description: newFolderDesc.trim() || null,
          color: newFolderColor,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("สร้างโฟลเดอร์ใหม่เรียบร้อยแล้ว");
        setShowNewFolderModal(false);
        setNewFolderName("");
        setNewFolderDesc("");
        fetchDriveItems();
      } else {
        showToast(data.error || "ไม่สามารถสร้างโฟลเดอร์ได้", "error");
      }
    } catch {
      showToast("เกิดข้อผิดพลาดในการสร้างโฟลเดอร์", "error");
    }
  };

  // อัปโหลดไฟล์ (ทั้งจากการลากวางและจาก Modal อัปโหลด/ส่งไฟล์)
  const uploadFiles = async (
    filesToUpload: File[],
    options?: { description?: string; shareWithUserId?: string; shareNote?: string }
  ) => {
    if (!filesToUpload || filesToUpload.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      if (section === "my-drive" && currentFolderId) {
        formData.append("parentId", currentFolderId);
      }
      if (options?.description) formData.append("description", options.description);
      if (options?.shareWithUserId) formData.append("shareWithUserId", options.shareWithUserId);
      if (options?.shareNote) formData.append("shareNote", options.shareNote);

      for (const f of filesToUpload) {
        formData.append("files", f);
      }

      const res = await fetch("/api/drive", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(
          options?.shareWithUserId
            ? `อัปโหลดและส่งไฟล์สำเร็จ ${filesToUpload.length} รายการ`
            : `อัปโหลดสำเร็จ ${filesToUpload.length} ไฟล์`
        );
        setShowUploadModal(false);
        setSelectedFiles([]);
        setUploadDescription("");
        setUploadShareUserId("");
        setUploadShareNote("");
        fetchDriveItems();
      } else {
        showToast(data.error || "อัปโหลดไฟล์ไม่สำเร็จ", "error");
      }
    } catch {
      showToast("เกิดข้อผิดพลาดระหว่างอัปโหลดไฟล์", "error");
    } finally {
      setUploading(false);
    }
  };

  // จัดการ Drag & Drop ไฟล์ลงหน้าจอ
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      await uploadFiles(droppedFiles);
    }
  };

  // ติดดาว / เลิกติดดาว
  const handleToggleStar = async (item: DriveItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/drive/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isStarred: !item.isStarred }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, isStarred: !item.isStarred } : it))
        );
        showToast(item.isStarred ? "นำออกจากรายการติดดาวแล้ว" : "เพิ่มในรายการติดดาวแล้ว");
      }
    } catch {
      showToast("ไม่สามารถอัปเดตสถานะติดดาวได้", "error");
    }
  };

  // ย้ายไปถังขยะ หรือ กู้คืนจากถังขยะ
  const handleToggleTrash = async (item: DriveItem, toTrash: boolean, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/drive/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isTrashed: toTrash }),
      });
      if (res.ok) {
        showToast(toTrash ? `ย้าย "${item.name}" ไปยังถังขยะแล้ว` : `กู้คืน "${item.name}" เรียบร้อยแล้ว`);
        fetchDriveItems();
      } else {
        const data = await res.json();
        showToast(data.error || "ไม่สามารถดำเนินการได้", "error");
      }
    } catch {
      showToast("เกิดข้อผิดพลาด", "error");
    }
  };

  // ลบถาวร (ใช้ non-blocking modal แทน window.confirm)
  const handlePermanentDelete = (item: DriveItem) => {
    askConfirmation({
      title: "ยืนยันการลบถาวร",
      description: `คุณแน่ใจหรือไม่ว่าต้องการลบถาวร "${item.name}"? ข้อมูลนี้จะไม่สามารถกู้คืนได้อีก`,
      confirmText: "ลบถาวร",
      variant: "destructive",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/drive/${item.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            showToast(`ลบ "${item.name}" ถาวรเรียบร้อยแล้ว`);
            fetchDriveItems();
          } else {
            const data = await res.json();
            showToast(data.error || "ไม่สามารถลบได้", "error");
          }
        } catch {
          showToast("เกิดข้อผิดพลาดในการลบไฟล์", "error");
        }
      },
    });
  };

  // ล้างถังขยะทั้งหมด (ใช้ non-blocking modal แทน window.confirm เพื่อแก้ปัญหา INP 1,141ms)
  const handleEmptyTrash = () => {
    askConfirmation({
      title: "ยืนยันการล้างถังขยะทั้งหมด",
      description: "คุณแน่ใจหรือไม่ว่าต้องการล้างถังขยะทั้งหมดแบบถาวร? ข้อมูลไฟล์ทั้งหมดในถังขยะจะถูกลบอย่างถาวรและไม่สามารถกู้คืนได้อีก",
      confirmText: "ล้างถังขยะทั้งหมด",
      variant: "destructive",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/drive?action=empty-trash", {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast("ล้างถังขยะเรียบร้อยแล้ว");
            fetchDriveItems();
          }
        } catch {
          showToast("ไม่สามารถล้างถังขยะได้", "error");
        }
      },
    });
  };

  // แก้ไขชื่อและรายละเอียด
  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editName.trim()) return;
    try {
      const res = await fetch(`/api/drive/${editingItem.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
          color: editingItem.type === "FOLDER" ? editColor : undefined,
        }),
      });
      if (res.ok) {
        showToast("บันทึกการแก้ไขเรียบร้อยแล้ว");
        setEditingItem(null);
        fetchDriveItems();
      } else {
        const data = await res.json();
        showToast(data.error || "แก้ไขไม่สำเร็จ", "error");
      }
    } catch {
      showToast("เกิดข้อผิดพลาด", "error");
    }
  };

  // ย้ายโฟลเดอร์
  const handleMoveItem = async () => {
    if (!movingItem) return;
    try {
      const res = await fetch(`/api/drive/${movingItem.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ parentId: targetMoveFolderId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`ย้าย "${movingItem.name}" เรียบร้อยแล้ว`);
        setMovingItem(null);
        fetchDriveItems();
      } else {
        showToast(data.error || "ย้ายโฟลเดอร์ไม่สำเร็จ", "error");
      }
    } catch {
      showToast("เกิดข้อผิดพลาดในการย้ายโฟลเดอร์", "error");
    }
  };

  // เปิด Modal แชร์และรับส่งไฟล์
  const openShareModal = (item: DriveItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSharingItem(item);
    setShareTargetUserId("");
    setSharePermission("VIEW");
    setShareNote("");
    setPublicLinkEnabled(item.isPublic);
    setPublicPassword("");
    setPublicExpiresAt(
      item.shareExpiresAt ? new Date(item.shareExpiresAt).toISOString().slice(0, 10) : ""
    );
    setPublicAllowDownload(item.allowDownload);
    setCopiedLink(false);
  };

  // แชร์ให้ผู้ใช้ในระบบ
  const handleShareWithUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharingItem || !shareTargetUserId) return;
    try {
      const res = await fetch(`/api/drive/${sharingItem.id}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "share-user",
          targetUserId: shareTargetUserId,
          permission: sharePermission,
          note: shareNote.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || "แชร์ไฟล์ให้ผู้ใช้สำเร็จ");
        setShareTargetUserId("");
        setShareNote("");
        fetchDriveItems();
        // อัปเดตใน Modal
        const detailRes = await fetch(`/api/drive/${sharingItem.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const detailData = await detailRes.json();
        if (detailData.item) setSharingItem(detailData.item);
      } else {
        showToast(data.error || "ไม่สามารถแชร์ได้", "error");
      }
    } catch {
      showToast("เกิดข้อผิดพลาดในการแชร์ไฟล์", "error");
    }
  };

  // ยกเลิกการแชร์กับผู้ใช้
  const handleUnshareUser = async (targetUserId: string) => {
    if (!sharingItem) return;
    try {
      const res = await fetch(`/api/drive/${sharingItem.id}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "unshare-user",
          targetUserId,
        }),
      });
      if (res.ok) {
        showToast("ยกเลิกสิทธิ์การเข้าถึงแล้ว");
        fetchDriveItems();
        const detailRes = await fetch(`/api/drive/${sharingItem.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const detailData = await detailRes.json();
        if (detailData.item) setSharingItem(detailData.item);
      }
    } catch {
      showToast("ไม่สามารถยกเลิกการแชร์ได้", "error");
    }
  };

  // อัปเดตการตั้งค่าลิงก์สาธารณะ
  const handleUpdatePublicLink = async (enable: boolean, clearPass = false) => {
    if (!sharingItem) return;
    try {
      const res = await fetch(`/api/drive/${sharingItem.id}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "update-public-link",
          isPublic: enable,
          password: publicPassword.trim() || undefined,
          clearPassword: clearPass,
          expiresAt: publicExpiresAt || null,
          allowDownload: publicAllowDownload,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSharingItem(data.item);
        setPublicLinkEnabled(data.item.isPublic);
        setPublicPassword("");
        showToast(data.message);
        fetchDriveItems();
      } else {
        showToast(data.error || "ไม่สามารถอัปเดตลิงก์ได้", "error");
      }
    } catch {
      showToast("เกิดข้อผิดพลาด", "error");
    }
  };

  // คัดลอกลิงก์แชร์สาธารณะ
  const handleCopyShareLink = (item: DriveItem) => {
    if (!item.shareToken) return;
    const url = `${window.location.origin}/drive/shared/${item.shareToken}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    showToast("คัดลอกลิงก์สำหรับส่งไฟล์แล้ว");
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // ดาวน์โหลดไฟล์
  const handleDownload = async (item: DriveItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/drive/${item.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || "ไม่สามารถดาวน์โหลดไฟล์ได้", "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showToast("เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์", "error");
    }
  };

  // เปิดพรีวิวไฟล์ (รูปภาพ, PDF, Excel, CSV, Text)
  const handleOpenPreview = async (item: DriveItem) => {
    if (item.type === "FOLDER") {
      setCurrentFolderId(item.id);
      return;
    }

    setPreviewItem(item);
    setPreviewLoading(true);
    setExcelSheets([]);
    setActiveSheetIdx(0);
    setTextPreview(null);
    if (blobPreviewUrl) {
      URL.revokeObjectURL(blobPreviewUrl);
      setBlobPreviewUrl(null);
    }

    const ext = (item.extension || "").toLowerCase();
    const mime = (item.mimeType || "").toLowerCase();

    try {
      if (["xls", "xlsx", "csv"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel")) {
        const res = await fetch(`/api/drive/${item.id}/download?format=excel-json`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.sheets) {
          setExcelSheets(data.sheets);
        }
      } else if (
        ["txt", "md", "json", "log", "xml", "html", "css", "js", "ts"].includes(ext) ||
        mime.startsWith("text/")
      ) {
        const res = await fetch(`/api/drive/${item.id}/download?format=text`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && typeof data.text === "string") {
          setTextPreview(data.text);
        }
      } else if (
        mime.startsWith("image/") ||
        mime === "application/pdf" ||
        mime.startsWith("video/") ||
        mime.startsWith("audio/")
      ) {
        const res = await fetch(`/api/drive/${item.id}/download?inline=true`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setBlobPreviewUrl(url);
        }
      }
    } catch {
      showToast("ไม่สามารถโหลดตัวอย่างไฟล์ได้", "error");
    } finally {
      setPreviewLoading(false);
    }
  };

  // เลือกไอคอนตามประเภทไฟล์
  const renderFileIcon = (item: DriveItem, sizeClass = "h-10 w-10") => {
    if (item.type === "FOLDER") {
      return (
        <Folder
          className={sizeClass}
          style={{ color: item.color || "#3b82f6", fill: (item.color || "#3b82f6") + "25" }}
        />
      );
    }
    const ext = (item.extension || "").toLowerCase();
    const mime = (item.mimeType || "").toLowerCase();

    if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
      return <ImageIcon className={`${sizeClass} text-rose-500`} />;
    }
    if (["xls", "xlsx", "csv"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel")) {
      return <FileSpreadsheet className={`${sizeClass} text-emerald-600`} />;
    }
    if (ext === "pdf" || mime === "application/pdf") {
      return <FileText className={`${sizeClass} text-red-600`} />;
    }
    if (["doc", "docx", "txt", "md"].includes(ext) || mime.startsWith("text/")) {
      return <FileText className={`${sizeClass} text-blue-600`} />;
    }
    return <FileIcon className={`${sizeClass} text-slate-500`} />;
  };

  const folders = items.filter((i) => i.type === "FOLDER");
  const files = items.filter((i) => i.type === "FILE");
  const storagePercent = Math.min(
    100,
    Math.round((storage.usedBytes / (storage.quotaBytes || 1)) * 100)
  );

  return (
    <div
      className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-7rem)] relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border transition-all ${
            toastMsg.type === "error"
              ? "bg-red-600 text-white border-red-700"
              : "bg-slate-900 text-white border-slate-800"
          }`}
        >
          {toastMsg.type === "error" ? (
            <AlertCircle className="h-5 w-5 text-red-200" />
          ) : (
            <Check className="h-5 w-5 text-emerald-400" />
          )}
          <span className="text-sm font-medium">{toastMsg.text}</span>
        </div>
      )}

      {/* Drag & Drop Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-40 bg-blue-600/20 backdrop-blur-xs border-4 border-dashed border-blue-600 flex items-center justify-center pointer-events-none">
          <div className="bg-white px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3">
            <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <Upload className="h-8 w-8 animate-bounce" />
            </div>
            <h3 className="text-xl font-bold text-slate-800">วางไฟล์ที่นี่เพื่ออัปโหลดเข้าคลังไฟล์</h3>
            <p className="text-sm text-slate-500">
              {currentFolderId && breadcrumbs.length > 0
                ? `อัปโหลดไปยังโฟลเดอร์ "${breadcrumbs[breadcrumbs.length - 1].name}"`
                : "อัปโหลดไปยังไดรฟ์ของฉัน"}
            </p>
          </div>
        </div>
      )}

      {/* Hidden File Input for Quick Upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            setSelectedFiles(Array.from(e.target.files));
            setShowUploadModal(true);
            e.target.value = "";
          }
        }}
      />

      {/* Left Drive Sidebar */}
      <div className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-4">
        <Card className="border-blue-100 shadow-sm">
          <CardContent className="p-4 space-y-3">
            {/* Primary Action Buttons (+ New like Google Drive) */}
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
              <Button
                onClick={() => {
                  setSelectedFiles([]);
                  setUploadDescription("");
                  setUploadShareUserId("");
                  setUploadShareNote("");
                  setShowUploadModal(true);
                }}
                className="w-full justify-start gap-2.5 bg-blue-600 hover:bg-blue-700 text-white shadow-md py-5 rounded-xl"
              >
                <Upload className="h-5 w-5" />
                <span className="font-semibold">อัปโหลด / ส่งไฟล์</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowNewFolderModal(true)}
                className="w-full justify-start gap-2.5 border-blue-200 hover:bg-blue-50 text-blue-700 rounded-xl"
              >
                <FolderPlus className="h-4 w-4" />
                <span>สร้างโฟลเดอร์ใหม่</span>
              </Button>
            </div>

            {/* Drive Navigation Sections */}
            <div className="pt-2 space-y-1">
              {[
                {
                  id: "my-drive" as DriveSection,
                  label: "ไดรฟ์ของฉัน (My Drive)",
                  icon: <HardDrive className="h-4 w-4" />,
                },
                {
                  id: "shared-with-me" as DriveSection,
                  label: "ไฟล์ที่ส่งถึงฉัน (Shared)",
                  icon: <Users className="h-4 w-4" />,
                },
                {
                  id: "shared-by-me" as DriveSection,
                  label: "ไฟล์ที่ฉันส่ง/แชร์ออก",
                  icon: <Send className="h-4 w-4" />,
                },
                {
                  id: "recent" as DriveSection,
                  label: "ไฟล์ล่าสุด (Recent)",
                  icon: <Clock className="h-4 w-4" />,
                },
                {
                  id: "starred" as DriveSection,
                  label: "ติดดาว (Starred)",
                  icon: <Star className="h-4 w-4" />,
                },
                {
                  id: "trash" as DriveSection,
                  label: "ถังขยะ (Trash)",
                  icon: <Trash2 className="h-4 w-4" />,
                },
              ].map((nav) => (
                <button
                  key={nav.id}
                  onClick={() => handleSelectSection(nav.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    section === nav.id
                      ? "bg-blue-100/90 text-blue-800 font-semibold"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {nav.icon}
                  <span>{nav.label}</span>
                </button>
              ))}
            </div>

            {/* Storage Quota Card */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  พื้นที่เก็บข้อมูล
                </span>
                <span>{storagePercent}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(2, storagePercent)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">
                ใช้ไป {formatBytes(storage.usedBytes)} จาก {formatBytes(storage.quotaBytes)} ({storage.totalFilesCount} ไฟล์)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Drive Content Area */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Top Search & Filter Toolbar */}
        <Card className="border-slate-200/80 shadow-xs">
          <CardContent className="p-3 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Box */}
            <div className="relative flex-1 max-w-xl">
              <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="ค้นหาชื่อไฟล์ หรือ โฟลเดอร์..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-8 bg-slate-50/80 border-slate-200 focus:bg-white rounded-xl"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Type Filter, Sort & View Switcher */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={fileTypeFilter}
                onChange={(e) => setFileTypeFilter(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700"
              >
                <option value="ALL">ทุกประเภท</option>
                <option value="FOLDER">โฟลเดอร์</option>
                <option value="EXCEL">Excel / CSV</option>
                <option value="PDF">PDF</option>
                <option value="IMAGE">รูปภาพ</option>
                <option value="DOC">เอกสาร / ข้อความ</option>
              </select>

              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [by, order] = e.target.value.split("-");
                  setSortBy(by as any);
                  setSortOrder(order as any);
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700"
              >
                <option value="updatedAt-desc">แก้ไขล่าสุด</option>
                <option value="name-asc">ชื่อ (ก-ฮ, A-Z)</option>
                <option value="size-desc">ขนาด (มาก-น้อย)</option>
              </select>

              <div className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-md transition ${
                    viewMode === "grid" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500"
                  }`}
                  title="มุมมองการ์ด (Grid)"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-md transition ${
                    viewMode === "list" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500"
                  }`}
                  title="มุมมองตาราง (List)"
                >
                  <ListIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Breadcrumbs & Section Header */}
        <div className="flex items-center justify-between flex-wrap gap-2 px-1">
          <div className="flex items-center gap-1.5 text-sm flex-wrap">
            <button
              onClick={() => setCurrentFolderId(null)}
              className={`font-semibold px-2 py-1 rounded-md transition ${
                currentFolderId
                  ? "text-slate-600 hover:bg-slate-100"
                  : "text-blue-700 bg-blue-50/70"
              }`}
            >
              {section === "my-drive" && "ไดรฟ์ของฉัน"}
              {section === "shared-with-me" && "ไฟล์ที่ส่งถึงฉัน"}
              {section === "shared-by-me" && "ไฟล์ที่ฉันส่ง/แชร์ออก"}
              {section === "recent" && "ไฟล์ล่าสุด"}
              {section === "starred" && "รายการติดดาว"}
              {section === "trash" && "ถังขยะ"}
            </button>

            {breadcrumbs.map((bc, idx) => (
              <React.Fragment key={bc.id}>
                <ChevronRight className="h-4 w-4 text-slate-400" />
                <button
                  onClick={() => setCurrentFolderId(bc.id)}
                  className={`px-2 py-1 rounded-md font-medium transition ${
                    idx === breadcrumbs.length - 1
                      ? "bg-blue-50 text-blue-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {bc.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {section === "trash" && items.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleEmptyTrash}
              className="gap-1.5 text-xs"
            >
              <Trash2 className="h-3.5 w-3.5" />
              ล้างถังขยะทั้งหมด
            </Button>
          )}
        </div>

        {/* Content Display */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div
                key={n}
                className="h-36 rounded-xl bg-white/80 border border-slate-100 p-4 animate-pulse flex flex-col justify-between"
              >
                <div className="h-8 w-8 rounded-lg bg-slate-200" />
                <div className="space-y-2">
                  <div className="h-4 w-3/4 bg-slate-200 rounded" />
                  <div className="h-3 w-1/2 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card className="border-dashed border-2 border-slate-200 bg-white/60">
            <CardContent className="py-16 flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500 mb-4">
                <HardDrive className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">
                {searchQuery
                  ? "ไม่พบไฟล์หรือโฟลเดอร์ที่ค้นหา"
                  : section === "trash"
                  ? "ถังขยะว่างเปล่า"
                  : section === "shared-with-me"
                  ? "ยังไม่มีไฟล์ที่ส่งถึงคุณ"
                  : "ยังไม่มีไฟล์ในโฟลเดอร์นี้"}
              </h3>
              <p className="text-sm text-slate-500 max-w-md mt-1 mb-6">
                คุณสามารถลากไฟล์มาวางในหน้านี้โดยตรง หรือกดปุ่มด้านล่างเพื่ออัปโหลดและส่งไฟล์ให้ผู้ใช้อื่นในระบบ
              </p>
              {section === "my-drive" && (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => setShowUploadModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    อัปโหลด / ส่งไฟล์
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowNewFolderModal(true)}
                    className="gap-2"
                  >
                    <FolderPlus className="h-4 w-4" />
                    สร้างโฟลเดอร์
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : viewMode === "grid" ? (
          <div className="space-y-6">
            {/* Folders Section */}
            {folders.length > 0 && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-1">
                  โฟลเดอร์ ({folders.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {folders.map((folder) => (
                    <div
                      key={folder.id}
                      onClick={() => {
                        if (!folder.isTrashed) setCurrentFolderId(folder.id);
                      }}
                      className="group relative bg-white hover:bg-blue-50/40 border border-slate-200/80 hover:border-blue-300 rounded-xl p-3.5 transition-all cursor-pointer shadow-2xs hover:shadow-md flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {renderFileIcon(folder, "h-8 w-8 flex-shrink-0")}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {folder.name}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {folder._count?.children || 0} รายการ
                            {folder.isPublic && " • สาธารณะ"}
                            {folder.shares?.length > 0 && ` • แชร์ ${folder.shares.length} คน`}
                          </p>
                        </div>
                      </div>

                      {/* Folder Quick Actions */}
                      <div
                        className="flex items-center gap-1 opacity-80 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => handleToggleStar(folder, e)}
                          className={`p-1.5 rounded-lg hover:bg-slate-100 ${
                            folder.isStarred ? "text-amber-400" : "text-slate-400"
                          }`}
                          title="ติดดาว"
                        >
                          <Star
                            className="h-4 w-4"
                            fill={folder.isStarred ? "currentColor" : "none"}
                          />
                        </button>
                        {!folder.isTrashed && (
                          <button
                            onClick={(e) => openShareModal(folder, e)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600"
                            title="แชร์โฟลเดอร์"
                          >
                            <Share2 className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setDetailItem(folder)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                          title="จัดการและดูรายละเอียด"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files Section */}
            {files.length > 0 && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-1">
                  ไฟล์ ({files.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => handleOpenPreview(file)}
                      className="group bg-white hover:bg-blue-50/20 border border-slate-200/80 hover:border-blue-300 rounded-xl p-4 transition-all cursor-pointer shadow-2xs hover:shadow-md flex flex-col justify-between gap-3"
                    >
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="p-2.5 rounded-xl bg-slate-50 group-hover:bg-white transition">
                          {renderFileIcon(file, "h-8 w-8")}
                        </div>
                        <div
                          className="flex items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => handleToggleStar(file, e)}
                            className={`p-1.5 rounded-lg hover:bg-slate-100 ${
                              file.isStarred ? "text-amber-400" : "text-slate-400"
                            }`}
                            title="ติดดาว"
                          >
                            <Star
                              className="h-4 w-4"
                              fill={file.isStarred ? "currentColor" : "none"}
                            />
                          </button>
                          {!file.isTrashed && (
                            <>
                              <button
                                onClick={(e) => openShareModal(file, e)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600"
                                title="ส่งไฟล์ / แชร์"
                              >
                                <Share2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => handleDownload(file, e)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-emerald-600"
                                title="ดาวน์โหลด"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setDetailItem(file)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                            title="ตัวเลือกเพิ่มเติม"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* File Name & Metadata */}
                      <div>
                        <p
                          className="text-sm font-semibold text-slate-800 truncate group-hover:text-blue-700"
                          title={file.name}
                        >
                          {file.name}
                        </p>
                        {file.description && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {file.description}
                          </p>
                        )}
                        {file.sharedNote && (
                          <p className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded mt-1 truncate">
                            ข้อความ: {file.sharedNote}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-slate-400 mt-2 pt-2 border-t border-slate-100">
                          <span>{formatBytes(file.size)}</span>
                          <span>
                            {new Date(file.updatedAt).toLocaleDateString("th-TH", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Sharing Badges */}
                      {(file.isPublic ||
                        (file.shares && file.shares.length > 0) ||
                        file.sharedBy) && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {file.isPublic && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Globe className="h-3 w-3" />
                              ลิงก์สาธารณะ
                            </span>
                          )}
                          {file.shares && file.shares.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              <Users className="h-3 w-3" />
                              แชร์ {file.shares.length} คน
                            </span>
                          )}
                          {file.sharedBy && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700">
                              ส่งจาก: {file.sharedBy.name || file.sharedBy.username}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* List View */
          <Card className="border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">ชื่อรายการ</th>
                    <th className="py-3 px-4">เจ้าของ / ผู้ส่ง</th>
                    <th className="py-3 px-4">แก้ไขล่าสุด</th>
                    <th className="py-3 px-4">ขนาด</th>
                    <th className="py-3 px-4 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => handleOpenPreview(item)}
                      className="hover:bg-blue-50/40 cursor-pointer transition"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {renderFileIcon(item, "h-6 w-6 flex-shrink-0")}
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 truncate max-w-xs sm:max-w-md">
                              {item.name}
                            </p>
                            {item.description && (
                              <p className="text-xs text-slate-400 truncate max-w-xs">
                                {item.description}
                              </p>
                            )}
                          </div>
                          {item.isPublic && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                              สาธารณะ
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {item.ownerId === user?.id
                          ? "ฉัน"
                          : item.owner?.name || item.owner?.username || "-"}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {new Date(item.updatedAt).toLocaleString("th-TH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {item.type === "FOLDER" ? "-" : formatBytes(item.size)}
                      </td>
                      <td
                        className="py-3 px-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => handleToggleStar(item, e)}
                            className={`p-1.5 rounded-lg hover:bg-slate-100 ${
                              item.isStarred ? "text-amber-400" : "text-slate-400"
                            }`}
                          >
                            <Star
                              className="h-4 w-4"
                              fill={item.isStarred ? "currentColor" : "none"}
                            />
                          </button>
                          {!item.isTrashed && (
                            <>
                              <button
                                onClick={(e) => openShareModal(item, e)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600"
                                title="แชร์ / ส่งไฟล์"
                              >
                                <Share2 className="h-4 w-4" />
                              </button>
                              {item.type === "FILE" && (
                                <button
                                  onClick={(e) => handleDownload(item, e)}
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-emerald-600"
                                  title="ดาวน์โหลด"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => setDetailItem(item)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Item Action & Details Modal (When clicking MoreVertical) */}
      <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="sm:max-w-md">
          {detailItem && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  {renderFileIcon(detailItem, "h-8 w-8")}
                  <div className="min-w-0">
                    <DialogTitle className="truncate">{detailItem.name}</DialogTitle>
                    <DialogDescription>
                      {detailItem.type === "FOLDER"
                        ? "โฟลเดอร์"
                        : `${formatBytes(detailItem.size)} • ${detailItem.extension?.toUpperCase() || "FILE"}`}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1.5 text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">เจ้าของ:</span>
                    <span className="font-medium">
                      {detailItem.owner?.name || detailItem.owner?.username}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">แก้ไขล่าสุด:</span>
                    <span>{new Date(detailItem.updatedAt).toLocaleString("th-TH")}</span>
                  </div>
                  {detailItem.description && (
                    <div className="pt-1 border-t border-slate-200/60">
                      <span className="text-slate-400 block">คำอธิบาย:</span>
                      <p className="text-slate-700 mt-0.5">{detailItem.description}</p>
                    </div>
                  )}
                </div>

                {/* Action Buttons Grid */}
                <div className="grid grid-cols-2 gap-2">
                  {!detailItem.isTrashed ? (
                    <>
                      {detailItem.type === "FILE" && (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => {
                              const it = detailItem;
                              setDetailItem(null);
                              handleOpenPreview(it);
                            }}
                            className="justify-start gap-2"
                          >
                            <Eye className="h-4 w-4 text-blue-600" />
                            เปิดดูพรีวิว
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleDownload(detailItem)}
                            className="justify-start gap-2"
                          >
                            <Download className="h-4 w-4 text-emerald-600" />
                            ดาวน์โหลด
                          </Button>
                        </>
                      )}

                      <Button
                        variant="outline"
                        onClick={() => {
                          const it = detailItem;
                          setDetailItem(null);
                          openShareModal(it);
                        }}
                        className="justify-start gap-2"
                      >
                        <Share2 className="h-4 w-4 text-indigo-600" />
                        ส่งไฟล์ / แชร์
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingItem(detailItem);
                          setEditName(detailItem.name);
                          setEditDesc(detailItem.description || "");
                          setEditColor(detailItem.color || "#3b82f6");
                          setDetailItem(null);
                        }}
                        className="justify-start gap-2"
                      >
                        <Edit3 className="h-4 w-4 text-amber-600" />
                        เปลี่ยนชื่อ / แก้ไข
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => {
                          setMovingItem(detailItem);
                          setTargetMoveFolderId(detailItem.parentId);
                          setDetailItem(null);
                        }}
                        className="justify-start gap-2"
                      >
                        <FolderInput className="h-4 w-4 text-purple-600" />
                        ย้ายโฟลเดอร์
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => {
                          const it = detailItem;
                          setDetailItem(null);
                          handleToggleTrash(it, true);
                        }}
                        className="justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        ย้ายไปถังขยะ
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const it = detailItem;
                          setDetailItem(null);
                          handleToggleTrash(it, false);
                        }}
                        className="justify-start gap-2 text-emerald-600"
                      >
                        <RotateCcw className="h-4 w-4" />
                        กู้คืนไฟล์
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          const it = detailItem;
                          setDetailItem(null);
                          handlePermanentDelete(it);
                        }}
                        className="justify-start gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        ลบถาวร
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal 1: สร้างโฟลเดอร์ใหม่ */}
      <Dialog open={showNewFolderModal} onOpenChange={setShowNewFolderModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-blue-600" />
              สร้างโฟลเดอร์ใหม่
            </DialogTitle>
            <DialogDescription>
              จัดระเบียบไฟล์ของคุณด้วยโฟลเดอร์และสีที่แยกตามหมวดหมู่
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateFolder} className="space-y-4">
            <div className="space-y-2">
              <Label>ชื่อโฟลเดอร์ *</Label>
              <Input
                placeholder="เช่น รายงานประจำเดือน, เอกสารจัดซื้อ..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>คำอธิบาย (ไม่บังคับ)</Label>
              <Input
                placeholder="รายละเอียดของโฟลเดอร์..."
                value={newFolderDesc}
                onChange={(e) => setNewFolderDesc(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>สีโฟลเดอร์</Label>
              <div className="flex items-center gap-2.5">
                {[
                  "#3b82f6",
                  "#10b981",
                  "#f59e0b",
                  "#ef4444",
                  "#8b5cf6",
                  "#ec4899",
                  "#64748b",
                ].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewFolderColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      newFolderColor === c ? "scale-125 border-slate-900" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewFolderModal(false)}
              >
                ยกเลิก
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                สร้างโฟลเดอร์
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal 2: อัปโหลดและส่งไฟล์ด่วน (Upload & Direct Send) */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              อัปโหลดและรับ-ส่งไฟล์
            </DialogTitle>
            <DialogDescription>
              เก็บไฟล์ไว้ในไดรฟ์ของคุณ หรือเลือกผู้รับเพื่อส่งไฟล์ให้ผู้ใช้อื่นในระบบทันที
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Dropzone inside modal */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/40 rounded-xl p-6 text-center cursor-pointer transition"
            >
              <Upload className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">
                คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวาง
              </p>
              <p className="text-xs text-slate-500 mt-1">
                รองรับทุกนามสกุลไฟล์ (Excel, PDF, รูปภาพ, Word, ZIP ฯลฯ สูงสุด 50MB/ไฟล์)
              </p>
            </div>

            {/* Selected Files List */}
            {selectedFiles.length > 0 && (
              <div className="max-h-36 overflow-y-auto space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                {selectedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs bg-white px-3 py-2 rounded-lg border border-slate-100"
                  >
                    <span className="font-medium text-slate-700 truncate max-w-xs">
                      {f.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{formatBytes(f.size)}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label>คำอธิบายไฟล์ / หมายเหตุ</Label>
              <Input
                placeholder="ระบุรายละเอียดของไฟล์ (ไม่บังคับ)..."
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
              />
            </div>

            {/* Direct File Transfer to another user */}
            <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-100 space-y-3">
              <div className="flex items-center gap-2 text-indigo-900 font-semibold text-xs">
                <Send className="h-4 w-4 text-indigo-600" />
                <span>ส่งไฟล์นี้ให้ผู้ใช้อื่นในระบบทันที (ไม่บังคับ)</span>
              </div>
              <select
                value={uploadShareUserId}
                onChange={(e) => setUploadShareUserId(e.target.value)}
                className="h-9 w-full rounded-lg border border-indigo-200 bg-white px-3 text-xs text-slate-700"
              >
                <option value="">-- เก็บไว้ในไดรฟ์ของฉันเท่านั้น (ไม่ระบุผู้รับ) --</option>
                {systemUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ? `${u.name} (${u.username})` : u.username}
                  </option>
                ))}
              </select>
              {uploadShareUserId && (
                <Input
                  placeholder="ข้อความแนบถึงผู้รับ เช่น รบกวนตรวจสอบไฟล์รายงานนี้ครับ..."
                  value={uploadShareNote}
                  onChange={(e) => setUploadShareNote(e.target.value)}
                  className="bg-white text-xs h-9"
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowUploadModal(false)}
              >
                ยกเลิก
              </Button>
              <Button
                disabled={selectedFiles.length === 0 || uploading}
                onClick={() =>
                  uploadFiles(selectedFiles, {
                    description: uploadDescription,
                    shareWithUserId: uploadShareUserId || undefined,
                    shareNote: uploadShareNote || undefined,
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 gap-2"
              >
                <Upload className="h-4 w-4" />
                {uploading
                  ? "กำลังอัปโหลด..."
                  : uploadShareUserId
                  ? `อัปโหลดและส่งไฟล์ (${selectedFiles.length})`
                  : `อัปโหลดไฟล์ (${selectedFiles.length})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal 3: เปลี่ยนชื่อและแก้ไขรายละเอียด */}
      <Dialog open={!!editingItem} onOpenChange={(o) => !o && setEditingItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูลรายการ</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveRename} className="space-y-4">
            <div className="space-y-2">
              <Label>ชื่อ *</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>คำอธิบาย</Label>
              <Input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="เพิ่มคำอธิบาย..."
              />
            </div>
            {editingItem?.type === "FOLDER" && (
              <div className="space-y-2">
                <Label>สีโฟลเดอร์</Label>
                <div className="flex items-center gap-2.5">
                  {[
                    "#3b82f6",
                    "#10b981",
                    "#f59e0b",
                    "#ef4444",
                    "#8b5cf6",
                    "#ec4899",
                    "#64748b",
                  ].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={`h-7 w-7 rounded-full border-2 ${
                        editColor === c ? "scale-125 border-slate-900" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingItem(null)}
              >
                ยกเลิก
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                บันทึก
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal 4: ย้ายโฟลเดอร์ */}
      <Dialog open={!!movingItem} onOpenChange={(o) => !o && setMovingItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderInput className="h-5 w-5 text-blue-600" />
              ย้าย &quot;{movingItem?.name}&quot;
            </DialogTitle>
            <DialogDescription>เลือกโฟลเดอร์ปลายทางที่ต้องการย้ายไป</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              <button
                type="button"
                onClick={() => setTargetMoveFolderId(null)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left ${
                  targetMoveFolderId === null
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "hover:bg-slate-50"
                }`}
              >
                <HardDrive className="h-4 w-4 text-blue-600" />
                <span>ไดรฟ์ของฉัน (หน้าแรกสุด)</span>
              </button>
              {allFolders
                .filter((f) => f.id !== movingItem?.id)
                .map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTargetMoveFolderId(f.id)}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left ${
                      targetMoveFolderId === f.id
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <Folder className="h-4 w-4 text-blue-500" />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMovingItem(null)}>
                ยกเลิก
              </Button>
              <Button onClick={handleMoveItem} className="bg-blue-600 hover:bg-blue-700">
                ย้ายมาที่นี่
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal 5: ระบบแชร์และรับ-ส่งไฟล์ (Share with Users & Public Link) */}
      <Dialog open={!!sharingItem} onOpenChange={(o) => !o && setSharingItem(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {sharingItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Share2 className="h-5 w-5 text-blue-600" />
                  ส่งไฟล์และแชร์ &quot;{sharingItem.name}&quot;
                </DialogTitle>
                <DialogDescription>
                  ส่งไฟล์ให้สมาชิกในระบบ หรือสร้างลิงก์สาธารณะเพื่อส่งต่อให้บุคคลภายนอก
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-2">
                {/* Part 1: ส่งให้ผู้ใช้ในระบบ */}
                <form onSubmit={handleShareWithUser} className="space-y-3">
                  <Label className="flex items-center gap-1.5 text-slate-800">
                    <UserPlus className="h-4 w-4 text-blue-600" />
                    ส่งให้ผู้ใช้ในระบบ
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={shareTargetUserId}
                      onChange={(e) => setShareTargetUserId(e.target.value)}
                      className="flex-1 h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                      required
                    >
                      <option value="">-- เลือกผู้รับไฟล์ --</option>
                      {systemUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name ? `${u.name} (${u.username})` : u.username}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sharePermission}
                      onChange={(e) => setSharePermission(e.target.value as "VIEW" | "EDIT")}
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="VIEW">ดูและดาวน์โหลด</option>
                      <option value="EDIT">แก้ไขได้</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="แนบข้อความถึงผู้รับ (ไม่บังคับ)..."
                      value={shareNote}
                      onChange={(e) => setShareNote(e.target.value)}
                      className="text-sm"
                    />
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700 gap-1.5">
                      <Send className="h-4 w-4" />
                      ส่ง
                    </Button>
                  </div>
                </form>

                {/* รายชื่อผู้ที่มีสิทธิ์เข้าถึง */}
                {sharingItem.shares && sharingItem.shares.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">
                      ผู้ที่ได้รับไฟล์นี้แล้ว ({sharingItem.shares.length})
                    </Label>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto border border-slate-100 rounded-xl p-2 bg-slate-50/60">
                      {sharingItem.shares.map((sh) => (
                        <div
                          key={sh.id}
                          className="flex items-center justify-between bg-white px-3 py-2 rounded-lg text-xs border border-slate-100"
                        >
                          <div>
                            <span className="font-semibold text-slate-800">
                              {sh.sharedWithUser?.name || sh.sharedWithUser?.username}
                            </span>
                            <span className="ml-2 text-slate-400">
                              ({sh.permission === "EDIT" ? "แก้ไขได้" : "อ่าน/ดาวน์โหลด"})
                            </span>
                            {sh.note && (
                              <p className="text-[11px] text-slate-500">ข้อความ: {sh.note}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUnshareUser(sh.sharedWithUserId)}
                            className="text-red-500 hover:text-red-700 font-medium"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Part 2: ลิงก์แชร์สาธารณะ (Public Link) */}
                <div className="pt-4 border-t border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-2 rounded-lg ${
                          publicLinkEnabled
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <Link2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          ลิงก์แชร์สาธารณะ (Public Link)
                        </p>
                        <p className="text-xs text-slate-500">
                          {publicLinkEnabled
                            ? "ทุกคนที่มีลิงก์สามารถเข้าถึงไฟล์นี้ได้"
                            : "จำกัดเฉพาะคนที่คุณแชร์ให้เท่านั้น"}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant={publicLinkEnabled ? "outline" : "default"}
                      size="sm"
                      onClick={() => handleUpdatePublicLink(!publicLinkEnabled)}
                      className={
                        publicLinkEnabled
                          ? "border-red-200 text-red-600 hover:bg-red-50"
                          : "bg-emerald-600 hover:bg-emerald-700"
                      }
                    >
                      {publicLinkEnabled ? "ปิดลิงก์สาธารณะ" : "สร้างลิงก์สาธารณะ"}
                    </Button>
                  </div>

                  {publicLinkEnabled && sharingItem.shareToken && (
                    <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      {/* Share URL Box */}
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={`${typeof window !== "undefined" ? window.location.origin : ""}/drive/shared/${sharingItem.shareToken}`}
                          className="bg-white text-xs font-mono"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleCopyShareLink(sharingItem)}
                          className="bg-blue-600 hover:bg-blue-700 gap-1.5 flex-shrink-0"
                        >
                          {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          {copiedLink ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
                        </Button>
                      </div>

                      {/* Security Settings for Public Link */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        <div className="space-y-1">
                          <Label className="text-xs flex items-center gap-1">
                            <Lock className="h-3.5 w-3.5 text-slate-500" />
                            ตั้งรหัสผ่านลิงก์ (ไม่บังคับ)
                          </Label>
                          <Input
                            type="password"
                            placeholder={
                              sharingItem.sharePassword
                                ? "มีรหัสผ่านแล้ว (พิมพ์ใหม่เพื่อเปลี่ยน)"
                                : "ระบุรหัสผ่าน..."
                            }
                            value={publicPassword}
                            onChange={(e) => setPublicPassword(e.target.value)}
                            className="bg-white h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">วันหมดอายุลิงก์ (ไม่บังคับ)</Label>
                          <Input
                            type="date"
                            value={publicExpiresAt}
                            onChange={(e) => setPublicExpiresAt(e.target.value)}
                            className="bg-white h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={publicAllowDownload}
                            onChange={(e) => setPublicAllowDownload(e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          อนุญาตให้ผู้รับดาวน์โหลดไฟล์
                        </label>

                        <div className="flex items-center gap-2">
                          {sharingItem.sharePassword && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdatePublicLink(true, true)}
                              className="h-7 text-xs"
                            >
                              ปลดรหัสผ่าน
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleUpdatePublicLink(true)}
                            className="h-7 text-xs bg-slate-800 hover:bg-slate-900"
                          >
                            บันทึกตั้งค่าลิงก์
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal 6: File Preview (Image, PDF, Excel Spreadsheet, Text) */}
      <Dialog
        open={!!previewItem}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewItem(null);
            if (blobPreviewUrl) {
              URL.revokeObjectURL(blobPreviewUrl);
              setBlobPreviewUrl(null);
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col">
          {previewItem && (
            <>
              <DialogHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3 pr-6">
                <div className="flex items-center gap-3 min-w-0">
                  {renderFileIcon(previewItem, "h-7 w-7 flex-shrink-0")}
                  <div className="min-w-0">
                    <DialogTitle className="truncate text-base">
                      {previewItem.name}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      {formatBytes(previewItem.size)} • แก้ไขเมื่อ{" "}
                      {new Date(previewItem.updatedAt).toLocaleString("th-TH")}
                    </DialogDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openShareModal(previewItem)}
                    className="gap-1.5"
                  >
                    <Share2 className="h-4 w-4" />
                    แชร์
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleDownload(previewItem)}
                    className="bg-blue-600 hover:bg-blue-700 gap-1.5"
                  >
                    <Download className="h-4 w-4" />
                    ดาวน์โหลด
                  </Button>
                </div>
              </DialogHeader>

              {/* Preview Body */}
              <div className="flex-1 overflow-auto min-h-[360px] max-h-[72vh] bg-slate-50 rounded-xl p-4 flex items-center justify-center">
                {previewLoading ? (
                  <div className="text-center space-y-2">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
                    <p className="text-sm text-slate-500">กำลังโหลดตัวอย่างไฟล์...</p>
                  </div>
                ) : excelSheets.length > 0 ? (
                  /* Excel / CSV Table Preview */
                  <div className="w-full h-full flex flex-col gap-3 self-start">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {excelSheets.map((sh, idx) => (
                          <button
                            key={sh.name}
                            onClick={() => setActiveSheetIdx(idx)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                              activeSheetIdx === idx
                                ? "bg-emerald-600 text-white"
                                : "bg-white text-slate-700 border border-slate-200"
                            }`}
                          >
                            {sh.name} ({sh.totalRows} แถว)
                          </button>
                        ))}
                      </div>
                      <span className="text-xs text-slate-500">
                        แสดงตัวอย่างสูงสุด 150 แถวแรก
                      </span>
                    </div>
                    <div className="overflow-auto border border-slate-200 rounded-lg bg-white max-h-[58vh]">
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          {excelSheets[activeSheetIdx]?.rows.map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className={
                                rIdx === 0
                                  ? "bg-slate-100 font-semibold text-slate-800 sticky top-0"
                                  : "border-t border-slate-100 hover:bg-blue-50/30"
                              }
                            >
                              <td className="px-2 py-1.5 bg-slate-50 text-slate-400 border-r border-slate-200 text-center w-10">
                                {rIdx + 1}
                              </td>
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className="px-3 py-1.5 border-r border-slate-100 whitespace-nowrap max-w-xs truncate"
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
                  /* Text / Code Preview */
                  <pre className="w-full h-full self-start bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-auto whitespace-pre-wrap">
                    {textPreview}
                  </pre>
                ) : blobPreviewUrl && previewItem.mimeType?.startsWith("image/") ? (
                  /* Image Preview */
                  <img
                    src={blobPreviewUrl}
                    alt={previewItem.name}
                    className="max-h-[65vh] max-w-full object-contain rounded-lg shadow-sm"
                  />
                ) : blobPreviewUrl && previewItem.mimeType === "application/pdf" ? (
                  /* PDF Preview */
                  <iframe
                    src={blobPreviewUrl}
                    title={previewItem.name}
                    className="w-full h-[65vh] rounded-lg border border-slate-200 bg-white"
                  />
                ) : blobPreviewUrl && previewItem.mimeType?.startsWith("video/") ? (
                  <video src={blobPreviewUrl} controls className="max-h-[65vh] max-w-full rounded-lg" />
                ) : blobPreviewUrl && previewItem.mimeType?.startsWith("audio/") ? (
                  <audio src={blobPreviewUrl} controls className="w-full max-w-md" />
                ) : (
                  /* Fallback for non-previewable binary files */
                  <div className="text-center space-y-4 py-12">
                    <div className="h-16 w-16 rounded-2xl bg-white shadow-xs flex items-center justify-center mx-auto">
                      {renderFileIcon(previewItem, "h-10 w-10")}
                    </div>
                    <div>
                      <p className="text-base font-semibold text-slate-800">
                        {previewItem.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        ไฟล์ประเภทนี้ไม่รองรับการแสดงตัวอย่างบนเบราว์เซอร์โดยตรง กรุณากดดาวน์โหลดเพื่อเปิดไฟล์
                      </p>
                    </div>
                    <Button
                      onClick={() => handleDownload(previewItem)}
                      className="bg-blue-600 hover:bg-blue-700 gap-2"
                    >
                      <Download className="h-4 w-4" />
                      ดาวน์โหลดไฟล์ ({formatBytes(previewItem.size)})
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog (Non-blocking modern modal to prevent INP issues) */}
      <Dialog
        open={Boolean(confirmDialog?.isOpen)}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <AlertCircle className="h-5 w-5 text-red-500" />
              {confirmDialog?.title || "ยืนยันการทำรายการ"}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600 mt-2">
              {confirmDialog?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2.5 mt-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmDialog(null)}
              className="text-slate-600"
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              variant={confirmDialog?.variant || "destructive"}
              size="sm"
              onClick={async () => {
                const action = confirmDialog?.onConfirm;
                setConfirmDialog(null);
                if (action) await action();
              }}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmDialog?.confirmText || "ยืนยัน"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
