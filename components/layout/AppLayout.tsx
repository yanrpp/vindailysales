"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

// หน้าเหล่านี้ไม่ต้องแสดง sidebar และ topbar และไม่ต้องตรวจสอบ authentication
const publicPages = ["/login", "/register"];

export function AppLayout({ children, title, description }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const isPublicPage = publicPages.includes(pathname);

  // ตรวจสอบ authentication และ redirect ถ้ายังไม่ได้ login
  useEffect(() => {
    if (!loading && !isPublicPage && !isAuthenticated) {
      // เก็บ URL ปัจจุบันไว้ใน query parameter เพื่อ redirect กลับมาหลัง login
      const redirectUrl = pathname !== "/" ? `/login?redirect=${encodeURIComponent(pathname)}` : "/login";
      router.push(redirectUrl);
    }
  }, [isAuthenticated, loading, isPublicPage, pathname, router]);

  // ถ้าเป็น public page (login/register) ให้แสดงแค่ children
  if (isPublicPage) {
    return <>{children}</>;
  }

  // ถ้ายัง loading หรือยังไม่ได้ login ให้แสดง loading state
  if (loading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar - Desktop */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Sidebar - Mobile (Overlay) */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed left-0 top-0 z-50 lg:hidden">
            <Sidebar />
          </div>
        </>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        {/* Top Bar */}
        <TopBar 
          title={title} 
          description={description}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-blue-50/30 via-white to-red-50/20">
          <div className="h-full p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

