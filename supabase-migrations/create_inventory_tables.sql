-- Migration: สร้างตารางสำหรับระบบจัดการสินค้า (Inventory Management)
-- วันที่: 2025-01-XX
-- คำอธิบาย: สร้างตาราง products, product_lots, product_stock_records

-- 1. ตาราง products (ข้อมูลสินค้า)
-- เก็บข้อมูลสินค้า (1 record ต่อ 1 สินค้า)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code TEXT UNIQUE NOT NULL, -- เช่น XA11SETDR1
  description TEXT, -- ชื่อสินค้า
  um TEXT, -- หน่วย
  cost NUMERIC(12, 2), -- ต้นทุน
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ถ้าตารางมีอยู่แล้วแต่ไม่มี updated_at ให้เพิ่ม
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'products' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.products 
    ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- 2. ตาราง product_lots (Lot ของสินค้า)
-- ทุกครั้งที่พบแถวที่เป็น lot เช่น 030523 → หมายถึงสินค้า 1 ตัว มีหลาย lot
CREATE TABLE IF NOT EXISTS public.product_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, -- เชื่อมสินค้า
  lot_no TEXT NOT NULL, -- เช่น "030523"
  exp DATE, -- วันหมดอายุ (แทน movement_date เดิม)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, lot_no) -- ไม่ให้มี lot_no ซ้ำในสินค้าเดียวกัน
);

-- 3. ตาราง product_stock_records (ยอดคงเหลือ ณ วันที่รายงาน)
-- ใช้เก็บข้อมูลคงคลังแต่ละ lot + วันที่ของรายงาน (แถว A row2)
CREATE TABLE IF NOT EXISTS public.product_stock_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES public.product_lots(id) ON DELETE CASCADE, -- เชื่อม lot
  report_date DATE NOT NULL, -- วันที่ในคอลัม A row2
  qty NUMERIC NOT NULL DEFAULT 0, -- จำนวนคงเหลือที่เจอในไฟล์
  store_location TEXT, -- เช่น D5 ห้องยาอาคาร 5
  um TEXT, -- หน่วย
  cost NUMERIC(12, 2), -- ต้นทุน
  other_data JSONB DEFAULT '{}'::jsonb, -- สำหรับข้อมูลส่วนเกิน
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- สร้าง indexes เพื่อเพิ่มประสิทธิภาพการค้นหา
CREATE INDEX IF NOT EXISTS idx_products_product_code ON public.products(product_code);
CREATE INDEX IF NOT EXISTS idx_product_lots_product_id ON public.product_lots(product_id);
CREATE INDEX IF NOT EXISTS idx_product_lots_lot_no ON public.product_lots(lot_no);
CREATE INDEX IF NOT EXISTS idx_product_stock_records_lot_id ON public.product_stock_records(lot_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_records_report_date ON public.product_stock_records(report_date);

-- สร้าง function สำหรับอัปเดต updated_at อัตโนมัติ
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- สร้าง triggers สำหรับอัปเดต updated_at
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_lots_updated_at
  BEFORE UPDATE ON public.product_lots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_stock_records_updated_at
  BEFORE UPDATE ON public.product_stock_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- เพิ่ม comments สำหรับตาราง
COMMENT ON TABLE public.products IS 'ตารางข้อมูลสินค้า';
COMMENT ON TABLE public.product_lots IS 'ตารางข้อมูล lot ของสินค้า';
COMMENT ON TABLE public.product_stock_records IS 'ตารางบันทึกสต็อกสินค้า';

