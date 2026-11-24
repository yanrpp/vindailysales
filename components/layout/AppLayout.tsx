"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useAuth } from "@/lib/auth/auth-context";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

const publicPages = ["/login", "/register"];
const SIDEBAR_COLLAPSED_KEY = "tak-sidebar-collapsed";

export function AppLayout({ children, title, description }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const isPublicPage = publicPages.includes(pathname) || pathname.startsWith("/drive/shared/");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (saved === "1") setSidebarCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  useEffect(() => {
    if (!loading && !isPublicPage && !isAuthenticated) {
      const redirectUrl =
        pathname !== "/" ? `/login?redirect=${encodeURIComponent(pathname)}` : "/login";
      router.push(redirectUrl);
    }
  }, [isAuthenticated, loading, isPublicPage, pathname, router]);

  if (isPublicPage) {
    return <>{children}</>;
  }

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
      <div className="hidden lg:block relative">
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapsed} />
      </div>

      {/* Sidebar - Mobile (Overlay) — เต็มความกว้าง */}
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
      <div className="flex flex-1 flex-col overflow-hidden bg-background min-w-0">
        <TopBar
          title={title}
          description={description}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-blue-50/30 via-white to-red-50/20">
          <div className="h-full p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
