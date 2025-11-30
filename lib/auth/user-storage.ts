import fs from "fs";
import path from "path";

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: "admin" | "user";
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  lastLogin?: string;
}

const USERS_FILE_PATH = path.join(process.cwd(), "data", "users.json");

// สร้าง directory ถ้ายังไม่มี
function ensureDataDirectory() {
  const dataDir = path.dirname(USERS_FILE_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// อ่านข้อมูล users จากไฟล์
export function readUsers(): User[] {
  try {
    ensureDataDirectory();
    if (!fs.existsSync(USERS_FILE_PATH)) {
      // สร้างไฟล์ว่างถ้ายังไม่มี
      fs.writeFileSync(USERS_FILE_PATH, JSON.stringify([], null, 2), "utf-8");
      return [];
    }
    const fileContent = fs.readFileSync(USERS_FILE_PATH, "utf-8");
    return JSON.parse(fileContent) as User[];
  } catch (error) {
    console.error("Error reading users file:", error);
    return [];
  }
}

// บันทึกข้อมูล users ลงไฟล์
export function writeUsers(users: User[]): void {
  try {
    ensureDataDirectory();
    fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(users, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing users file:", error);
    throw new Error("Failed to save user data");
  }
}

// หา user โดย username
export function findUserByUsername(username: string): User | undefined {
  const users = readUsers();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

// หา user โดย ID
export function findUserById(id: string): User | undefined {
  const users = readUsers();
  return users.find((u) => u.id === id);
}

// เพิ่ม user ใหม่
export function createUser(userData: Omit<User, "id" | "createdAt" | "updatedAt">): User {
  const users = readUsers();
  
  // ตรวจสอบ username ซ้ำ
  if (findUserByUsername(userData.username)) {
    throw new Error("Username already exists");
  }

  const newUser: User = {
    ...userData,
    id: generateUserId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  users.push(newUser);
  writeUsers(users);
  return newUser;
}

// อัปเดต user
export function updateUser(id: string, updates: Partial<Omit<User, "id" | "createdAt">>): User {
  const users = readUsers();
  const userIndex = users.findIndex((u) => u.id === id);

  if (userIndex === -1) {
    throw new Error("User not found");
  }

  // ตรวจสอบ username ซ้ำ (ถ้ามีการเปลี่ยน)
  if (updates.username && updates.username !== users[userIndex].username) {
    if (findUserByUsername(updates.username)) {
      throw new Error("Username already exists");
    }
  }

  const updatedUser: User = {
    ...users[userIndex],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  users[userIndex] = updatedUser;
  writeUsers(users);
  return updatedUser;
}

// ลบ user
export function deleteUser(id: string): void {
  const users = readUsers();
  const filteredUsers = users.filter((u) => u.id !== id);

  if (filteredUsers.length === users.length) {
    throw new Error("User not found");
  }

  writeUsers(filteredUsers);
}

// ดึงรายการ users ทั้งหมด
export function getAllUsers(): User[] {
  return readUsers();
}

// สร้าง user ID ใหม่
function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// อัปเดต last login
export function updateLastLogin(id: string): void {
  updateUser(id, { lastLogin: new Date().toISOString() });
}
