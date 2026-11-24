"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import {
  UploadCloud,
  Package,
  FileText,
  AlertTriangle,
  Users,
  Database,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  PackageX,
  BarChart3,
  HardDrive,
  MapPin,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

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
  {
    href: "/",
    label: "Dashboard",
    icon: <BarChart3 className="h-5 w-5" />,
    requireAuth: false,
  },
  {
    label: "นำเข้าและวิเคราะห์รายงาน",
    icon: <UploadCloud className="h-5 w-5" />,
    requireAuth: false,
    submenu: [
      {
        href: "/inventory-master/ya",
        label: "ยาและเวชภัณฑ์",
        icon: <Package className="h-4 w-4" />,
      },
      {
        href: "/inventory-master/vesaphan",
        label: "พัสดุ",
        icon: <Package className="h-4 w-4" />,
      },
    ],
  },
  {
    href: "/drive",
    label: "คลังไฟล์ & รับ-ส่งไฟล์",
    icon: <HardDrive className="h-5 w-5" />,
    requireAuth: true,
  },
  {
    href: "/locations",
    label: "ทะเบียน ITEMSTORE",
    icon: <MapPin className="h-5 w-5" />,
    requireAuth: true,
  },
  {
    href: "/requisitions",
    label: "การเบิกหน่วยงานรายวัน",
    icon: <ClipboardList className="h-5 w-5" />,
    requireAuth: true,
  },
  {
    href: "/maxmin",
    label: "รายการข้อมูล Max Min",
    icon: <Database className="h-5 w-5" />,
    requireAuth: true,
  },
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
  {
    href: "/users",
    label: "จัดการผู้ใช้",
    icon: <Users className="h-5 w-5" />,
    requireAuth: true,
    requireAdmin: true,
  },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { isAuthenticated, isAdmin } = useAuth();
  const [openSubmenus, setOpenSubmenus] = useState<Set<string>>(() => {
    const initialOpen = new Set<string>();
    menuItems.forEach((item) => {
      if (item.submenu) {
        const hasActiveSubmenu = item.submenu.some(
          (subItem) => pathname === subItem.href || pathname.startsWith(subItem.href + "/")
        );
        if (
          hasActiveSubmenu ||
          (item.label === "นำเข้าและวิเคราะห์รายงาน" && pathname.startsWith("/inventory-master"))
        ) {
          initialOpen.add(item.label);
        }
      }
    });
    return initialOpen;
  });

  const toggleSubmenu = (label: string) => {
    if (collapsed) {
      onToggleCollapse?.();
      setOpenSubmenus(new Set([label]));
      return;
    }
    const newOpenSubmenus = new Set(openSubmenus);
    if (newOpenSubmenus.has(label)) {
      newOpenSubmenus.delete(label);
    } else {
      newOpenSubmenus.add(label);
    }
    setOpenSubmenus(newOpenSubmenus);
  };

  const isSubmenuActive = (item: MenuItem) => {
    if (!item.submenu) return false;
    return item.submenu.some(
      (subItem) => pathname === subItem.href || pathname.startsWith(subItem.href + "/")
    );
  };

  return (
    <aside
      className={cn(
        "h-screen bg-gradient-to-b from-blue-50/80 to-blue-100/50 backdrop-blur-sm shadow-lg transition-all duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo/Brand — ปุ่มย่อ/ขยายเมนู */}
        <div
          className={cn(
            "flex bg-gradient-to-r from-blue-600 to-blue-700 backdrop-blur-sm shadow-md",
            collapsed ? "h-auto flex-col items-center gap-1 px-2 py-2" : "h-16 items-center justify-between px-3"
          )}
        >
          <Link
            href="/"
            className={cn("flex items-center gap-2 min-w-0", collapsed && "justify-center")}
            title="TAK Drug Management"
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white shadow-lg overflow-hidden"
              aria-label="TAK Logo"
            >
              <span className="text-[10px] font-black tracking-tight text-[#003B7E]">TAK</span>
            </div>
            {!collapsed && (
              <span className="text-lg font-semibold text-white truncate">Drug Management</span>
            )}
          </Link>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/90 hover:bg-white/15 hover:text-white transition-colors"
              title={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
              aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* Navigation Menu */}
        <nav className={cn("flex-1 space-y-1 py-6 overflow-y-auto", collapsed ? "px-2" : "px-3")}>
          {menuItems
            .filter((item) => {
              if (item.requireAuth && !isAuthenticated) return false;
              if (item.requireAdmin && !isAdmin) return false;
              return true;
            })
            .map((item) => {
              const isActive = item.href ? pathname === item.href : false;
              const hasSubmenu = item.submenu && item.submenu.length > 0;
              const isSubmenuOpen = hasSubmenu && openSubmenus.has(item.label) && !collapsed;
              const isSubmenuItemActive = isSubmenuActive(item);

              return (
                <div key={item.label}>
                  {hasSubmenu ? (
                    <>
                      <button
                        onClick={() => toggleSubmenu(item.label)}
                        title={item.label}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-all duration-200",
                          collapsed ? "justify-center px-2" : "justify-between px-3",
                          isActive || isSubmenuItemActive
                            ? "bg-blue-600 text-white shadow-md"
                            : "text-blue-900/70 hover:bg-blue-100/70 hover:text-blue-700"
                        )}
                      >
                        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
                          {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                          {!collapsed && <span className="text-left leading-snug">{item.label}</span>}
                        </div>
                        {!collapsed &&
                          (isSubmenuOpen ? (
                            <ChevronDown className="h-4 w-4 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 flex-shrink-0" />
                          ))}
                      </button>
                      {isSubmenuOpen && (
                        <div className="ml-4 mt-1 space-y-1 border-l-2 border-blue-200 pl-2">
                          {item.submenu?.map((subItem) => {
                            const isSubActive = pathname === subItem.href;
                            const isPasduSub = subItem.href.includes("/vesaphan");
                            return (
                              <Link
                                key={subItem.href}
                                href={subItem.href}
                                className={cn(
                                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                                  isSubActive
                                    ? isPasduSub
                                      ? "bg-teal-700 text-white shadow-sm"
                                      : "bg-blue-500 text-white shadow-sm"
                                    : isPasduSub
                                      ? "text-teal-800/70 hover:bg-teal-50 hover:text-teal-800"
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
                      title={item.label}
                      className={cn(
                        "flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-all duration-200",
                        collapsed ? "justify-center px-2" : "px-3",
                        isActive
                          ? "bg-blue-600 text-white shadow-md"
                          : "text-blue-900/70 hover:bg-blue-100/70 hover:text-blue-700"
                      )}
                    >
                      {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  )}
                </div>
              );
            })}
        </nav>

        {/* Footer */}
        <div className={cn("bg-blue-50/80 backdrop-blur-sm", collapsed ? "p-2" : "p-4")}>
          {collapsed ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-100"
              title="ขยายเมนู"
            >
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </button>
          ) : (
            <p className="text-xs text-blue-700/70">© 2024 Drug Management</p>
          )}
        </div>
      </div>
    </aside>
  );
}
