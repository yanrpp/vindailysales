"use client";

import { useEffect, useState } from "react";
import { useProtectedRoute } from "@/lib/auth/use-protected-route";
import { useAuth } from "@/lib/auth/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User } from "@/lib/auth/user-storage";

export default function UsersPage() {
  useProtectedRoute({ requireAdmin: true });
  const { token, isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    role: "user" as "admin" | "user",
    isActive: true,
  });

  // โหลดรายการ users
  const loadUsers = async () => {
    try {
      const response = await fetch("/api/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setUsers(data.users);
      } else {
        setError(data.error || "Failed to load users");
      }
    } catch (err) {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && token) {
      loadUsers();
    }
  }, [isAdmin, token]);

  // สร้าง user ใหม่
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setShowCreateForm(false);
        setFormData({
          username: "",
          email: "",
          password: "",
          role: "user",
          isActive: true,
        });
        loadUsers();
      } else {
        setError(data.error || "Failed to create user");
      }
    } catch (err) {
      setError("Failed to create user");
    }
  };

  // อัปเดต user
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setError(null);

    try {
      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setEditingUser(null);
        setFormData({
          username: "",
          email: "",
          password: "",
          role: "user",
          isActive: true,
        });
        loadUsers();
      } else {
        setError(data.error || "Failed to update user");
      }
    } catch (err) {
      setError("Failed to update user");
    }
  };

  // ลบ user
  const handleDelete = async (id: string) => {
    if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้นี้?")) return;

    try {
      const response = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        loadUsers();
      } else {
        setError(data.error || "Failed to delete user");
      }
    } catch (err) {
      setError("Failed to delete user");
    }
  };

  // เริ่มแก้ไข
  const startEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: "",
      role: user.role,
      isActive: user.isActive,
    });
    setShowCreateForm(false);
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center p-8">
        <Alert>
          <AlertDescription>คุณไม่มีสิทธิ์เข้าถึงหน้านี้</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">จัดการผู้ใช้</h1>
          <p className="text-sm text-muted-foreground">
            จัดการบัญชีผู้ใช้ทั้งหมดในระบบ
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? "ยกเลิก" : "เพิ่มผู้ใช้ใหม่"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Create/Edit Form */}
      {(showCreateForm || editingUser) && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingUser ? "แก้ไขผู้ใช้" : "เพิ่มผู้ใช้ใหม่"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={editingUser ? handleUpdate : handleCreate}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">ชื่อผู้ใช้</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) =>
                      setFormData({ ...formData, username: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">อีเมล</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">
                    รหัสผ่าน {editingUser && "(เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน)"}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    required={!editingUser}
                    minLength={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">บทบาท</Label>
                  <select
                    id="role"
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        role: e.target.value as "admin" | "user",
                      })
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="isActive">สถานะ</Label>
                  <select
                    id="isActive"
                    value={formData.isActive ? "true" : "false"}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isActive: e.target.value === "true",
                      })
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit">
                  {editingUser ? "บันทึกการแก้ไข" : "สร้างผู้ใช้"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingUser(null);
                    setFormData({
                      username: "",
                      email: "",
                      password: "",
                      role: "user",
                      isActive: true,
                    });
                  }}
                >
                  ยกเลิก
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>รายการผู้ใช้ ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              กำลังโหลด...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              ไม่มีผู้ใช้ในระบบ
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ชื่อผู้ใช้</TableHead>
                    <TableHead>อีเมล</TableHead>
                    <TableHead>บทบาท</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead>สร้างเมื่อ</TableHead>
                    <TableHead>จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.username}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            user.role === "admin"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {user.role === "admin" ? "Admin" : "User"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            user.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {new Date(user.createdAt).toLocaleDateString("th-TH")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEdit(user)}
                          >
                            แก้ไข
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(user.id)}
                          >
                            ลบ
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

