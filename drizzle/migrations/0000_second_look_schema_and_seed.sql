CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL,
  email text NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO anon;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read_all" ON public.staff FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "staff_write_all" ON public.staff FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  company_number text,
  vat_number text,
  email_domain text,
  phone_on_file text,
  bank_name text,
  account_name text,
  sort_code text,
  account_number text,
  usual_terms_days integer,
  internal_owner_staff_id uuid REFERENCES public.staff(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('verified','pending')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO anon;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_read_all" ON public.suppliers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "suppliers_write_all" ON public.suppliers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id),
  pdf_path text,
  invoice_number text,
  invoice_date date,
  total numeric(12,2),
  extracted_json jsonb,
  verdict text CHECK (verdict IN ('GREEN','AMBER','RED')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('paid','held','pending','approved')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO anon;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_read_all" ON public.invoices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "invoices_write_all" ON public.invoices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoices(id),
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  event text NOT NULL,
  details_json jsonb
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO anon;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_read_all" ON public.audit_log FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "audit_insert_all" ON public.audit_log FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Seed staff
INSERT INTO public.staff (id, name, role, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Priya Shah', 'Head of Ops', 'priya.shah@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'Tom Reed', 'Production Manager', 'tom.reed@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'Spencer Clark', 'Director', 'spencer.clark@example.com');

-- Seed suppliers
INSERT INTO public.suppliers (id, legal_name, aliases, company_number, vat_number, email_domain, phone_on_file, bank_name, account_name, sort_code, account_number, usual_terms_days, internal_owner_staff_id, status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Hartwell Print & Packaging Ltd', ARRAY['Hartwell Print', 'Hartwell Packaging'], '08841276', 'GB 284 6619 37', 'hartwellprint.co.uk', '0161 496 0732', 'Barclays Bank UK PLC', 'Hartwell Print & Packaging Ltd', '20-71-64', '43819027', 30, '22222222-2222-2222-2222-222222222222', 'verified'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Andean Roast Coffee Importers Ltd', ARRAY['Andean Roast', 'Andean Coffee'], '09182736', 'GB 317 4428 90', 'andeanroast.co.uk', '020 7946 0812', 'HSBC UK Bank PLC', 'Andean Roast Coffee Importers Ltd', '40-05-22', '71583842', 14, '11111111-1111-1111-1111-111111111111', 'verified'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Swiftline Courier Services Ltd', ARRAY['Swiftline', 'Swiftline Couriers'], '07564321', 'GB 209 8834 55', 'swiftlinecouriers.co.uk', '0161 832 4477', 'NatWest Group PLC', 'Swiftline Courier Services Ltd', '60-12-08', '22991475', 7, '11111111-1111-1111-1111-111111111111', 'verified');