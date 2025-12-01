"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PendingApprovalNotification } from "./PendingApprovalNotification";

interface TopBarProps {
  title?: string;
  description?: string;
  onMenuClick?: () => void;
}

export function TopBar({ title, description, onMenuClick }: TopBarProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 bg-gradient-to-r from-blue-50 to-white backdrop-blur-sm shadow-sm px-4 lg:px-6">
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Toggle menu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </Button>

      <div className="flex flex-1 items-center gap-4">
        <div className="flex-1">
          {title && (
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          )}
          {description && (
            <p className="text-sm text-muted-foreground hidden sm:block">{description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isAuthenticated && user ? (
          <>
            {/* Pending Approval Notification (Admin only) */}
            {user.role === "admin" && <PendingApprovalNotification />}
            
            <div className="hidden sm:flex items-center gap-2 text-sm text-blue-900/80">
              <span>{user.username}</span>
              {user.role === "admin" && (
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                  Admin
                </span>
              )}
            </div>
            <Link href="/profile">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center cursor-pointer hover:bg-blue-200 transition-colors">
                <span className="text-xs font-medium text-blue-700">
                  {user.username.charAt(0).toUpperCase()}
                </span>
              </div>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-red-600 hover:text-red-700 hover:bg-red-50">
              ออกจากระบบ
            </Button>
          </>
        ) : (
          <Link href="/login">
            <Button variant="outline" size="sm">
              เข้าสู่ระบบ
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}

