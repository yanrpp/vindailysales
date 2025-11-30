"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-context";

interface UseProtectedRouteOptions {
  requireAdmin?: boolean;
  redirectTo?: string;
}

export function useProtectedRoute(options: UseProtectedRouteOptions = {}) {
  const { requireAdmin = false, redirectTo = "/login" } = options;
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        router.push(redirectTo);
      } else if (requireAdmin && !isAdmin) {
        router.push("/");
      }
    }
  }, [isAuthenticated, isAdmin, loading, requireAdmin, redirectTo, router]);

  return { isAuthenticated, isAdmin, loading };
}

