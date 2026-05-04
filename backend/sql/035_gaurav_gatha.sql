-- Migration 035: Gaurav Gatha — community achievement wall
-- Run in Supabase Dashboard → SQL Editor

create table if not exists public.gaurav_gatha (
  id            uuid primary key default gen_random_uuid(),
  vansha_id     uuid,                          -- optional: link to a specific vansha
  submitted_by  uuid,                          -- auth.uid() of submitter
  kind          text not null default 'Achievement',
  title         text not null,
  who           text not null,                 -- display name / attribution
  img           text not null default '🏆',
  tone          text not null default 'var(--ds-saffron)',
  approved      boolean not null default true, -- auto-approved; set false to require moderation
  created_at    timestamptz not null default now()
);

alter table public.gaurav_gatha enable row level security;

-- Public read: only approved entries
create policy "gaurav_gatha_public_read"
  on public.gaurav_gatha for select
  using (approved = true);

-- Authenticated insert
create policy "gaurav_gatha_auth_insert"
  on public.gaurav_gatha for insert
  to authenticated
  with check (true);

create index if not exists gaurav_gatha_created_idx on public.gaurav_gatha (created_at desc);
create index if not exists gaurav_gatha_vansha_idx  on public.gaurav_gatha (vansha_id, created_at desc);
