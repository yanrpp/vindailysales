"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { User } from "@/lib/auth/user-storage";
import Link from "next/link";

export function PendingApprovalNotification() {
  const { token, isAdmin } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // โหลดรายการผู้ใช้ที่รอการอนุมัติ
  const loadPendingUsers = async () => {
    if (!isAdmin || !token) return;

    setLoading(true);
    try {
      const response = await fetch("/api/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // กรองเฉพาะผู้ใช้ที่รอการอนุมัติ
        const pending = data.users.filter((user: User) => !user.isApproved);
        setPendingUsers(pending);
      }
    } catch (err) {
      console.error("Failed to load pending users:", err);
    } finally {
      setLoading(false);
    }
  };

  // โหลดข้อมูลเมื่อ component mount และเมื่อ isAdmin หรือ token เปลี่ยน
  useEffect(() => {
    if (isAdmin && token) {
      loadPendingUsers();
      
      // Refresh เมื่อ focus กลับมาที่หน้าต่าง (เมื่อผู้ใช้กลับมาจากหน้า users)
      const handleFocus = () => {
        loadPendingUsers();
      };
      window.addEventListener("focus", handleFocus);
      
      return () => {
        window.removeEventListener("focus", handleFocus);
      };
    }
  }, [isAdmin, token]);

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // ไม่แสดงถ้าไม่ใช่ admin หรือไม่มีผู้ใช้ที่รอการอนุมัติ
  if (!isAdmin || pendingUsers.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Notification Badge Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100 hover:border-yellow-400"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        <span className="ml-2 font-semibold">{pendingUsers.length}</span>
        {/* Badge indicator */}
        <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full border-2 border-white"></span>
      </Button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 bg-yellow-50">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-yellow-900">
                รอการอนุมัติ ({pendingUsers.length})
              </h3>
              <Link
                href="/users"
                onClick={() => setIsOpen(false)}
                className="text-xs text-yellow-700 hover:text-yellow-900 underline"
              >
                ดูทั้งหมด
              </Link>
            </div>
          </div>

          {/* User List */}
          <div className="overflow-y-auto max-h-80">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                กำลังโหลด...
              </div>
            ) : pendingUsers.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                ไม่มีผู้ใช้ที่รอการอนุมัติ
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {pendingUsers.map((user) => (
                  <div
                    key={user.id}
                    className="px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-medium text-blue-700">
                              {user.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {user.username}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(user.createdAt).toLocaleDateString("th-TH", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              user.role === "admin"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {user.role === "admin" ? "Admin" : "User"}
                          </span>
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800">
                            รอการอนุมัติ
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
            <Link href="/users">
              <Button
                variant="default"
                size="sm"
                className="w-full"
                onClick={() => setIsOpen(false)}
              >
                ไปที่หน้าจัดการผู้ใช้
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

