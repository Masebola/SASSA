-- =============================================================
-- SASSA Prototype — Database Schema
-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query)
-- after creating your Supabase project. See instructions.md.
-- =============================================================

-- ---------- extensions ----------
create extension if not exists "uuid-ossp";

-- =============================================================
-- 1. PROFILES
--    One row per user, linked 1:1 to Supabase's built-in
--    auth.users table. role distinguishes beneficiary vs admin.
-- =============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  id_number text not null,
  phone text,
  email text,
  address text,
  role text not null default 'beneficiary' check (role in ('beneficiary', 'admin')),
  created_at timestamptz not null default now()
);

-- =============================================================
-- 2. GRANT TYPES + GRANT REQUIREMENTS
--    Eligibility rules are stored as data (not hard-coded) so a
--    rule change never requires an application rebuild.
-- =============================================================
create table grant_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  active boolean not null default true
);

create table grant_requirements (
  id uuid primary key default uuid_generate_v4(),
  grant_id uuid not null references grant_types(id) on delete cascade,
  requirement_type text not null,       -- e.g. 'age_min', 'age_max', 'means_test', 'disability_assessment'
  operator text not null,               -- '>=', '<=', '=', 'manual'
  value text,                           -- e.g. '60' for age_min; null for manual-assessment rules
  severity text not null default 'hard' check (severity in ('hard', 'soft')), -- hard = auto-disqualify, soft = needs assessment
  requires_manual_assessment boolean not null default false
);

-- =============================================================
-- 3. APPLICATIONS
-- =============================================================
create table applications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_type_id uuid not null references grant_types(id),
  reference_number text not null unique,
  status text not null default 'submitted'
    check (status in (
      'draft', 'submitted', 'screening', 'potentially_eligible', 'potentially_ineligible',
      'further_assessment_required', 'documents_required', 'under_review',
      'approved', 'rejected'
    )),
  screening_result text,
  screening_reason text,
  application_date timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  rejection_reason text
);

create index on applications (user_id);
create index on applications (status);

-- =============================================================
-- 4. DOCUMENTS
-- =============================================================
create table documents (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications(id) on delete cascade,
  document_type text not null,
  file_url text,
  uploaded_at timestamptz not null default now(),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'received', 'verified', 'rejected'))
);

-- =============================================================
-- 5. ASSESSMENTS  (e.g. disability / care-dependency assessment)
-- =============================================================
create table assessments (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications(id) on delete cascade,
  assessment_type text not null,
  outcome text,
  notes text,
  assessed_at timestamptz
);

-- =============================================================
-- 6. PAYMENTS  (simulated only — no real banking integration)
-- =============================================================
create table payments (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null references applications(id) on delete cascade,
  beneficiary_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(10,2) not null,
  payment_date timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'processing', 'completed')),
  payment_method text default 'simulated',
  reference_number text not null unique,
  created_at timestamptz not null default now()
);

-- =============================================================
-- 7. NOTIFICATIONS
-- =============================================================
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =============================================================
-- 8. SUPPORT REQUESTS / APPEALS
-- =============================================================
create table support_requests (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references applications(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'enquiry' check (type in ('enquiry', 'problem', 'appeal')),
  reason text not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'responded', 'closed')),
  reference_number text not null unique,
  submitted_at timestamptz not null default now()
);

-- =============================================================
-- 9. AUDIT LOGS
-- =============================================================
create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id),
  action text not null,
  description text,
  timestamp timestamptz not null default now()
);

-- =============================================================
-- ROW LEVEL SECURITY
-- A beneficiary can only see/change their own rows.
-- An admin (profiles.role = 'admin') can see/change all rows.
-- =============================================================

-- Helper: is the current user an admin?
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql stable security definer;

alter table profiles enable row level security;
alter table applications enable row level security;
alter table documents enable row level security;
alter table assessments enable row level security;
alter table payments enable row level security;
alter table notifications enable row level security;
alter table support_requests enable row level security;
alter table audit_logs enable row level security;
alter table grant_types enable row level security;
alter table grant_requirements enable row level security;

-- profiles
create policy "profiles_select_own_or_admin" on profiles for select
  using (id = auth.uid() or is_admin());
create policy "profiles_update_own" on profiles for update
  using (id = auth.uid());
create policy "profiles_insert_own" on profiles for insert
  with check (id = auth.uid());

-- grant_types / grant_requirements — readable by anyone signed in,
-- editable only by admins (kept simple: no insert/update policy for
-- beneficiaries means they cannot write to these tables at all)
create policy "grant_types_read_all" on grant_types for select using (true);
create policy "grant_requirements_read_all" on grant_requirements for select using (true);

-- applications
create policy "applications_select_own_or_admin" on applications for select
  using (user_id = auth.uid() or is_admin());
create policy "applications_insert_own" on applications for insert
  with check (user_id = auth.uid());
create policy "applications_update_own_or_admin" on applications for update
  using (user_id = auth.uid() or is_admin());

-- documents
create policy "documents_select_own_or_admin" on documents for select
  using (exists (select 1 from applications a where a.id = application_id and (a.user_id = auth.uid() or is_admin())));
create policy "documents_insert_own" on documents for insert
  with check (exists (select 1 from applications a where a.id = application_id and a.user_id = auth.uid()));
create policy "documents_update_own_or_admin" on documents for update
  using (exists (select 1 from applications a where a.id = application_id and (a.user_id = auth.uid() or is_admin())));

-- assessments — admin managed, beneficiary can read their own
create policy "assessments_select_own_or_admin" on assessments for select
  using (exists (select 1 from applications a where a.id = application_id and (a.user_id = auth.uid() or is_admin())));
create policy "assessments_write_admin" on assessments for insert
  with check (is_admin());
create policy "assessments_update_admin" on assessments for update
  using (is_admin());

-- payments
create policy "payments_select_own_or_admin" on payments for select
  using (beneficiary_id = auth.uid() or is_admin());
create policy "payments_write_admin" on payments for insert
  with check (is_admin());
create policy "payments_update_admin" on payments for update
  using (is_admin());

-- notifications
create policy "notifications_select_own" on notifications for select
  using (user_id = auth.uid());
create policy "notifications_update_own" on notifications for update
  using (user_id = auth.uid());
create policy "notifications_insert_admin_or_system" on notifications for insert
  with check (true); -- created by admin actions / triggers on behalf of a user

-- support_requests
create policy "support_select_own_or_admin" on support_requests for select
  using (user_id = auth.uid() or is_admin());
create policy "support_insert_own" on support_requests for insert
  with check (user_id = auth.uid());
create policy "support_update_own_or_admin" on support_requests for update
  using (user_id = auth.uid() or is_admin());

-- audit_logs — admin only
create policy "audit_select_admin" on audit_logs for select
  using (is_admin());
create policy "audit_insert_admin" on audit_logs for insert
  with check (is_admin());

-- =============================================================
-- SEED DATA — initial grant types and rules
-- Verify against current official SASSA/DSD sources before
-- using this outside of the academic prototype (see SRS §20).
-- =============================================================
insert into grant_types (name, description) values
  ('Older Person''s Grant', 'For qualifying older persons.'),
  ('Disability Grant', 'For persons with a qualifying disability.'),
  ('Child Support Grant', 'For primary caregivers of a qualifying child.'),
  ('Foster Child Grant', 'For legally recognised foster parents of a child in their care.'),
  ('Care Dependency Grant', 'For primary caregivers of a child with a severe disability requiring full-time care.');

-- Older Person's Grant: hard age rule + soft means-test rule
insert into grant_requirements (grant_id, requirement_type, operator, value, severity, requires_manual_assessment)
select id, 'age_min', '>=', '60', 'hard', false from grant_types where name = 'Older Person''s Grant';
insert into grant_requirements (grant_id, requirement_type, operator, value, severity, requires_manual_assessment)
select id, 'means_test', 'manual', null, 'soft', true from grant_types where name = 'Older Person''s Grant';

-- Disability Grant: soft age band + mandatory manual assessment
insert into grant_requirements (grant_id, requirement_type, operator, value, severity, requires_manual_assessment)
select id, 'age_min', '>=', '18', 'hard', false from grant_types where name = 'Disability Grant';
insert into grant_requirements (grant_id, requirement_type, operator, value, severity, requires_manual_assessment)
select id, 'disability_assessment', 'manual', null, 'soft', true from grant_types where name = 'Disability Grant';

-- Child Support Grant: child age rule (soft, needs caregiver-relationship confirmation)
insert into grant_requirements (grant_id, requirement_type, operator, value, severity, requires_manual_assessment)
select id, 'child_age_max', '<=', '18', 'hard', false from grant_types where name = 'Child Support Grant';
insert into grant_requirements (grant_id, requirement_type, operator, value, severity, requires_manual_assessment)
select id, 'caregiver_relationship', 'manual', null, 'soft', true from grant_types where name = 'Child Support Grant';

-- Foster Child Grant: foster status must be confirmed manually
insert into grant_requirements (grant_id, requirement_type, operator, value, severity, requires_manual_assessment)
select id, 'foster_status', 'manual', null, 'soft', true from grant_types where name = 'Foster Child Grant';

-- Care Dependency Grant: manual assessment only
insert into grant_requirements (grant_id, requirement_type, operator, value, severity, requires_manual_assessment)
select id, 'care_dependency_assessment', 'manual', null, 'soft', true from grant_types where name = 'Care Dependency Grant';
