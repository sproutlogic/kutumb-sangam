# Kutumb / Prakriti — Session Summary
_Last updated: 2026-04-28_

---

## Stack
- **Frontend**: React 18 + TypeScript + Vite → Cloudflare Pages (watches `main` branch)
- **Backend**: FastAPI (Python) → Render (`backend/` dir)
- **DB**: Supabase PostgreSQL
- **Auth**: Supabase (Google OAuth + magic link + password)
- **Payments**: Razorpay stub (not wired to UI yet)

> **Always commit/push to `main` branch directly.**

---

## What Was Built (Eco-Panchang / Prakriti Layer)

### Database migrations run (Supabase)
| File | Tables created |
|---|---|
| 020 | `tithis` (30-row seed), `panchang_calendar` |
| 021 | `eco_sewa_logs`, `verified_eco_actions` |
| 022 | `service_packages`, `service_orders`, `vendors`, `vendor_assignments`, `proof_submissions` |
| 023 | `family_eco_summary` (materialized view), `green_legacy_timeline` (view) |
| 024 | `generated_content` |
| 025 | Extends `platform_config` JSON for service package pricing |

### Backend routers (all registered in `main.py`)
- `panchang.py` — today's tithi, 90-day calendar, seed trigger
- `eco_sewa.py` — log, vouch, dispute, stats
- `eco_services.py` — packages, orders, vendor accept, proof upload, auto-verify
- `green_legacy.py` — public family profile + timeline
- `content.py` — draft queue, approve, reject, publish, manual generate trigger
- `notifications.py` — list, mark-read, mark-all-read
- `approval.py` — multi-step SE onboarding + transaction approval (see §Next)

### Workers (APScheduler, registered in `main.py` lifespan)
- `panchang_seeder.py` — runs on startup + Sunday 23:00 UTC; pure pyswisseph Lahiri ayanamsha; seeds 90-day window
- `content_gen.py` — Monday 06:00 IST; generates blog/IG/YT drafts for next 7 days
- `care_reminder.py` — daily 08:00 IST; notifies vendor + user on 3/6/9/12-month care milestones

### Panchang computation
- **pyswisseph** (Swiss Ephemeris) with `SIDM_LAHIRI`; uses 06:00 IST fixed time to avoid `rise_trans` issues
- **Client-side JS fallback**: Meeus simplified Moon-Sun elongation → tithi_id; reads tithis table directly from Supabase — works even when backend is down
- Display uses `name_sanskrit` (द्वादशी) not `name_hindi` (बारस)

### Frontend pages (all fully wired)
| Route | Page | Notes |
|---|---|---|
| `/calendar` | KutumbCalendarPage | Has EcoPanchangStrip at top |
| `/eco-panchang` | EcoPanchangPage | 7-day nav, blog/IG/YT content section |
| `/eco-sewa` | EcoSewaPage | Log + vouch + dispute; no sidebar link (accessible from strip) |
| `/services` | EcoServicesPage | 3 package cards + checkout form |
| `/services/orders/:id` | ServiceOrderDetailPage | Care timeline + proof list |
| `/green-legacy/:id` | GreenLegacyPage | Public, shareable |
| `/vendor-portal` | VendorPortalPage | Accept order + geo-tagged proof upload |
| `/admin/content` | ContentQueuePage | Blog/IG/YT draft review; tabs |

### Auth / Profile fix
- `AuthContext.tsx`: now passes `full_name` + `phone` from Supabase user metadata to `POST /api/auth/session` on every sign-in — Google login name persists immediately
- `SignIn.tsx`: password flow navigates to `/dashboard` on success

### UI fixes
- **Sidebar**: Home at top, eco-sewa nav item removed, Sewa Chakra renamed
- **Notifications bell**: in AppTopBar — badge, dropdown, mark-read; polls every 2 min
- **Landing logos**: 5 real partner logos (SIL, Startup India, IIT Kanpur SIIC, Start in UP, AIIDE CoE); white background, full width, no borders
- **Onboarding**: redirects to `/dashboard` after completion (was `/eco-sewa`)

---

## Verified Working (all pages have real API calls)
Eco-Sewa ✅ · Eco Services ✅ · Service Orders ✅ · Green Legacy ✅ · Vendor Portal ✅ · Content Queue ✅ · Harit Circle ✅ · Kutumb Pro/Org ✅ · Radar ✅ · Time Bank ✅ · Notifications ✅ · Legacy Box ✅

---

## Two Remaining Gaps

### 1. Approval flows — no frontend UI
**Backend**: `routers/approval.py` — multi-step approval chain for:
- SE (Sales Executive) onboarding: office → finance → admin (3 steps, releases SE role)
- Transactions: office → finance → admin → superadmin (4 steps, releases funds)

**Endpoints**:
```
GET  /api/approval/onboarding
GET  /api/approval/transactions
POST /api/approval/onboarding/{id}/step/{1|2|3}
POST /api/approval/transaction/{id}/step/{1|2|3|4}
```

**What to build**: An admin/finance/office role-gated page (e.g. `/admin/approvals`) with two tabs — SE Applications and Transactions — showing pending items with one-click step approval buttons per role.

---

### 2. Published blog/content — no public display page
**Backend**: `GET /api/content/published?content_type=blog_post|ig_caption|yt_short`
**Frontend api.ts**: `fetchPublishedContent()` exists but nothing calls it.

The `ContentQueuePage` lets admins approve → publish. Published rows sit in `generated_content` with `status='published'` but users never see them.

**What to build**: A `/blog` (or `/eco-content`) public page with:
- Tab: Blog Posts | Instagram | YouTube
- Cards showing title, subtitle, body preview, date, hashtags
- No auth required (public)
- Could live linked from EcoPanchangPage "Read More →" button

---

## Key File Paths (quick reference)
```
backend/
  main.py                    — router + APScheduler registration
  routers/panchang.py
  routers/eco_sewa.py
  routers/eco_services.py
  routers/green_legacy.py
  routers/content.py
  routers/notifications.py
  routers/approval.py        ← needs frontend
  workers/panchang_seeder.py
  workers/content_gen.py
  workers/care_reminder.py
  sql/020–025_*.sql

src/
  contexts/AuthContext.tsx   — session sync + profile save fix
  components/shells/AppShell.tsx    — sidebar nav
  components/shells/AppTopBar.tsx   — notifications bell
  components/EcoPanchangStrip.tsx   — JS ephemeris fallback
  pages/EcoPanchangPage.tsx         — 7-day calendar + content
  pages/EcoSewaPage.tsx
  pages/EcoServicesPage.tsx
  pages/ContentQueuePage.tsx        — admin only
  services/api.ts            — all API functions incl. notifications
  i18n/translations.ts
```

## Environment Variables needed (Cloudflare Pages)
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_BASE_URL=https://<render-service>.onrender.com
```
