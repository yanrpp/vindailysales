# ระบบ Authentication และ User Management

ระบบ authentication ที่ไม่ใช้ database โดยใช้ JSON file สำหรับเก็บข้อมูลผู้ใช้

## คุณสมบัติ

### Authentication
- ✅ Login/Logout
- ✅ Register (สมัครสมาชิก)
- ✅ JWT Token-based authentication
- ✅ Password hashing ด้วย bcrypt
- ✅ Session management
- ✅ Protected routes

### User Management
- ✅ สร้าง/แก้ไข/ลบผู้ใช้ (Admin only)
- ✅ เปลี่ยนรหัสผ่าน
- ✅ User roles (Admin/User)
- ✅ User status (Active/Inactive)
- ✅ ดูข้อมูลโปรไฟล์

## โครงสร้างไฟล์

```
lib/auth/
├── user-storage.ts      # ระบบเก็บข้อมูลผู้ใช้ (JSON file)
├── auth-utils.ts        # Utilities สำหรับ JWT และ password hashing
├── middleware.ts        # Middleware สำหรับ protected routes
├── auth-context.tsx     # React Context สำหรับ authentication state
└── use-protected-route.ts # Hook สำหรับ protected routes

app/api/auth/
├── login/route.ts       # API endpoint สำหรับ login
├── register/route.ts   # API endpoint สำหรับ register
├── me/route.ts         # API endpoint สำหรับดึงข้อมูล user ปัจจุบัน
└── change-password/route.ts # API endpoint สำหรับเปลี่ยนรหัสผ่าน

app/api/users/
├── route.ts            # API endpoints สำหรับจัดการ users (GET, POST)
└── [id]/route.ts       # API endpoints สำหรับจัดการ user โดย ID (GET, PUT, DELETE)

app/
├── login/page.tsx      # หน้า Login
├── register/page.tsx  # หน้า Register
├── profile/page.tsx   # หน้า Profile
└── users/page.tsx    # หน้า User Management (Admin only)
```

## การติดตั้งและใช้งาน

### 1. สร้าง Admin User เริ่มต้น

```bash
npm run create-admin
```

หรือกำหนดค่าเอง:

```bash
ADMIN_USERNAME=admin ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=admin123 npm run create-admin
```

Default credentials:
- Username: `admin`
- Email: `admin@example.com`
- Password: `admin123`

⚠️ **สำคัญ**: ควรเปลี่ยนรหัสผ่านหลังจาก login ครั้งแรก!

### 2. ตั้งค่า Environment Variables

สร้างไฟล์ `.env.local`:

```env
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d
```

### 3. ข้อมูลผู้ใช้ถูกเก็บใน

```
data/users.json
```

ไฟล์นี้จะถูกสร้างอัตโนมัติเมื่อมีการสร้าง user ครั้งแรก

## API Endpoints

### Authentication

#### POST `/api/auth/login`
Login และรับ JWT token

**Request:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### POST `/api/auth/register`
สมัครสมาชิกใหม่

**Request:**
```json
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "password123"
}
```

#### GET `/api/auth/me`
ดึงข้อมูล user ปัจจุบัน (ต้องมี token)

**Headers:**
```
Authorization: Bearer <token>
```

#### POST `/api/auth/change-password`
เปลี่ยนรหัสผ่าน (ต้องมี token)

**Request:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

### User Management (Admin Only)

#### GET `/api/users`
ดึงรายการ users ทั้งหมด

#### POST `/api/users`
สร้าง user ใหม่

**Request:**
```json
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "password123",
  "role": "user",
  "isActive": true
}
```

#### GET `/api/users/[id]`
ดึงข้อมูล user โดย ID

#### PUT `/api/users/[id]`
อัปเดต user

**Request:**
```json
{
  "username": "updateduser",
  "email": "updated@example.com",
  "role": "admin",
  "isActive": true,
  "password": "newpassword" // optional
}
```

#### DELETE `/api/users/[id]`
ลบ user

## การใช้งานใน Frontend

### ใช้ Auth Context

```tsx
import { useAuth } from "@/lib/auth/auth-context";

function MyComponent() {
  const { user, isAuthenticated, isAdmin, login, logout } = useAuth();

  if (!isAuthenticated) {
    return <div>Please login</div>;
  }

  return (
    <div>
      <p>Welcome, {user?.username}!</p>
      {isAdmin && <p>You are an admin</p>}
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Protected Routes

```tsx
import { useProtectedRoute } from "@/lib/auth/use-protected-route";

function ProtectedPage() {
  // ต้อง login ก่อนถึงจะเข้าหน้านี้ได้
  useProtectedRoute();

  return <div>Protected content</div>;
}
```

### Admin Only Routes

```tsx
import { useProtectedRoute } from "@/lib/auth/use-protected-route";

function AdminPage() {
  // ต้องเป็น admin ถึงจะเข้าหน้านี้ได้
  useProtectedRoute({ requireAdmin: true });

  return <div>Admin only content</div>;
}
```

## Security Features

1. **Password Hashing**: ใช้ bcrypt สำหรับ hash password (salt rounds: 10)
2. **JWT Tokens**: ใช้ JWT สำหรับ authentication
3. **Token Expiration**: Token มีอายุ (default: 7 วัน)
4. **Role-based Access Control**: แยกสิทธิ์ Admin และ User
5. **Input Validation**: ตรวจสอบ input ทุก endpoint
6. **Protected Routes**: Middleware สำหรับป้องกัน routes

## หมายเหตุ

- ข้อมูลผู้ใช้ถูกเก็บใน JSON file (`data/users.json`)
- ไฟล์นี้ถูก ignore โดย git (ดูใน `.gitignore`)
- สำหรับ production ควรพิจารณาใช้ database จริง
- ควรตั้งค่า `JWT_SECRET` ที่แข็งแรงใน production
- ควรเปลี่ยน default admin password หลังจาก login ครั้งแรก

## Troubleshooting

### ไม่สามารถ login ได้
- ตรวจสอบว่าได้สร้าง admin user แล้วหรือยัง (`npm run create-admin`)
- ตรวจสอบว่าไฟล์ `data/users.json` ถูกสร้างแล้ว
- ตรวจสอบ console logs สำหรับ error messages

### Token expired
- Token มีอายุ 7 วัน (default)
- Login ใหม่เพื่อรับ token ใหม่

### Permission denied
- ตรวจสอบว่า user มี role ที่ถูกต้อง (admin สำหรับ admin functions)
- ตรวจสอบว่า user มีสถานะ active

