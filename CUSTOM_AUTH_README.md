# 🔐 Custom Authentication System with Supabase

ระบบ Custom Authentication ที่ใช้ Supabase Database แทน JSON file storage

## ✨ ฟีเจอร์

- ✅ Login ด้วย username/password
- ✅ Hash password ด้วย bcrypt
- ✅ เก็บผู้ใช้ใน Supabase table
- ✅ Role-based access control (admin/user)
- ✅ Active/Inactive user management
- ✅ Forgot password flow
- ✅ Admin Panel สำหรับจัดการผู้ใช้
- ✅ JWT authentication
- ✅ Production-ready design
- ✅ ไม่มีปัญหาไฟล์ local ใน production

## 📋 สถาปัตยกรรม

### 1. Database Schema

ตาราง `users` ใน Supabase:

```sql
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);
```

### 2. Authentication Flow

```
User → Login Form → API /auth/login → Check Supabase → bcrypt → JWT → return token → AuthContext
```

### 3. API Endpoints

#### Authentication
- `POST /api/auth/login` - Login ด้วย username/password
- `POST /api/auth/register` - สมัครสมาชิก
- `GET /api/auth/me` - ดึงข้อมูลผู้ใช้ปัจจุบัน
- `POST /api/auth/change-password` - เปลี่ยนรหัสผ่าน
- `POST /api/auth/forgot-password` - ขอ reset password
- `GET /api/auth/forgot-password?token=xxx` - ตรวจสอบ reset token
- `PUT /api/auth/forgot-password` - Reset password ด้วย token

#### User Management (Admin Only)
- `GET /api/users` - ดึงรายการผู้ใช้ทั้งหมด
- `POST /api/users` - สร้างผู้ใช้ใหม่
- `GET /api/users/[id]` - ดึงข้อมูลผู้ใช้
- `PUT /api/users/[id]` - อัปเดตผู้ใช้
- `DELETE /api/users/[id]` - ลบผู้ใช้

## 🚀 การติดตั้งและใช้งาน

### 1. ตั้งค่า Environment Variables

สร้างไฟล์ `.env.local`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d
```

### 2. สร้างตาราง users

Migration ถูกสร้างอัตโนมัติแล้วผ่าน Supabase MCP tools

หรือสร้างด้วย SQL:

```sql
-- ดู migration ใน supabase-migrations/create_users_table.sql
```

### 3. สร้าง Admin User

```bash
npm run create-admin
```

หรือกำหนดค่าเอง:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123 npm run create-admin
```

### 4. รัน Development Server

```bash
npm run dev
```

## 🔒 Security Features

### Password Hashing
- ใช้ `bcryptjs` สำหรับ hash password
- Salt rounds: 10
- ไม่เก็บ plaintext password

### JWT Authentication
- Secret key เก็บใน environment variables
- Default expiration: 7 days
- Payload: `{ userId, username, role, iat, exp }`

### Role-based Access Control
- Admin: เข้าถึงได้ทุก API
- User: เข้าถึงได้เฉพาะ API ของตัวเอง

### Active/Inactive Users
- Admin สามารถเปิด/ปิดบัญชีผู้ใช้ได้
- User ที่ inactive จะไม่สามารถ login ได้

## 📧 Forgot Password Flow

### Development Mode
- Reset token จะแสดงใน console
- Reset link จะ return ใน response

### Production Mode
- ต้องตั้งค่า email service (Resend, SMTP, etc.)
- Reset token จะถูกส่งผ่าน email
- Token หมดอายุใน 1 ชั่วโมง

### การใช้งาน

1. **ขอ reset password:**
```bash
POST /api/auth/forgot-password
{
  "username": "user123"
}
```

2. **ตรวจสอบ token:**
```bash
GET /api/auth/forgot-password?token=xxx
```

3. **Reset password:**
```bash
PUT /api/auth/forgot-password
{
  "token": "xxx",
  "newPassword": "newpassword123"
}
```

## 🎯 Admin Panel

Admin สามารถ:
- ดูรายชื่อผู้ใช้ทั้งหมด
- สร้างผู้ใช้ใหม่
- แก้ไข role (admin/user)
- เปิด/ปิดบัญชีผู้ใช้
- Reset password
- ลบผู้ใช้

## 🔄 Migration จาก JSON File Storage

ระบบเดิมใช้ JSON file storage (`data/users.json`) ซึ่งมีปัญหาใน production:
- ❌ `ENOENT: no such file or directory, mkdir '/var/task/data'`
- ❌ ข้อมูลไม่ sync ระหว่าง instances
- ❌ ไม่สามารถ scale ได้

ระบบใหม่ใช้ Supabase:
- ✅ ทำงานได้ทั้ง local และ production
- ✅ ข้อมูล sync อัตโนมัติ
- ✅ Scale ได้ไม่จำกัด
- ✅ Production-ready

## 📝 ไฟล์ที่เปลี่ยนแปลง

### ใหม่
- `app/api/auth/forgot-password/route.ts` - Forgot password API

### แก้ไข
- `lib/auth/user-storage.ts` - เปลี่ยนจาก JSON file เป็น Supabase
- `app/api/auth/login/route.ts` - ใช้ async functions
- `app/api/auth/register/route.ts` - ใช้ async functions
- `app/api/auth/me/route.ts` - ใช้ async functions
- `app/api/auth/change-password/route.ts` - ใช้ async functions
- `app/api/users/route.ts` - ใช้ async functions
- `app/api/users/[id]/route.ts` - ใช้ async functions
- `lib/auth/middleware.ts` - ใช้ async functions
- `scripts/create-admin.ts` - ใช้ Supabase

### ลบ
- `data/users.json` - ไม่ใช้แล้ว

## 🚨 หมายเหตุสำคัญ

1. **Environment Variables**
   - ต้องตั้งค่า `NEXT_PUBLIC_SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET` ต้องเปลี่ยนใน production

2. **Forgot Password**
   - ใน development mode จะแสดง reset link ใน console
   - ใน production ต้องตั้งค่า email service

3. **Database**
   - ใช้ Supabase table `users` (ไม่ใช่ `auth.users`)
   - RLS policies ถูกตั้งค่าแล้ว แต่ใช้ JWT middleware ตรวจสอบเอง

4. **Security**
   - Service role key มีสิทธิ์เต็ม ต้องเก็บให้ปลอดภัย
   - JWT secret ต้องเป็น random string ที่ยาวพอ

## 🔮 Future Enhancements

- [ ] เชื่อมต่อ Active Directory (AD)
- [ ] Email service integration (Resend/SMTP)
- [ ] Two-factor authentication (2FA)
- [ ] Password strength requirements
- [ ] Login attempt rate limiting
- [ ] Session management

## 📚 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [bcrypt Documentation](https://www.npmjs.com/package/bcryptjs)

