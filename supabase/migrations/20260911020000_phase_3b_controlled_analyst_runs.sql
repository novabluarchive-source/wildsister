-- SID // Phase 3B controlled analyst execution
-- Additive only. One run represents one bounded analyst execution.

create table public.archive_analyst_runs (
  id uuid primary key default gen_random_uuid(),
  archive_file_id uuid not null,
  assignment_id uuid not null,
  analyst text not null check (analyst in ('CENTRA','LUX','CIPHER','SCAR','ASH','LUNA','NIX')),
  division text not null,
  requested_by uuid not null default auth.uid(),
  status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','COMPLETE','FAILED','INVALID OUTPUT','CANCELLED')),
  provider text not null,
  model text not null,
  prompt_version text not null,
  schema_version text not null,
  idempotency_key text not null,
  retry_count integer not null default 0 check (retry_count between 0 and 1),
  input_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(input_snapshot) = 'object'),
  proposed_claims jsonb not null default '[]'::jsonb check (jsonb_typeof(proposed_claims) = 'array'),
  proposed_support jsonb not null default '[]'::jsonb check (jsonb_typeof(proposed_support) = 'array'),
  proposed_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(proposed_evidence) = 'array'),
  proposed_sources jsonb not null default '[]'::jsonb check (jsonb_typeof(proposed_sources) = 'array'),
  output_validation_status text not null default 'PENDING' check (output_validation_status in ('PENDING','VALID','INVALID')),
  validation_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_errors) = 'array'),
  analyst_return_id uuid,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint archive_analyst_runs_assignment_file_fkey
    foreign key (assignment_id, archive_file_id)
    references public.archive_analyst_assignments(id, archive_file_id) on delete cascade,
  constraint archive_analyst_runs_return_file_fkey
    foreign key (analyst_return_id, archive_file_id)
    references public.archive_analyst_returns(id, archive_file_id) on delete set null (analyst_return_id),
  unique (assignment_id, idempotency_key),
  check (analyst_return_id is null or (status = 'COMPLETE' and output_validation_status = 'VALID'))
);

create unique index archive_analyst_runs_one_active_assignment_idx
  on public.archive_analyst_runs(assignment_id)
  where status in ('QUEUED','RUNNING');
create index archive_analyst_runs_file_created_idx on public.archive_analyst_runs(archive_file_id,created_at desc);
create index archive_analyst_runs_assignment_file_idx on public.archive_analyst_runs(assignment_id,archive_file_id);
create index archive_analyst_runs_return_file_idx on public.archive_analyst_runs(analyst_return_id,archive_file_id);

alter table public.archive_analyst_runs enable row level security;
revoke all on table public.archive_analyst_runs from public, anon;
grant select, insert, update, delete on table public.archive_analyst_runs to authenticated;
grant all on table public.archive_analyst_runs to service_role;

create policy archive_admin_manage_analyst_runs
on public.archive_analyst_runs for all to authenticated
using ((select public.is_archive_admin((select auth.uid()))))
with check ((select public.is_archive_admin((select auth.uid()))));

