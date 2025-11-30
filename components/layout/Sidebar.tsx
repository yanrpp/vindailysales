"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";

interface MenuItem {
  href: string;
  label: string;
  icon?: React.ReactNode;
  requireAuth?: boolean;
  requireAdmin?: boolean;
}

const menuItems: MenuItem[] = [
  {
    href: "/",
    label: "รายการข้อมูล",
    requireAuth: true,
  },
  {
    href: "/data",
    label: "ข้อมูล",
    requireAuth: true,
  },
  {
    href: "/upload",
    label: "นำเข้าข้อมูล",
    requireAuth: true,
  },
  {
    href: "/users",
    label: "จัดการผู้ใช้",
    requireAuth: true,
    requireAdmin: true,
  },
  {
    href: "/profile",
    label: "โปรไฟล์",
    requireAuth: true,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAuthenticated, isAdmin } = useAuth();

  return (
    <aside className="h-screen w-64 bg-gradient-to-b from-blue-50/80 to-blue-100/50 backdrop-blur-sm shadow-lg transition-transform">
      <div className="flex h-full flex-col">
        {/* Logo/Brand */}
        <div className="flex h-16 items-center px-6 bg-gradient-to-r from-blue-600 to-blue-700 backdrop-blur-sm shadow-md">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-blue-600 shadow-lg">
              <span className="text-sm font-bold">VS</span>
            </div>
            <span className="text-lg font-semibold text-white">Daily Sales</span>
          </Link>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 space-y-1 px-3 py-6">
          {menuItems
            .filter((item) => {
              if (item.requireAuth && !isAuthenticated) return false;
              if (item.requireAdmin && !isAdmin) return false;
              return true;
            })
            .map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-blue-900/70 hover:bg-blue-100/70 hover:text-blue-700"
                  )}
                >
                  {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                  <span>{item.label}</span>
                </Link>
              );
            })}
        </nav>

        {/* Footer */}
        <div className="p-4 bg-blue-50/80 backdrop-blur-sm">
          <p className="text-xs text-blue-700/70">
            © 2024 Daily Sales Management
          </p>
        </div>
      </div>
    </aside>
  );
}

