-- Migration: เพิ่มฟิลด์ item_type ในตาราง products
-- วันที่: 2025-01-XX
-- คำอธิบาย: เพิ่มคอลัมน์ item_type เพื่อเก็บข้อมูลประเภทสินค้าจากคอลัม A แถวก่อนหน้า

-- เพิ่มคอลัมน์ item_type ในตาราง products (ถ้ายังไม่มี)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'item_type'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN item_type TEXT;
  END IF;
END $$;

-- อัปเดต comment
COMMENT ON COLUMN public.products.item_type IS 'ประเภทสินค้า (item_type) จากคอลัม A แถวก่อนหน้า - แถวที่มีเฉพาะคอลัม A และอยู่ก่อนแถวสินค้า';

