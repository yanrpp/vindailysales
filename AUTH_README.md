# 🔐 ระบบ Authentication และ User Management ด้วย Prisma ORM

ระบบ Authentication และ User Management ที่เชื่อมต่อกับ PostgreSQL / Vercel Postgres ด้วย Prisma ORM

## ✨ คุณสมบัติ

### Authentication
- ✅ Login/Logout
- ✅ Register (สมัครสมาชิก)
- ✅ JWT Token-based authentication
- ✅ Password hashing ด้วย bcrypt
- ✅ Session management
- ✅ Protected routes

### User Management
- ✅ สร้าง/แก้ไข/ลบผู้ใช้ (Admin only)
- ✅ อนุมัติการเข้าใช้งาน (Approve user)
- ✅ เปลี่ยนรหัสผ่าน / รีเซ็ตรหัสผ่าน
- ✅ User roles (Admin/User)
- ✅ User status (Active/Inactive)
- ✅ ดูข้อมูลโปรไฟล์

## 📋 สถาปัตยกรรม

### 1. Database Schema (`prisma/schema.prisma`)

```prisma
model User {
  id           String    @id @default(uuid())
  username     String    @unique
  name         String?
  passwordHash String    @map("password_hash")
  role         String    @default("user") // "admin" | "user"
  isActive     Boolean   @default(true) @map("is_active")
  isApproved   Boolean   @default(false) @map("is_approved")
  lastLogin    DateTime? @map("last_login")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  @@map("users")
}
```

### 2. การตั้งค่า Environment Variables

กำหนดใน `.env.local` หรือ `.env`:

```env
DATABASE_URL="postgresql://username:password@hostname:5432/database?sslmode=require"
DIRECT_URL="postgresql://username:password@hostname:5432/database?sslmode=require"

JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d
```

### 3. การ Push Schema เข้า Database

```bash
npm run db:push
```

### 4. สร้าง Admin User เริ่มต้น

```bash
npm run create-admin
```

หรือกำหนดค่าเอง:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123 npm run create-admin
```

Default credentials:
- Username: `admin`
- Password: `admin123`
