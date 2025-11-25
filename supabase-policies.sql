-- Supabase Row Level Security (RLS) Policies
-- สำหรับตาราง daily_sale_items และ daily_sale_reports

-- ============================================
-- SELECT Policies (ให้ SELECT ได้ทุกข้อมูล)
-- ============================================

CREATE POLICY allow_all_select_daily_sale_items
ON daily_sale_items
FOR SELECT
USING (true);

CREATE POLICY allow_all_select_daily_sale_reports
ON daily_sale_reports
FOR SELECT
USING (true);

-- ============================================
-- INSERT Policies (ให้ INSERT ได้)
-- ============================================

CREATE POLICY allow_all_insert_daily_sale_items
ON daily_sale_items
FOR INSERT
WITH CHECK (true);

CREATE POLICY allow_all_insert_daily_sale_reports
ON daily_sale_reports
FOR INSERT
WITH CHECK (true);

-- ============================================
-- UPDATE Policies (ให้ UPDATE ได้)
-- ============================================

CREATE POLICY allow_all_update_daily_sale_items
ON daily_sale_items
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY allow_all_update_daily_sale_reports
ON daily_sale_reports
FOR UPDATE
USING (true)
WITH CHECK (true);

-- ============================================
-- DELETE Policies (ถ้าต้องการให้ DELETE ได้)
-- ============================================

-- CREATE POLICY allow_all_delete_daily_sale_items
-- ON daily_sale_items
-- FOR DELETE
-- USING (true);

-- CREATE POLICY allow_all_delete_daily_sale_reports
-- ON daily_sale_reports
-- FOR DELETE
-- USING (true);

