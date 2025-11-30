"use client";

import { useState } from "react";
import { useProtectedRoute } from "@/lib/auth/use-protected-route";
import { useAuth } from "@/lib/auth/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ProfilePage() {
  useProtectedRoute();
  const { user, token, updateUser: updateAuthUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // เปลี่ยน password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError("รหัสผ่านใหม่ไม่ตรงกัน");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess("เปลี่ยนรหัสผ่านสำเร็จ");
        setPasswordData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
      } else {
        setError(data.error || "Failed to change password");
      }
    } catch (err) {
      setError("Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">โปรไฟล์ของฉัน</h1>
        <p className="text-sm text-muted-foreground">
          จัดการข้อมูลส่วนตัวและรหัสผ่าน
        </p>
      </div>

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลผู้ใช้</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>ชื่อผู้ใช้</Label>
              <Input value={user.username} disabled />
            </div>

            <div className="space-y-2">
              <Label>อีเมล</Label>
              <Input value={user.email} disabled />
            </div>

            <div className="space-y-2">
              <Label>บทบาท</Label>
              <Input
                value={user.role === "admin" ? "Admin" : "User"}
                disabled
              />
            </div>

            <div className="space-y-2">
              <Label>สถานะ</Label>
              <Input
                value={user.isActive ? "Active" : "Inactive"}
                disabled
              />
            </div>

            <div className="space-y-2">
              <Label>สร้างเมื่อ</Label>
              <Input
                value={new Date(user.createdAt).toLocaleString("th-TH")}
                disabled
              />
            </div>

            {user.lastLogin && (
              <div className="space-y-2">
                <Label>เข้าสู่ระบบล่าสุด</Label>
                <Input
                  value={new Date(user.lastLogin).toLocaleString("th-TH")}
                  disabled
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>เปลี่ยนรหัสผ่าน</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="bg-green-50 border-green-200">
                <AlertDescription className="text-green-800">
                  {success}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="currentPassword">รหัสผ่านปัจจุบัน</Label>
              <Input
                id="currentPassword"
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) =>
                  setPasswordData({
                    ...passwordData,
                    currentPassword: e.target.value,
                  })
                }
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">รหัสผ่านใหม่</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordData.newPassword}
                onChange={(e) =>
                  setPasswordData({
                    ...passwordData,
                    newPassword: e.target.value,
                  })
                }
                required
                disabled={loading}
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">ยืนยันรหัสผ่านใหม่</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) =>
                  setPasswordData({
                    ...passwordData,
                    confirmPassword: e.target.value,
                  })
                }
                required
                disabled={loading}
                minLength={6}
              />
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? "กำลังเปลี่ยนรหัสผ่าน..." : "เปลี่ยนรหัสผ่าน"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

