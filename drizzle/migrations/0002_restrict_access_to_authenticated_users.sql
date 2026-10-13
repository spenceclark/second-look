-- Now that the app requires sign-in, drop the anonymous policies and restrict to authenticated users.
DROP POLICY staff_read_all ON public.staff;
DROP POLICY staff_write_all ON public.staff;
CREATE POLICY staff_read_auth ON public.staff FOR SELECT TO authenticated USING (true);
CREATE POLICY staff_write_auth ON public.staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY suppliers_read_all ON public.suppliers;
DROP POLICY suppliers_write_all ON public.suppliers;
CREATE POLICY suppliers_read_auth ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY suppliers_write_auth ON public.suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY invoices_read_all ON public.invoices;
DROP POLICY invoices_write_all ON public.invoices;
CREATE POLICY invoices_read_auth ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY invoices_write_auth ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY audit_insert_all ON public.audit_log;
DROP POLICY audit_read_all ON public.audit_log;
CREATE POLICY audit_read_auth ON public.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY audit_insert_auth ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- Storage: invoice PDFs only for signed-in users.
DROP POLICY invoices_bucket_read ON storage.objects;
DROP POLICY invoices_bucket_insert ON storage.objects;
DROP POLICY invoices_bucket_delete ON storage.objects;
CREATE POLICY invoices_bucket_read_auth ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'invoices');
CREATE POLICY invoices_bucket_insert_auth ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invoices');
CREATE POLICY invoices_bucket_delete_auth ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'invoices');