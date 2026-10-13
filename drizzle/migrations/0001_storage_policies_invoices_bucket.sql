CREATE POLICY "invoices_bucket_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'invoices');
CREATE POLICY "invoices_bucket_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'invoices');
CREATE POLICY "invoices_bucket_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'invoices');