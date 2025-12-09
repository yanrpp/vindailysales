-- Migration: สร้างตาราง date_report และเพิ่มฟิลด์ id_date ใน products
-- วันที่: 2025-01-XX
-- คำอธิบาย: สร้างตาราง date_report สำหรับเก็บวันที่รายงาน และเชื่อมโยงกับ products ผ่าน id_date

-- 1. สร้างตาราง date_report
CREATE TABLE IF NOT EXISTS public.date_report (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detail_date TEXT NOT NULL, -- วันที่รายงานที่ดึงจาก Excel (ข้อความหลัง "ประจำวันงวดวันที่")
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(detail_date) -- ไม่ให้มี detail_date ซ้ำกัน
);

-- 2. เพิ่มฟิลด์ id_date ในตาราง products
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'products' 
    AND column_name = 'id_date'
  ) THEN
    ALTER TABLE public.products 
    ADD COLUMN id_date UUID REFERENCES public.date_report(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. สร้าง index สำหรับ detail_date
CREATE INDEX IF NOT EXISTS idx_date_report_detail_date ON public.date_report(detail_date);

-- 4. สร้าง index สำหรับ id_date ใน products
CREATE INDEX IF NOT EXISTS idx_products_id_date ON public.products(id_date);

-- 5. สร้าง trigger สำหรับอัปเดต updated_at ใน date_report
CREATE TRIGGER update_date_report_updated_at
  BEFORE UPDATE ON public.date_report
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. เพิ่ม comments
COMMENT ON TABLE public.date_report IS 'ตารางเก็บวันที่รายงานจากไฟล์ Excel';
COMMENT ON COLUMN public.date_report.detail_date IS 'วันที่รายงานที่ดึงจาก Excel (ข้อความหลัง "ประจำวันงวดวันที่")';
COMMENT ON COLUMN public.products.id_date IS 'เชื่อมโยงกับตาราง date_report';

