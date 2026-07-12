create extension if not exists pgcrypto;

create table if not exists public.archive_files (
  id uuid primary key default gen_random_uuid(),
  file_code text not null unique,
  division_code text not null check (division_code in ('PSY','AST','OTF','NUM','PAT','SYM')),
  division_name text not null,
  title text not null,
  slug text,
  purpose text not null,
  investigation_question text not null,
  current_scope text not null,
  lead_analyst text not null,
  supporting_divisions jsonb not null default '[]'::jsonb,
  case_status text not null default 'UNDER REVIEW',
  classification text not null default 'PUBLIC',
  clearance text not null default 'PUBLIC ARCHIVE',
  evidence_items jsonb not null default '[]'::jsonb,
  historical_context text,
  analyst_notes text,
  active_debate text,
  integration text not null,
  unresolved_questions text not null,
  next_evidence_required jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  related_files jsonb not null default '[]'::jsonb,
  revision_history jsonb not null default '[]'::jsonb,
  confidence_summary jsonb not null default '{}'::jsonb,
  publication_status text not null default 'draft' check (publication_status in ('draft','under_review','approved','publishing','revision_required','published','archived')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  scribe_stage text,
  scribe_last_run_at timestamptz,
  publication_error text,
  github_branch text,
  github_path text,
  github_pr_number bigint,
  github_pr_url text,
  github_commit_sha text,
  published_url text,
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.institution_activity (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  actor_role text not null,
  action text not null,
  file_code text,
  archive_file_id uuid references public.archive_files(id) on delete set null,
  stage text,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists archive_files_publication_status_idx on public.archive_files(publication_status);
create index if not exists archive_files_division_code_idx on public.archive_files(division_code);
create index if not exists institution_activity_created_at_idx on public.institution_activity(created_at desc);

alter table public.archive_files enable row level security;
alter table public.institution_activity enable row level security;

drop policy if exists "Public can read published archive files" on public.archive_files;
create policy "Public can read published archive files" on public.archive_files for select using (publication_status = 'published' and classification = 'PUBLIC');

drop policy if exists "Authenticated can read institution activity" on public.institution_activity;
create policy "Authenticated can read institution activity" on public.institution_activity for select to authenticated using (true);

create or replace function public.log_archive_publication_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.institution_activity(actor, actor_role, action, file_code, archive_file_id, stage, detail)
    values (new.lead_analyst, 'Lead Analyst', 'opened archive file', new.file_code, new.id, new.publication_status, new.title);
  elsif new.publication_status is distinct from old.publication_status or new.scribe_stage is distinct from old.scribe_stage then
    insert into public.institution_activity(actor, actor_role, action, file_code, archive_file_id, stage, detail)
    values (
      case when new.scribe_stage is not null then 'SCRIBE' else coalesce(new.lead_analyst, 'SID') end,
      case when new.scribe_stage is not null then 'Institutional Publishing' else 'Lead Analyst' end,
      case
        when new.scribe_stage = 'validation_failed' then 'returned file for revision'
        when new.scribe_stage = 'generating_file' then 'generated publication package'
        when new.scribe_stage = 'awaiting_founder_review' then 'opened GitHub pull request'
        when new.publication_status = 'approved' then 'approved file for publication'
        when new.publication_status = 'published' then 'filed public archive record'
        else 'updated publication status'
      end,
      new.file_code,
      new.id,
      coalesce(new.scribe_stage, new.publication_status),
      coalesce(new.github_pr_url, new.publication_error, new.title)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists archive_publication_activity_trigger on public.archive_files;
create trigger archive_publication_activity_trigger
after insert or update of publication_status, scribe_stage on public.archive_files
for each row execute function public.log_archive_publication_activity();

insert into public.archive_files (
  file_code, division_code, division_name, title, slug, purpose, investigation_question,
  current_scope, lead_analyst, supporting_divisions, case_status, evidence_items,
  analyst_notes, integration, unresolved_questions, next_evidence_required, sources,
  related_files, revision_history, publication_status
)
values (
  'PAT-TEST-001','PAT','Pattern Investigation Division','SCRIBE Pipeline Test','scribe-pipeline-test',
  'This test verifies that approved SID research can be validated, formatted, indexed, and prepared for founder review.',
  'Can the institutional publishing pipeline create a complete publication package without changing the underlying findings?',
  'Testing publishing operations only. This is not a substantive public finding.',
  'LUNA','["SCRIBE"]'::jsonb,'UNDER REVIEW',
  '[{"type":"SYSTEM RECORD","title":"Approved source record exists","body":"The test file is stored in Supabase with the required publication fields.","confidence":"confirmed","basis":"direct database observation"},{"type":"SYSTEM RECORD","title":"GitHub review remains human-controlled","body":"SCRIBE creates a pull request but is not authorized to merge it.","confidence":"confirmed","basis":"direct workflow configuration"}]'::jsonb,
  'LUNA: The pipeline is the pattern under review. SCRIBE must preserve content while standardizing form.',
  'The MVP supports validation, HTML generation, archive indexing, and pull-request preparation.',
  'Automatic merge and production publishing remain intentionally unresolved.',
  '["Test the generated pull request","Merge manually after review","Mark the file published after deployment"]'::jsonb,
  '["Supabase archive_files test record","GitHub publishing workflow configuration"]'::jsonb,
  '[]'::jsonb,
  '[{"version":"v0.1","date":"2026-07-12","note":"Initial SCRIBE pipeline test"}]'::jsonb,
  'draft'
)
on conflict (file_code) do nothing;
