"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { UploadCloud, Package, FileText, AlertTriangle, Users, User, Database, ChevronDown, ChevronRight, PackageX, BarChart3 } from "lucide-react";

interface SubMenuItem {
  href: string;
  label: string;
  icon?: React.ReactNode;
}

interface MenuItem {
  href?: string;
  label: string;
  icon?: React.ReactNode;
  requireAuth?: boolean;
  requireAdmin?: boolean;
  submenu?: SubMenuItem[];
}

const menuItems: MenuItem[] = [
  // Dashboard Section (หน้าแรก)
  {
    href: "/",
    label: "Dashboard",
    icon: <BarChart3 className="h-5 w-5" />,
    requireAuth: true,
  },
  // Daily Sales Section
  {
    href: "/data",
    label: "รายการข้อมูล Max Min",
    icon: <Database className="h-5 w-5" />,
    requireAuth: true,
  },
  // Inventory Section
  {
    href: "/inventory/non-moving",
    label: "สินค้าไม่เคลื่อนไหว",
    icon: <PackageX className="h-5 w-5" />,
    requireAuth: true,
    submenu: [
      {
        href: "/inventory/non-moving",
        label: "รายการ",
        icon: <FileText className="h-4 w-4" />,
      },
      {
        href: "/inventory/products",
        label: "LOT",
        icon: <FileText className="h-4 w-4" />,
      },
      {
        href: "/inventory/expired",
        label: "สินค้าหมดอายุ",
        icon: <AlertTriangle className="h-4 w-4" />,
      },
    ],
  },
  // Admin Section
  {
    href: "/users",
    label: "จัดการผู้ใช้",
    icon: <Users className="h-5 w-5" />,
    requireAuth: true,
    requireAdmin: true,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAuthenticated, isAdmin } = useAuth();
  const [openSubmenus, setOpenSubmenus] = useState<Set<string>>(() => {
    // Auto-open submenu if current pathname matches any submenu item
    const initialOpen = new Set<string>();
    menuItems.forEach((item) => {
      if (item.submenu) {
        const hasActiveSubmenu = item.submenu.some((subItem) => pathname === subItem.href);
        if (hasActiveSubmenu) {
          initialOpen.add(item.label);
        }
      }
    });
    return initialOpen;
  });

  const toggleSubmenu = (label: string) => {
    const newOpenSubmenus = new Set(openSubmenus);
    if (newOpenSubmenus.has(label)) {
      newOpenSubmenus.delete(label);
    } else {
      newOpenSubmenus.add(label);
    }
    setOpenSubmenus(newOpenSubmenus);
  };

  // ตรวจสอบว่า pathname อยู่ใน submenu หรือไม่
  const isSubmenuActive = (item: MenuItem) => {
    if (!item.submenu) return false;
    return item.submenu.some((subItem) => pathname === subItem.href);
  };

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
        <nav className="flex-1 space-y-1 px-3 py-6 overflow-y-auto">
          {menuItems
            .filter((item) => {
              if (item.requireAuth && !isAuthenticated) return false;
              if (item.requireAdmin && !isAdmin) return false;
              return true;
            })
            .map((item) => {
              const isActive = item.href ? pathname === item.href : false;
              const hasSubmenu = item.submenu && item.submenu.length > 0;
              const isSubmenuOpen = hasSubmenu && openSubmenus.has(item.label);
              const isSubmenuItemActive = isSubmenuActive(item);

              return (
                <div key={item.label}>
                  {hasSubmenu ? (
                    <>
                      <button
                        onClick={() => toggleSubmenu(item.label)}
                        className={cn(
                          "w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          isActive || isSubmenuItemActive
                            ? "bg-blue-600 text-white shadow-md"
                            : "text-blue-900/70 hover:bg-blue-100/70 hover:text-blue-700"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                          <span>{item.label}</span>
                        </div>
                        {isSubmenuOpen ? (
                          <ChevronDown className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 flex-shrink-0" />
                        )}
                      </button>
                      {isSubmenuOpen && (
                        <div className="ml-4 mt-1 space-y-1 border-l-2 border-blue-200 pl-2">
                          {item.submenu?.map((subItem) => {
                            const isSubActive = pathname === subItem.href;
                            return (
                              <Link
                                key={subItem.href}
                                href={subItem.href}
                                className={cn(
                                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                                  isSubActive
                                    ? "bg-blue-500 text-white shadow-sm"
                                    : "text-blue-800/70 hover:bg-blue-50 hover:text-blue-700"
                                )}
                              >
                                {subItem.icon && <span className="flex-shrink-0">{subItem.icon}</span>}
                                <span>{subItem.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href={item.href || "#"}
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
                  )}
                </div>
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

