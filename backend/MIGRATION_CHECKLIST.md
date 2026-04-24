# Database Migration Checklist

Run all migrations **in order** against your Supabase project.
Open: Supabase Dashboard → SQL Editor → paste and run each file.

| # | File | Tables Created | Notes |
|---|------|----------------|-------|
| 001 | `001_*.sql` | persons, unions | Core tree tables |
| 002 | `002_*.sql` | users, RLS policies | Auth + security |
| 003 | `003_*.sql` | matrimony_profiles | Matrimony |
| 004 | `004_*.sql` | verification_requests | Pandit KYC |
| 005 | `005_*.sql` | notifications | Push alerts |
| 006 | `006_se_applications.sql` | se_applications | Sales Executive enrollment |
| 007 | `007_kutumb_calendar.sql` | calendar_events | Kutumb Calendar |
| 008 | `008_legacy_box.sql` | legacy_messages | Legacy Box |
| 009 | `009_radar.sql` | member_locations | Kutumb Radar |
| 010 | `010_time_bank.sql` | ~~time_bank_offers~~, ~~time_bank_transactions~~ | **DEPRECATED** — tables are dropped by 011 |
| 011 | `011_samay_bank.sql` | samay_branches, samay_branch_members, samay_requests, samay_transactions, samay_ratings, samay_profiles | **Samay Bank v2** — replaces 010 |

## ⚠️ Important: Migration 010 vs 011

Migration **011 drops** the v1 `time_bank_offers` and `time_bank_transactions` tables
from migration 010 before creating the new `samay_*` tables.

- **If 010 was never run:** Run 011 directly — it handles the DROP IF EXISTS safely.
- **If 010 was already run on production:** Run 011 — it will clean up and upgrade.
- **Do NOT skip 011** — all Samay Bank endpoints will fail without it.

## Supabase Storage Buckets

Create these buckets manually in Supabase Dashboard → Storage:

| Bucket | Public | Used By |
|--------|--------|---------|
| `legacy-voices` | Yes | Legacy Box voice messages |

## Verification Query

After running all migrations, confirm tables exist:

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Expected tables include:
`calendar_events`, `legacy_messages`, `matrimony_profiles`, `member_locations`,
`persons`, `samay_branch_members`, `samay_branches`, `samay_profiles`,
`samay_ratings`, `samay_requests`, `samay_transactions`,
`se_applications`, `unions`, `users`, `verification_requests`
