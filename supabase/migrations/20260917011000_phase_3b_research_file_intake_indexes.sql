-- Cover composite foreign keys added by the live research-intake migration.
create index if not exists archive_research_assets_assignment_file_idx
  on public.archive_research_assets(assignment_id, archive_file_id) where assignment_id is not null;
create index if not exists archive_research_assets_source_file_idx
  on public.archive_research_assets(source_id, archive_file_id) where source_id is not null;
create index if not exists archive_research_assets_evidence_file_idx
  on public.archive_research_assets(evidence_id, archive_file_id) where evidence_id is not null;
