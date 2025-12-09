-- Migration: เพิ่มฟิลด์ um และ cost ในตาราง product_stock_records
-- วันที่: 2025-01-XX
-- คำอธิบาย: เพิ่มฟิลด์ um (text) และ cost (numeric(12,2)) ในตาราง product_stock_records

-- เพิ่มคอลัมน์ um
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'product_stock_records' 
    AND column_name = 'um'
  ) THEN
    ALTER TABLE public.product_stock_records 
    ADD COLUMN um TEXT;
  END IF;
END $$;

-- เพิ่มคอลัมน์ cost
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'product_stock_records' 
    AND column_name = 'cost'
  ) THEN
    ALTER TABLE public.product_stock_records 
    ADD COLUMN cost NUMERIC(12, 2);
  END IF;
END $$;

-- อัปเดต comments
COMMENT ON COLUMN public.product_stock_records.um IS 'หน่วย';
COMMENT ON COLUMN public.product_stock_records.cost IS 'ต้นทุน';

