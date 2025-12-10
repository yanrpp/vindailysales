"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { User } from "./user-storage";

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // โหลดข้อมูลจาก localStorage เมื่อ component mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        // ตรวจสอบว่า token ยัง valid หรือไม่
        verifyTokenAndFetchUser(storedToken);
      } catch (error) {
        console.error("Error loading auth data:", error);
        clearAuth();
      }
    }
    setLoading(false);
  }, []);

  // ตรวจสอบ token และดึงข้อมูล user
  const verifyTokenAndFetchUser = async (authToken: string) => {
    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          setUser(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        } else {
          clearAuth();
        }
      } else {
        clearAuth();
      }
    } catch (error) {
      console.error("Error verifying token:", error);
      clearAuth();
    }
  };

  // ลบข้อมูล auth
  const clearAuth = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  // Login
  const login = async (username: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        // ถ้า error มาจาก pending approval ให้ throw error พร้อม message (ไม่ log ใน console)
        if (data.pendingApproval) {
          const error = new Error(data.error || "✅ “บัญชีของคุณกำลังรอการอนุมัติ โปรดรอผู้ดูแลระบบอนุมัติก่อนจึงจะสามารถเข้าใช้งานระบบได้”");
          // ไม่ log error ที่เป็น expected behavior
          return Promise.reject(error);
        }
        throw new Error(data.error || "Login failed");
      }

      if (data.success && data.token && data.user) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error: any) {
      // ไม่ log error ที่เป็น expected behavior (pending approval, invalid credentials)
      // Log เฉพาะ unexpected errors
      if (!error.message || (!error.message.includes("pending approval") && !error.message.includes("Invalid username or password"))) {
        console.error("Login error:", error);
      }
      throw error;
    }
  };

  // Register
  const register = async (username: string, password: string, name?: string) => {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password, name }),
      });

      const data = await response.json();

      if (!response.ok) {
        // ใช้ Promise.reject แทน throw เพื่อไม่ให้ log expected errors ใน console
        const error = new Error(data.error || "Registration failed");
        return Promise.reject(error);
      }

      // ถ้าสมัครสำเร็จแต่ยังรอการอนุมัติ (pendingApproval = true)
      if (data.success && data.pendingApproval) {
        // ไม่เก็บ token และ user เพราะยังไม่ได้รับการอนุมัติ
        // ใช้ Promise.reject แทน throw เพื่อไม่ให้ log ใน console
        const error = new Error(data.message || "Your account is pending approval from an administrator.");
        return Promise.reject(error);
      }

      if (data.success && data.token && data.user) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error: any) {
      // ไม่ log error ที่เป็น expected behavior (pending approval, username already exists, validation errors)
      // Log เฉพาะ unexpected errors
      const isExpectedError = 
        error.message?.includes("pending approval") ||
        error.message?.includes("Username already exists") ||
        error.message?.includes("Password must be at least") ||
        error.message?.includes("Username and password are required");
      
      if (!isExpectedError) {
        console.error("Register error:", error);
      }
      throw error;
    }
  };

  // Logout
  const logout = () => {
    clearAuth();
  };

  // อัปเดตข้อมูล user
  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      setUser(updatedUser);
      localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
    }
  };

  const value: AuthContextType = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    updateUser,
    isAuthenticated: !!user && !!token,
    isAdmin: user?.role === "admin",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook สำหรับใช้ auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

