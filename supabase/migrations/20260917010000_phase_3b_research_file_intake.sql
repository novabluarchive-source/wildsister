-- SID // Phase 3B research file intake
-- Additive only. Private operator-managed intake; approved projections remain
-- archive_sources/archive_evidence so existing analyst context stays stable.

create table public.archive_research_assets (
  id uuid primary key default gen_random_uuid(),
  archive_file_id uuid not null references public.archive_files(id) on delete cascade,
  assignment_id uuid,
  source_id uuid,
  evidence_id uuid,
  intake_type text not null check (intake_type in ('UPLOAD','URL','TEXT','BIBLE LOOKUP')),
  title text not null,
  original_filename text,
  mime_type text not null default 'text/plain',
  storage_bucket text not null default 'sid-research' check (storage_bucket = 'sid-research'),
  storage_path text not null,
  source_url text,
  citation_text text not null default '',
  extracted_text text not null default '',
  content_sha256 text not null,
  byte_size bigint not null default 0 check (byte_size between 0 and 5242880),
  lineage_key text not null check (nullif(btrim(lineage_key),'') is not null),
  intake_status text not null default 'READY FOR REVIEW'
    check (intake_status in ('PENDING EXTRACTION','READY FOR REVIEW','APPROVED','REJECTED','EXTRACTION FAILED')),
  extraction_status text not null default 'COMPLETE'
    check (extraction_status in ('PENDING','COMPLETE','FAILED','NOT REQUIRED')),
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in ('UNVERIFIED','CHECKED','VERIFIED','DISPUTED','REJECTED')),
  operator_notes text not null default '',
  imported_by uuid not null default auth.uid(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (archive_file_id, content_sha256),
  unique (id, archive_file_id),
  constraint archive_research_assets_assignment_file_fkey
    foreign key (assignment_id, archive_file_id)
    references public.archive_analyst_assignments(id, archive_file_id) on delete set null (assignment_id),
  constraint archive_research_assets_source_file_fkey
    foreign key (source_id, archive_file_id)
    references public.archive_sources(id, archive_file_id) on delete set null (source_id),
  constraint archive_research_assets_evidence_file_fkey
    foreign key (evidence_id, archive_file_id)
    references public.archive_evidence(id, archive_file_id) on delete set null (evidence_id),
  check (intake_status <> 'APPROVED' or (source_id is not null and evidence_id is not null and reviewed_at is not null)),
  check (intake_status <> 'REJECTED' or reviewed_at is not null)
);

create index archive_research_assets_file_status_idx
  on public.archive_research_assets(archive_file_id, intake_status, created_at desc);
create index archive_research_assets_assignment_idx
  on public.archive_research_assets(assignment_id) where assignment_id is not null;
create index archive_research_assets_assignment_file_idx
  on public.archive_research_assets(assignment_id, archive_file_id) where assignment_id is not null;
create index archive_research_assets_source_file_idx
  on public.archive_research_assets(source_id, archive_file_id) where source_id is not null;
create index archive_research_assets_evidence_file_idx
  on public.archive_research_assets(evidence_id, archive_file_id) where evidence_id is not null;
create index archive_research_assets_lineage_idx
  on public.archive_research_assets(archive_file_id, lineage_key);

create trigger archive_research_assets_set_updated_at
before update on public.archive_research_assets
for each row execute function public.set_updated_at();

alter table public.archive_research_assets enable row level security;
revoke all on table public.archive_research_assets from public, anon;
grant select, insert, update, delete on table public.archive_research_assets to authenticated;
grant all on table public.archive_research_assets to service_role;

create policy archive_admin_manage_research_assets
on public.archive_research_assets for all to authenticated
using ((select public.is_archive_admin((select auth.uid()))))
with check ((select public.is_archive_admin((select auth.uid()))));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sid-research',
  'sid-research',
  false,
  5242880,
  array['text/plain','text/markdown','text/csv','application/json','text/html','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy archive_admin_read_research_objects
on storage.objects for select to authenticated
using (bucket_id = 'sid-research' and (select public.is_archive_admin((select auth.uid()))));

create policy archive_admin_insert_research_objects
on storage.objects for insert to authenticated
with check (bucket_id = 'sid-research' and (select public.is_archive_admin((select auth.uid()))));

create policy archive_admin_update_research_objects
on storage.objects for update to authenticated
using (bucket_id = 'sid-research' and (select public.is_archive_admin((select auth.uid()))))
with check (bucket_id = 'sid-research' and (select public.is_archive_admin((select auth.uid()))));

create policy archive_admin_delete_research_objects
on storage.objects for delete to authenticated
using (bucket_id = 'sid-research' and (select public.is_archive_admin((select auth.uid()))));

create or replace function public.approve_archive_research_asset(
  p_asset_id uuid,
  p_source_type text default 'primary',
  p_evidence_type text default 'primary_source',
  p_verification_status text default 'verified',
  p_operator_notes text default ''
)
returns public.archive_research_assets
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_asset public.archive_research_assets;
  v_source_id uuid;
  v_evidence_id uuid;
  v_status text := lower(coalesce(nullif(btrim(p_verification_status),''),'verified'));
begin
  if not public.is_archive_admin(auth.uid()) then
    raise exception 'ARCHIVE ADMIN REQUIRED' using errcode = '42501';
  end if;

  select * into v_asset
  from public.archive_research_assets
  where id = p_asset_id
  for update;

  if not found then raise exception 'RESEARCH ASSET NOT FOUND' using errcode = 'P0002'; end if;
  if v_asset.intake_status = 'REJECTED' then raise exception 'REJECTED ASSET CANNOT BE APPROVED'; end if;
  if v_asset.extraction_status <> 'COMPLETE' or nullif(btrim(v_asset.extracted_text),'') is null then
    raise exception 'TEXT EXTRACTION MUST COMPLETE BEFORE APPROVAL';
  end if;
  if v_status not in ('unverified','checked','verified','disputed','rejected') then
    raise exception 'INVALID VERIFICATION STATUS';
  end if;

  if v_asset.source_id is null then
    insert into public.archive_sources (
      archive_file_id, source_type, title, url, citation_text, notes, verification_status
    ) values (
      v_asset.archive_file_id, lower(coalesce(nullif(btrim(p_source_type),''),'primary')),
      v_asset.title, v_asset.source_url, v_asset.citation_text,
      concat('RESEARCH ASSET ',v_asset.id,' // LINEAGE ',v_asset.lineage_key,
             case when nullif(btrim(p_operator_notes),'') is null then '' else ' // ' || btrim(p_operator_notes) end),
      v_status
    ) returning id into v_source_id;
  else
    v_source_id := v_asset.source_id;
  end if;

  if v_asset.evidence_id is null then
    insert into public.archive_evidence (
      archive_file_id, evidence_type, title, excerpt, finding, source_label, source_url, classification, reliability
    ) values (
      v_asset.archive_file_id, lower(coalesce(nullif(btrim(p_evidence_type),''),'primary_source')),
      v_asset.title, left(v_asset.extracted_text, 4000), '', v_asset.title, v_asset.source_url,
      v_status, case when v_status = 'verified' then 'high' else 'moderate' end
    ) returning id into v_evidence_id;
  else
    v_evidence_id := v_asset.evidence_id;
  end if;

  update public.archive_research_assets set
    source_id = v_source_id,
    evidence_id = v_evidence_id,
    intake_status = 'APPROVED',
    verification_status = upper(v_status),
    operator_notes = coalesce(p_operator_notes,''),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_asset_id
  returning * into v_asset;

  insert into public.archive_timeline (archive_file_id,event_type,detail,metadata,actor_id)
  values (v_asset.archive_file_id,'research_asset_approved',v_asset.title,
    jsonb_build_object('research_asset_id',v_asset.id,'source_id',v_source_id,'evidence_id',v_evidence_id,'lineage_key',v_asset.lineage_key),auth.uid());

  return v_asset;
end;
$function$;

revoke all on function public.approve_archive_research_asset(uuid,text,text,text,text) from public, anon;
grant execute on function public.approve_archive_research_asset(uuid,text,text,text,text) to authenticated;

comment on table public.archive_research_assets is
  'Private SID research intake ledger. Only APPROVED rows project into archive_sources/archive_evidence.';
comment on column public.archive_research_assets.lineage_key is
  'Stable provenance grouping used to prevent shared source material from counting as independent support.';
