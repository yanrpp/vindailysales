-- Migration: เพิ่มคอลัมน์ is_approved ในตาราง users
-- วันที่: 2025-01-XX
-- คำอธิบาย: เพิ่มฟิลด์ is_approved เพื่อให้ผู้ใช้ที่สมัครใหม่ต้องรอการอนุมัติจาก admin

-- เพิ่มคอลัมน์ is_approved
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

-- อัปเดตผู้ใช้ที่มีอยู่แล้ว (admin และ user ที่มีอยู่แล้ว) ให้ได้รับการอนุมัติทันที
UPDATE public.users
SET is_approved = true
WHERE is_approved = false;

-- เพิ่ม comment สำหรับคอลัมน์
COMMENT ON COLUMN public.users.is_approved IS 'สถานะการอนุมัติจาก admin (true = อนุมัติแล้ว, false = รอการอนุมัติ)';

