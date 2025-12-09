-- Migration: เพิ่มฟิลด์ store_location ในตาราง products
-- วันที่: 2025-01-XX
-- คำอธิบาย: เพิ่มคอลัมน์ store_location เพื่อเก็บข้อมูล store location จากคอลัม G แถวแรก (ข้อความในวงเล็บ [])

-- เพิ่มคอลัมน์ store_location ในตาราง products (ถ้ายังไม่มี)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'store_location'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN store_location TEXT;
  END IF;
END $$;

-- อัปเดต comment
COMMENT ON COLUMN public.products.store_location IS 'ตำแหน่งจัดเก็บ (store location) จากคอลัม G แถวแรก - ข้อความในวงเล็บ []';

