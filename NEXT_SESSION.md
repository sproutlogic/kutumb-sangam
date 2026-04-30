# Prakriti — Next Session Instructions
*Pick up exactly where we left off*

---

## Context in One Paragraph

We are building **Prakriti** (by Aarush Eco Tech Pvt Ltd, Kanpur) — India's Family Nature Score. The product reframes Kutumb Map under the existing MOA (Objects 2, 5, 6, 7, 10 + Clause 33) for launch. Prakriti = Nature + Character/Soul in Sanskrit. The Banyan tree is the visual metaphor: ancestors as roots, living members as branches, new births as flowers, eco-contributions as fruits (Prakriti Score). All strategy decisions are in `LAUNCH_DECISIONS.md`. All build batches are sequential — do not skip.

---

## What Is Done (Batches 1–3 Complete)

### Batch 1 — Landing Page ✅
- `index.html` — title, og:meta, twitter:meta all updated to "Prakriti — India's Family Nature Score"
- `src/pages/Landing.tsx` — fully updated:
  - Social proof bar: "🌳 100+ Founding Families · Across India · Founding Family status — free, forever"
  - Loss narrative section (dark, emotional): *"When the last elder goes, the whole forest falls"* + Dadi's kitchen copy
  - Hero: "Your Family's Nature. Your Family's Soul." + Banyan tree
  - Vision section trimmed to 3 lines
  - "Your Family's Forest" section (replaces old Kutumbakam framing)
  - Final CTA: "Every family a forest. Start yours today." + "🌱 Plant your family's first root — free"
  - Invite code demoted to ghost text

### Batch 2 — Prakriti Score Card ✅
- `src/pages/GreenLegacyPage.tsx` — upgraded:
  - Prakriti Score shown as hero number with `/100`
  - Score context: "Higher than 70% of families in [location]" (dynamic, based on score value)
  - "Founding Family" amber badge with Award icon
  - **WhatsApp share button** (green #25D366) — opens `wa.me` with pre-composed Hindi+English message including score, context, forest quote, family link
  - Copy link as secondary button
  - Banyan tree silhouette on desktop
  - Helper functions: `getPrakritiContext()`, `getWhatsAppMessage()`

### Batch 3 — Milestone Celebrations ✅
- `src/components/ui/MilestoneCelebration.tsx` — NEW component:
  - Full-screen overlay with CSS confetti (48 particles, no npm package)
  - Family name + milestone badge + Banyan silhouette
  - WhatsApp share button with pre-composed message
  - Auto-dismisses after 8 seconds
  - 4 milestone tiers: Harit Parivar, Teen Peedhiyaan, Verified Vansha, Maha Vansha
- `src/pages/Dashboard.tsx` — wired:
  - Imports MilestoneCelebration
  - Detects newly earned milestones via localStorage (per vansha_id — shows once only)
  - Renders celebration overlay on milestone unlock

---

## What Remains (Batches 4–6)

### BATCH 4 — Leaderboard ✅
- `backend/routers/prakriti.py` — added `GET /api/prakriti/leaderboard` (top families, location filter) and `GET /api/prakriti/leaderboard/rank/{vansha_id}` (family rank + percentile)
- `src/services/api.ts` — added `LeaderboardEntry`, `FamilyRank` types + `fetchLeaderboard()`, `fetchFamilyRank()`
- `src/pages/LeaderboardPage.tsx` — NEW public page at `/leaderboard`: top-3 podium, full ranked list, location filter input, quick-select chips, CTA
- `src/App.tsx` — added public `/leaderboard` route
- `src/pages/Dashboard.tsx` — fetches family rank, shows "Your family ranks #X in India → See full leaderboard" link below stats

---

### BATCH 5 — Elder Portrait / Shareable Tree ✅
- `backend/routers/green_legacy.py` — made `GET /api/green-legacy/{vansha_id}/generations` public (no auth); removed unused `Depends`/`get_current_user`
- `src/services/api.ts` — added proper `GenerationMember`, `GenerationRow`, `GreenLegacyGenerations` types; updated `fetchGreenLegacyGenerations` return type
- `src/pages/GreenLegacyPage.tsx` — added "Family Portrait" tab alongside "Timeline":
  - Root elder name + birth year shown as most prominent element
  - Stats row: generation count · member count · Prakriti Score (amber)
  - Eco highlights: trees, sewa acts, pledges
  - Print button: `window.print()` with `@media print` CSS that isolates the portrait card full-screen
  - WhatsApp share: "Meet the [X] family — N generations · M members · Score Z"
  - Generations data lazy-loaded on first portrait tab open (only one fetch ever)

---

### BATCH 6 — Payments + Emotional Upgrade Wall + DB Fix (1 hr)
**Goal:** Wire Razorpay for eco-services, update upgrade copy, fix migrations.

**Tasks:**
- [ ] Wire Razorpay for eco-services only (Vriksha Pratishtha ₹999, Jal Puja ₹499 etc.) — check `backend/routers/payments.py` for TODO GATEWAY stubs
- [ ] Update `src/pages/UpgradePage.tsx` upgrade wall copy:
  - Beej wall: *"Your ancestors go back centuries. You can only see 3 generations."*
  - Vriksh wall: *"Your family is invisible to other families in your region."*
  - Vansh pitch: *"₹7,900 for your entire family — ₹158 per person."*
  - Subscriptions invoiced as "Paryavaran Mitra Membership" (MOA-safe)
- [ ] Fix duplicate migration prefixes in `supabase/migrations/` — files 004, 020, 025 have duplicates. Renumber to be sequential.
- [ ] File MOA amendment today (non-technical — remind user)

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/pages/Landing.tsx` | Landing page — fully updated |
| `src/pages/GreenLegacyPage.tsx` | Public score card + WhatsApp share |
| `src/components/ui/MilestoneCelebration.tsx` | Celebration overlay — NEW |
| `src/components/ui/ClanMilestone.tsx` | Milestone badges on dashboard |
| `src/pages/Dashboard.tsx` | Main dashboard — celebration wired |
| `src/pages/UpgradePage.tsx` | Pricing tiers — needs copy update |
| `backend/routers/payments.py` | Razorpay — 12 TODO stubs |
| `supabase/migrations/` | DB migrations — duplicate prefixes |
| `LAUNCH_DECISIONS.md` | Master strategy + all decisions |
| `index.html` | Meta/title — done |

---

## Routing — Check Before Adding Leaderboard
Routes are likely in `src/App.tsx`. Search for existing routes before adding `/leaderboard`. Also check if there is a `src/router.tsx` or similar.

---

## Non-Negotiables Before Launch (Still Pending)
- [ ] Razorpay test payment confirmed (eco-services)
- [ ] Leaderboard public (no login)
- [ ] Migration prefix conflicts resolved
- [ ] MOA amendment filed (start 15-day clock)

---

## Launch Day Checklist
- [ ] Deploy to production
- [ ] Seed 100 founding families from personal WhatsApp network
- [ ] Pandit #1 onboarded — first ceremony logged
- [ ] Announce Gotra Founder race in WhatsApp groups
- [ ] Post Prakriti Score card in Kanpur groups
- [ ] Amit posts his own family's card — founder's personal story

---

## Board Decisions (Non-Negotiable)
- Master brand: **Prakriti**. Kutumb is a feature inside it.
- No amendment needed for Prakriti launch — file anyway for matrimony later
- Pandit is the entire GTM — onboard 25 Pandits before anything else
- WhatsApp share card is the #1 viral mechanic — ship before everything else
- Leaderboard must filter by district to avoid caste friction (Prashant Sachan)
- Vansh tier = family plan (50 members) at ₹7,900 = ₹158/person
