-- SID // Phase 3A Intelligence Engine Foundation
-- Additive only. Phase 2 archive tables and public boundary remain intact.

create table public.archive_investigation_plans (
  id uuid primary key default gen_random_uuid(),
  archive_file_id uuid not null unique references public.archive_files(id) on delete cascade,
  question_type text not null default 'OPEN RESEARCH',
  proposed_divisions jsonb not null default '[]'::jsonb check (jsonb_typeof(proposed_divisions) = 'array'),
  required_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(required_evidence) = 'array'),
  known_gaps jsonb not null default '[]'::jsonb check (jsonb_typeof(known_gaps) = 'array'),
  research_questions jsonb not null default '[]'::jsonb check (jsonb_typeof(research_questions) = 'array'),
  dependencies jsonb not null default '[]'::jsonb check (jsonb_typeof(dependencies) = 'array'),
  recommended_order jsonb not null default '[]'::jsonb check (jsonb_typeof(recommended_order) = 'array'),
  stop_conditions jsonb not null default '[]'::jsonb check (jsonb_typeof(stop_conditions) = 'array'),
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','COMPLETE','NEEDS REVIEW')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.archive_analyst_assignments (
  id uuid primary key default gen_random_uuid(),
  archive_file_id uuid not null references public.archive_files(id) on delete cascade,
  plan_id uuid not null references public.archive_investigation_plans(id) on delete cascade,
  analyst text not null check (analyst in ('CENTRA','LUX','CIPHER','SCAR','ASH','LUNA','NIX')),
  division text not null check (division in ('FORENSIC ASTROLOGY','ORIGINAL TEXT','NUMERIC INTELLIGENCE','SHADOW BEHAVIOR','SYMBOL ARCHIVE','LUNAR INTELLIGENCE','CROSS-SYSTEM REVIEW')),
  question text not null,
  objective text not null default '',
  required_inputs jsonb not null default '[]'::jsonb check (jsonb_typeof(required_inputs) = 'array'),
  dependencies jsonb not null default '[]'::jsonb check (jsonb_typeof(dependencies) = 'array'),
  status text not null default 'QUEUED' check (status in ('QUEUED','READY','IN PROGRESS','BLOCKED','COMPLETE','REJECTED','NEEDS REVIEW')),
  priority integer not null default 50 check (priority between 0 and 100),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  check (
    (analyst = 'CENTRA' and division = 'FORENSIC ASTROLOGY') or
    (analyst = 'LUX' and division = 'ORIGINAL TEXT') or
    (analyst = 'CIPHER' and division = 'NUMERIC INTELLIGENCE') or
    (analyst = 'SCAR' and division = 'SHADOW BEHAVIOR') or
    (analyst = 'ASH' and division = 'SYMBOL ARCHIVE') or
    (analyst = 'LUNA' and division = 'LUNAR INTELLIGENCE') or
    (analyst = 'NIX' and division = 'CROSS-SYSTEM REVIEW')
  )
);

create table public.archive_analyst_returns (
  id uuid primary key default gen_random_uuid(),
  archive_file_id uuid not null references public.archive_files(id) on delete cascade,
  assignment_id uuid not null references public.archive_analyst_assignments(id) on delete cascade,
  analyst text not null check (analyst in ('CENTRA','LUX','CIPHER','SCAR','ASH','LUNA','NIX')),
  division text not null,
  assignment_question text not null,
  summary text not null,
  calculations jsonb not null default '[]'::jsonb check (jsonb_typeof(calculations) = 'array'),
  interpretations jsonb not null default '[]'::jsonb check (jsonb_typeof(interpretations) = 'array'),
  contradictions jsonb not null default '[]'::jsonb check (jsonb_typeof(contradictions) = 'array'),
  limitations jsonb not null default '[]'::jsonb check (jsonb_typeof(limitations) = 'array'),
  open_questions jsonb not null default '[]'::jsonb check (jsonb_typeof(open_questions) = 'array'),
  confidence text not null default 'UNRESOLVED' check (confidence in ('UNRESOLVED','LOW','MODERATE','HIGH','CONFIRMED')),
  recommended_next_step text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','NEEDS REVIEW','ACCEPTED','REJECTED','REVISION REQUESTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id)
);

create table public.archive_claims (
  id uuid primary key default gen_random_uuid(),
  archive_file_id uuid not null references public.archive_files(id) on delete cascade,
  originating_return_id uuid references public.archive_analyst_returns(id) on delete set null,
  claim_text text not null,
  claim_kind text not null default 'CLAIM' check (claim_kind in ('SOURCE','FACT','CLAIM','INTERPRETATION','INFERENCE','CONTRADICTION','UNRESOLVED QUESTION','REJECTED CONNECTION','FINAL FINDING')),
  significance text not null default 'STANDARD' check (significance in ('STANDARD','MAJOR','CRITICAL')),
  status text not null default 'UNRESOLVED' check (status in ('SUPPORTED ONCE','SUPPORTED MULTIPLE TIMES','CONTRADICTED','UNRESOLVED','REJECTED')),
  sid_verdict text check (sid_verdict is null or sid_verdict in ('CONVERGENCE CONFIRMED','PARTIAL CONVERGENCE','INSUFFICIENT EVIDENCE','CONNECTION REJECTED','CONTRADICTION UNRESOLVED')),
  rule_003_applies boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.archive_claim_support (
  id uuid primary key default gen_random_uuid(),
  archive_file_id uuid not null references public.archive_files(id) on delete cascade,
  claim_id uuid not null references public.archive_claims(id) on delete cascade,
  analyst_return_id uuid references public.archive_analyst_returns(id) on delete set null,
  evidence_id uuid references public.archive_evidence(id) on delete set null,
  source_id uuid references public.archive_sources(id) on delete set null,
  originating_analyst text not null check (originating_analyst in ('CENTRA','LUX','CIPHER','SCAR','ASH','LUNA','NIX','OPERATOR')),
  stance text not null default 'SUPPORTS' check (stance in ('SUPPORTS','CONTRADICTS','NEUTRAL','REJECTS')),
  support_type text not null default 'OTHER',
  independence_status text not null default 'UNKNOWN' check (independence_status in ('INDEPENDENT','DERIVATIVE','SHARED SOURCE','UNKNOWN')),
  verification_status text not null default 'UNVERIFIED' check (verification_status in ('UNVERIFIED','CHECKED','VERIFIED','DISPUTED','REJECTED')),
  lineage_key text,
  derived_from_support_id uuid references public.archive_claim_support(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (num_nonnulls(analyst_return_id, evidence_id, source_id) >= 1),
  check (independence_status <> 'DERIVATIVE' or derived_from_support_id is not null),
  check (independence_status not in ('INDEPENDENT','SHARED SOURCE','DERIVATIVE') or nullif(btrim(lineage_key),'') is not null)
);

create table public.archive_nix_reviews (
  id uuid primary key default gen_random_uuid(),
  archive_file_id uuid not null references public.archive_files(id) on delete cascade,
  status text not null default 'DRAFT' check (status in ('DRAFT','IN REVIEW','COMPLETE','ACCEPTED','REJECTED')),
  verdict text not null default 'INSUFFICIENT EVIDENCE' check (verdict in ('CONVERGENCE CONFIRMED','PARTIAL CONVERGENCE','INSUFFICIENT EVIDENCE','CONNECTION REJECTED','CONTRADICTION UNRESOLVED')),
  systems_reviewed jsonb not null default '[]'::jsonb check (jsonb_typeof(systems_reviewed) = 'array'),
  agreements jsonb not null default '[]'::jsonb check (jsonb_typeof(agreements) = 'array'),
  contradictions jsonb not null default '[]'::jsonb check (jsonb_typeof(contradictions) = 'array'),
  unresolved_links jsonb not null default '[]'::jsonb check (jsonb_typeof(unresolved_links) = 'array'),
  rejected_connections jsonb not null default '[]'::jsonb check (jsonb_typeof(rejected_connections) = 'array'),
  claim_assessments jsonb not null default '[]'::jsonb check (jsonb_typeof(claim_assessments) = 'array'),
  overall_convergence text not null default '',
  suggested_confidence text not null default 'UNRESOLVED' check (suggested_confidence in ('UNRESOLVED','LOW','MODERATE','HIGH','CONFIRMED')),
  confidence_factors jsonb not null default '{}'::jsonb check (jsonb_typeof(confidence_factors) = 'object'),
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.archive_review_queue (
  id uuid primary key default gen_random_uuid(),
  archive_file_id uuid not null references public.archive_files(id) on delete cascade,
  analyst_return_id uuid references public.archive_analyst_returns(id) on delete cascade,
  claim_id uuid references public.archive_claims(id) on delete cascade,
  nix_review_id uuid references public.archive_nix_reviews(id) on delete cascade,
  review_type text not null check (review_type in ('ANALYST RETURN','CLAIM','NIX REVIEW')),
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REJECTED','MORE RESEARCH','RETURNED','UNRESOLVED')),
  operator_action text check (operator_action is null or operator_action in ('ACCEPT FINDING','EDIT FINDING','REJECT FINDING','REQUEST MORE RESEARCH','RETURN TO ANALYST','MARK UNRESOLVED')),
  operator_notes text not null default '',
  reviewed_by uuid,
  reviewed_at timestamptz,
  eligible_for_promotion boolean not null default false,
  promoted_section_id uuid references public.archive_sections(id) on delete set null,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(analyst_return_id, claim_id, nix_review_id) = 1),
  check (
    (review_type = 'ANALYST RETURN' and analyst_return_id is not null) or
    (review_type = 'CLAIM' and claim_id is not null) or
    (review_type = 'NIX REVIEW' and nix_review_id is not null)
  ),
  check (not eligible_for_promotion or status = 'ACCEPTED'),
  check (promoted_section_id is null or (status = 'ACCEPTED' and eligible_for_promotion)),
  check (promoted_section_id is null or promoted_at is not null)
);

-- Composite keys prevent any intelligence record from referencing an object
-- belonging to a different investigation.
alter table public.archive_investigation_plans
  add constraint archive_investigation_plans_id_file_key unique (id, archive_file_id);
alter table public.archive_analyst_assignments
  add constraint archive_analyst_assignments_id_file_key unique (id, archive_file_id),
  drop constraint archive_analyst_assignments_plan_id_fkey,
  add constraint archive_analyst_assignments_plan_file_fkey
    foreign key (plan_id, archive_file_id)
    references public.archive_investigation_plans(id, archive_file_id) on delete cascade;
alter table public.archive_analyst_returns
  add constraint archive_analyst_returns_id_file_key unique (id, archive_file_id),
  drop constraint archive_analyst_returns_assignment_id_fkey,
  add constraint archive_analyst_returns_assignment_file_fkey
    foreign key (assignment_id, archive_file_id)
    references public.archive_analyst_assignments(id, archive_file_id) on delete cascade;
alter table public.archive_claims
  add constraint archive_claims_id_file_key unique (id, archive_file_id),
  drop constraint archive_claims_originating_return_id_fkey,
  add constraint archive_claims_originating_return_file_fkey
    foreign key (originating_return_id, archive_file_id)
    references public.archive_analyst_returns(id, archive_file_id) on delete set null (originating_return_id);
alter table public.archive_evidence
  add constraint archive_evidence_id_file_key unique (id, archive_file_id);
alter table public.archive_sources
  add constraint archive_sources_id_file_key unique (id, archive_file_id);
alter table public.archive_sections
  add constraint archive_sections_id_file_key unique (id, archive_file_id);
alter table public.archive_claim_support
  add constraint archive_claim_support_id_file_key unique (id, archive_file_id),
  drop constraint archive_claim_support_claim_id_fkey,
  drop constraint archive_claim_support_analyst_return_id_fkey,
  drop constraint archive_claim_support_evidence_id_fkey,
  drop constraint archive_claim_support_source_id_fkey,
  add constraint archive_claim_support_claim_file_fkey
    foreign key (claim_id, archive_file_id)
    references public.archive_claims(id, archive_file_id) on delete cascade,
  add constraint archive_claim_support_return_file_fkey
    foreign key (analyst_return_id, archive_file_id)
    references public.archive_analyst_returns(id, archive_file_id) on delete set null (analyst_return_id),
  add constraint archive_claim_support_evidence_file_fkey
    foreign key (evidence_id, archive_file_id)
    references public.archive_evidence(id, archive_file_id) on delete set null (evidence_id),
  add constraint archive_claim_support_source_file_fkey
    foreign key (source_id, archive_file_id)
    references public.archive_sources(id, archive_file_id) on delete set null (source_id);
alter table public.archive_nix_reviews
  add constraint archive_nix_reviews_id_file_key unique (id, archive_file_id);
alter table public.archive_review_queue
  drop constraint archive_review_queue_analyst_return_id_fkey,
  drop constraint archive_review_queue_claim_id_fkey,
  drop constraint archive_review_queue_nix_review_id_fkey,
  drop constraint archive_review_queue_promoted_section_id_fkey,
  add constraint archive_review_queue_return_file_fkey
    foreign key (analyst_return_id, archive_file_id)
    references public.archive_analyst_returns(id, archive_file_id) on delete cascade,
  add constraint archive_review_queue_claim_file_fkey
    foreign key (claim_id, archive_file_id)
    references public.archive_claims(id, archive_file_id) on delete cascade,
  add constraint archive_review_queue_nix_file_fkey
    foreign key (nix_review_id, archive_file_id)
    references public.archive_nix_reviews(id, archive_file_id) on delete cascade,
  add constraint archive_review_queue_section_file_fkey
    foreign key (promoted_section_id, archive_file_id)
    references public.archive_sections(id, archive_file_id) on delete set null (promoted_section_id);

alter table public.archive_timeline
  add column metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  add column actor_id uuid;

create index archive_investigation_plans_status_idx on public.archive_investigation_plans(status);
create index archive_analyst_assignments_file_status_idx on public.archive_analyst_assignments(archive_file_id,status);
create index archive_analyst_assignments_plan_idx on public.archive_analyst_assignments(plan_id);
create index archive_analyst_assignments_plan_file_idx on public.archive_analyst_assignments(plan_id,archive_file_id);
create index archive_analyst_returns_file_status_idx on public.archive_analyst_returns(archive_file_id,status);
create index archive_analyst_returns_assignment_file_idx on public.archive_analyst_returns(assignment_id,archive_file_id);
create index archive_claims_file_status_idx on public.archive_claims(archive_file_id,status);
create index archive_claims_origin_idx on public.archive_claims(originating_return_id);
create index archive_claims_origin_file_idx on public.archive_claims(originating_return_id,archive_file_id);
create index archive_claim_support_claim_idx on public.archive_claim_support(claim_id);
create index archive_claim_support_claim_file_idx on public.archive_claim_support(claim_id,archive_file_id);
create index archive_claim_support_file_idx on public.archive_claim_support(archive_file_id);
create index archive_claim_support_lineage_idx on public.archive_claim_support(claim_id,lineage_key);
create index archive_claim_support_return_idx on public.archive_claim_support(analyst_return_id);
create index archive_claim_support_return_file_idx on public.archive_claim_support(analyst_return_id,archive_file_id);
create index archive_claim_support_evidence_idx on public.archive_claim_support(evidence_id);
create index archive_claim_support_evidence_file_idx on public.archive_claim_support(evidence_id,archive_file_id);
create index archive_claim_support_source_idx on public.archive_claim_support(source_id);
create index archive_claim_support_source_file_idx on public.archive_claim_support(source_id,archive_file_id);
create index archive_claim_support_derived_idx on public.archive_claim_support(derived_from_support_id);
create index archive_nix_reviews_file_status_idx on public.archive_nix_reviews(archive_file_id,status);
create index archive_review_queue_file_status_idx on public.archive_review_queue(archive_file_id,status);
create index archive_review_queue_return_idx on public.archive_review_queue(analyst_return_id);
create index archive_review_queue_return_file_idx on public.archive_review_queue(analyst_return_id,archive_file_id);
create index archive_review_queue_claim_idx on public.archive_review_queue(claim_id);
create index archive_review_queue_claim_file_idx on public.archive_review_queue(claim_id,archive_file_id);
create index archive_review_queue_nix_idx on public.archive_review_queue(nix_review_id);
create index archive_review_queue_nix_file_idx on public.archive_review_queue(nix_review_id,archive_file_id);
create index archive_review_queue_section_file_idx on public.archive_review_queue(promoted_section_id,archive_file_id);
create index archive_timeline_intelligence_event_idx on public.archive_timeline(archive_file_id,event_type,created_at desc);

create trigger archive_investigation_plans_set_updated_at
before update on public.archive_investigation_plans
for each row execute function public.set_updated_at();

create trigger archive_analyst_returns_set_updated_at
before update on public.archive_analyst_returns
for each row execute function public.set_updated_at();

create trigger archive_claims_set_updated_at
before update on public.archive_claims
for each row execute function public.set_updated_at();

alter table public.archive_investigation_plans enable row level security;
alter table public.archive_analyst_assignments enable row level security;
alter table public.archive_analyst_returns enable row level security;
alter table public.archive_claims enable row level security;
alter table public.archive_claim_support enable row level security;
alter table public.archive_nix_reviews enable row level security;
alter table public.archive_review_queue enable row level security;

revoke all on table public.archive_investigation_plans from public, anon;
revoke all on table public.archive_analyst_assignments from public, anon;
revoke all on table public.archive_analyst_returns from public, anon;
revoke all on table public.archive_claims from public, anon;
revoke all on table public.archive_claim_support from public, anon;
revoke all on table public.archive_nix_reviews from public, anon;
revoke all on table public.archive_review_queue from public, anon;

grant select, insert, update, delete on table public.archive_investigation_plans to authenticated;
grant select, insert, update, delete on table public.archive_analyst_assignments to authenticated;
grant select, insert, update, delete on table public.archive_analyst_returns to authenticated;
grant select, insert, update, delete on table public.archive_claims to authenticated;
grant select, insert, update, delete on table public.archive_claim_support to authenticated;
grant select, insert, update, delete on table public.archive_nix_reviews to authenticated;
grant select, insert, update, delete on table public.archive_review_queue to authenticated;

grant all on table public.archive_investigation_plans to service_role;
grant all on table public.archive_analyst_assignments to service_role;
grant all on table public.archive_analyst_returns to service_role;
grant all on table public.archive_claims to service_role;
grant all on table public.archive_claim_support to service_role;
grant all on table public.archive_nix_reviews to service_role;
grant all on table public.archive_review_queue to service_role;

create policy archive_admin_manage_investigation_plans
on public.archive_investigation_plans for all to authenticated
using ((select public.is_archive_admin((select auth.uid()))))
with check ((select public.is_archive_admin((select auth.uid()))));

create policy archive_admin_manage_analyst_assignments
on public.archive_analyst_assignments for all to authenticated
using ((select public.is_archive_admin((select auth.uid()))))
with check ((select public.is_archive_admin((select auth.uid()))));

create policy archive_admin_manage_analyst_returns
on public.archive_analyst_returns for all to authenticated
using ((select public.is_archive_admin((select auth.uid()))))
with check ((select public.is_archive_admin((select auth.uid()))));

create policy archive_admin_manage_claims
on public.archive_claims for all to authenticated
using ((select public.is_archive_admin((select auth.uid()))))
with check ((select public.is_archive_admin((select auth.uid()))));

create policy archive_admin_manage_claim_support
on public.archive_claim_support for all to authenticated
using ((select public.is_archive_admin((select auth.uid()))))
with check ((select public.is_archive_admin((select auth.uid()))));

create policy archive_admin_manage_nix_reviews
on public.archive_nix_reviews for all to authenticated
using ((select public.is_archive_admin((select auth.uid()))))
with check ((select public.is_archive_admin((select auth.uid()))));

create policy archive_admin_manage_review_queue
on public.archive_review_queue for all to authenticated
using ((select public.is_archive_admin((select auth.uid()))))
with check ((select public.is_archive_admin((select auth.uid()))));

comment on table public.archive_claim_support is
  'Authoritative provenance ledger. Rule 003 counts are derived from qualifying support rows grouped by lineage_key.';
comment on column public.archive_claim_support.lineage_key is
  'Stable identifier for a shared underlying evidentiary lineage. Same lineage never counts twice for Rule 003.';
comment on column public.archive_review_queue.eligible_for_promotion is
  'Set separately after acceptance. Acceptance alone never creates archive publication material.';
