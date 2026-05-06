# Kutumb — Tree Entitlement & Monetisation System
**Handoff document for implementation. Session date: 2026-05-06.**

---

## Context

Kutumb is an Indian vansh-vruksha (family genealogy) SaaS. The tree canvas (`/tree-v2`) was rebuilt in the previous session using React Flow + Dagre. This document specifies the full entitlement and monetisation layer to build on top of it.

### Codebase facts you need to know

| Item | Value |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind + shadcn/ui |
| Backend | FastAPI + Python |
| DB / Auth | Supabase (PostgreSQL + Supabase Auth) |
| Payments | Razorpay (India — UPI, cards, netbanking) |
| Routing | `/tree-v2` = tree canvas page (public route, demo mode if no vansha_id) |
| Key tables | `persons`, `unions`, `relationships`, `vanshas`, `users` |
| Auth middleware | `CurrentUser` (FastAPI dependency), `require_margdarshak` for admin |
| Tree canvas | `src/components/tree/TreeCanvasV2.tsx`, `src/pages/TreePageV2.tsx` |
| Existing canvas work | Sitting in a git worktree (`eager-banach-b2d802`) — **merge to main first** |
| Constants file | `backend/constants.py` — has GST rates, table names, eco-ceremony prices |
| Referral system | `referral_events` table already exists; kutumb_id on users + persons |

---

## Core Design Decisions

### 1. Ego-centric entitlement (NOT vansha-level)

The vansha is a shared tree (potentially 1000+ nodes, 30+ generations). Multiple users live in it. Each user's subscription defines a **window centred on their own node (G0)**. Two users in the same vansha can have completely different views.

```
Free:     G-1 → G0 → G+1   (3 gen, 21 nodes)
Basic:    G-2 → G0 → G+2   (5 gen, 51 nodes)
Standard: G-3 → G0 → G+3   (7 gen, 101 nodes)
Premium:  G-5 → G0 → G+5   (unlimited nodes)
```

`gen_up` and `gen_down` are **separate fields** on the plan, not a single number. This maps to how Indians think: "I can see my dada's generation and my grandchildren's generation."

**Prerequisite**: the user must have a claimed node in the vansha (a `persons` row where `owner_id = user.id`). Without a node, no window exists. Show an onboarding prompt.

### 2. Sharing is relationship-constrained, not vansha-wide

A premium user can extend partial visibility to nodes **within graph distance ≤ 2** of their own node (parents, children, siblings, spouses, grandparents, grandchildren, in-laws). They cannot share to arbitrary nodes in the vansha they aren't connected to.

Sharing is **partial** — the granter chooses how many generations to extend (≤ their own package). They do not have to share their full package.

Distance validation uses:
- `lineage_path` ltree column (already exists) for ancestor/descendant checks → O(1) with GIST index
- `relationships` table for lateral connections (siblings, spouses)

### 3. Sachet pricing (micro-transactions)

Two distinct sachet products:

**Node Sachet** — unlock specific ghost nodes permanently
- Presented when user taps a locked ghost card
- Options: "Unlock this person ₹19" or "Unlock 5 nodes ₹49"
- Permanent. Never expires.
- Viral hook: person whose node was unlocked receives a notification

**Generation Topup** — temporary window extension
- "Add +1 generation up for 30 days — ₹39"
- Expires. Renewable. Creates recurring micro-revenue.

**Branch Bundle** — unlock an entire subtree at once
- User sees 6 locked ghost nodes under a great-grandfather
- "Unlock this entire branch (6 people) — ₹99"
- Better unit economics than individual unlocks

### 4. Ghost nodes at boundary (not hard cutoff)

Locked nodes are **visible but blurred**. They render as `FamilyNode` cards with:
- A lock icon
- Member count only ("🔒 4 members hidden") — **no names, no PII** (legal/privacy boundary)
- Tap → upgrade CTA or sachet purchase option

The backend returns locked nodes as `{ node_id, is_locked: true, generation, locked_count }` with zero PII fields. This creates genuine FOMO and drives conversion better than hard cutoffs.

### 5. Event sourcing for all entitlement changes

No mutable status columns. Every entitlement change appends to `subscription_events`. Current state is always the latest event for that user. This gives:
- Full audit trail for support
- Race-condition-free state
- Admin can see complete history

### 6. Precomputed visibility cache

For a 1000-node vansha, computing BFS distance on every API call is expensive. The set of nodes visible to a user is precomputed and cached in `user_visible_nodes` whenever any of their entitlement events change. API reads from this cache. Cache is rebuilt async by a background job triggered on event insert.

### 7. Grace period on expiry

On subscription lapse, do **not** hard-cutoff immediately. Apply a 7-day grace period:
- User sees their previous view
- Daily in-app notification: "Your plan expires in N days"
- After 7 days: downgrade to free tier view
- Data is never deleted — only visibility changes

### 8. Razorpay + GST

India payments via Razorpay (supports UPI, cards, netbanking, EMI). GST rates already exist in `constants.py` (IGST 18%, CGST 9%, SGST 9%). Every transaction must generate a GST-compliant invoice stored in the DB and downloadable as PDF.

---

## Data Model — New Tables

```sql
-- ── 1. Plan definitions (immutable once subscribed) ─────────────────────────
CREATE TABLE tree_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,           -- 'free' | 'basic' | 'standard' | 'premium'
  display_name  TEXT NOT NULL,           -- shown to users: 'Basic', 'Standard', etc.
  price_inr_monthly  DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_inr_annual   DECIMAL(10,2) NOT NULL DEFAULT 0,
  gen_up        INT  NOT NULL DEFAULT 1, -- generations above G0
  gen_down      INT  NOT NULL DEFAULT 1, -- generations below G0
  max_intentional_nodes INT NOT NULL DEFAULT 21, -- NULL = unlimited
  features      JSONB NOT NULL DEFAULT '{}',
  -- feature keys: pdf_export, matrimony_matching, bridge_tree,
  --               bulk_import, api_access
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. User subscriptions ────────────────────────────────────────────────────
CREATE TABLE user_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  plan_id       UUID NOT NULL REFERENCES tree_plans(id),
  status        TEXT NOT NULL CHECK (status IN (
                  'trial', 'active', 'grace_period', 'expired', 'cancelled'
                )),
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until   TIMESTAMPTZ,            -- NULL = lifetime / manual
  price_paid_inr DECIMAL(10,2) NOT NULL DEFAULT 0,
  razorpay_subscription_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Subscription event log (append-only, source of truth) ────────────────
CREATE TABLE subscription_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  event_type    TEXT NOT NULL CHECK (event_type IN (
                  'trial_started', 'subscribed', 'upgraded', 'downgraded',
                  'renewed', 'payment_failed', 'grace_period_started',
                  'expired', 'cancelled', 'admin_override',
                  'referral_unlock', 'sachet_purchased', 'topup_activated'
                )),
  plan_id       UUID REFERENCES tree_plans(id),
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_by    UUID REFERENCES users(id), -- NULL = system/webhook
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. Node sachets (permanent per-node unlocks) ────────────────────────────
CREATE TABLE node_unlocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  node_id       UUID NOT NULL REFERENCES persons(node_id),
  bundle_size   INT NOT NULL DEFAULT 1,  -- 1, 5, branch-count
  price_paid_inr DECIMAL(10,2) NOT NULL,
  razorpay_order_id TEXT,
  purchased_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, node_id)
);

-- ── 5. Generation topups (temporary window extension) ───────────────────────
CREATE TABLE gen_topups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  extra_gen_up  INT NOT NULL DEFAULT 0,
  extra_gen_down INT NOT NULL DEFAULT 0,
  price_paid_inr DECIMAL(10,2) NOT NULL,
  valid_until   TIMESTAMPTZ NOT NULL,
  razorpay_order_id TEXT,
  purchased_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 6. Entitlement sharing (peer-to-peer, distance ≤ 2) ─────────────────────
CREATE TABLE entitlement_shares (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  granter_node_id   UUID NOT NULL REFERENCES persons(node_id),
  grantee_node_id   UUID NOT NULL REFERENCES persons(node_id),
  shared_gen_up     INT NOT NULL DEFAULT 1,
  shared_gen_down   INT NOT NULL DEFAULT 1,
  max_hops_verified INT NOT NULL,         -- backend-computed at creation time
  valid_until       TIMESTAMPTZ,          -- NULL = indefinite
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (granter_node_id, grantee_node_id)
);

-- ── 7. Precomputed visibility cache ─────────────────────────────────────────
CREATE TABLE user_visible_nodes (
  user_id       UUID PRIMARY KEY REFERENCES users(id),
  node_ids      UUID[] NOT NULL DEFAULT '{}',
  locked_boundary_nodes JSONB NOT NULL DEFAULT '[]',
  -- [{node_id, generation, locked_count}] — for ghost rendering
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 8. Referral unlock credits ───────────────────────────────────────────────
CREATE TABLE referral_unlocks (
  user_id         UUID PRIMARY KEY REFERENCES users(id),
  referrals_count INT NOT NULL DEFAULT 0,
  extra_gen_up    INT NOT NULL DEFAULT 0,  -- 1 per confirmed referral, cap 3
  extra_gen_down  INT NOT NULL DEFAULT 0
);

-- ── 9. GST invoices ──────────────────────────────────────────────────────────
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  razorpay_payment_id TEXT,
  amount_inr      DECIMAL(10,2) NOT NULL,
  cgst_inr        DECIMAL(10,2) NOT NULL DEFAULT 0,
  sgst_inr        DECIMAL(10,2) NOT NULL DEFAULT 0,
  igst_inr        DECIMAL(10,2) NOT NULL DEFAULT 0,
  invoice_number  TEXT UNIQUE NOT NULL,
  line_items      JSONB NOT NULL DEFAULT '[]',
  pdf_url         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Entitlement Resolution — Enforcement Order

For any API call requesting tree data for `user_id`:

```
1. Check admin override in subscription_events (latest event_type='admin_override')
   → if exists: use override gen_up/gen_down/node_ids

2. Resolve base plan:
   - Find active user_subscription (status IN ('trial','active','grace_period'))
   - Join tree_plans for gen_up, gen_down, max_intentional_nodes
   - If none: use free tier defaults

3. Add gen_topups:
   - SELECT SUM(extra_gen_up), SUM(extra_gen_down) WHERE valid_until > now()
   - Add to base plan values

4. Add referral_unlocks:
   - extra_gen_up, extra_gen_down (already aggregated on the table)

5. Find user's ego node (persons WHERE owner_id = user.id AND vansha_id = target_vansha)
   - If no node: return empty tree with onboarding prompt

6. Compute visible node set:
   - From ego node's generation G0:
     visible_gen_range = [G0 - total_gen_up, G0 + total_gen_down]
   - Fetch all persons in vansha in that gen range
   - Filter to max_intentional_nodes (exclude is_placeholder=true from count)
   - Add node_unlocks.node_id for this user (sachet unlocks, ignore gen range)
   - Add nodes shared to this user via entitlement_shares

7. Boundary nodes (for ghost rendering):
   - Fetch persons just outside the visible range (1 gen beyond each boundary)
   - Return as locked_boundary_nodes: [{node_id, generation, locked_count}]
   - NO PII fields on locked nodes

8. Write result to user_visible_nodes cache (async, fire-and-forget)

9. Return: {visible_nodes: [...], locked_boundary: [...], entitlement: {gen_up, gen_down, max_nodes, features}}
```

---

## Backend — New Endpoints

```
# Entitlement
GET  /api/entitlement/me                  → current user's resolved limits + features
GET  /api/entitlement/tree/{vansha_id}    → visible nodes for current user in vansha
                                            (replaces direct fetchVanshaTree for v2 canvas)

# Subscriptions
GET  /api/subscriptions/plans             → list active plans (public)
POST /api/subscriptions/checkout          → create Razorpay order for plan
POST /api/subscriptions/webhook           → Razorpay webhook handler (HMAC verified)
GET  /api/subscriptions/my               → current user's subscription history

# Sachets
POST /api/sachets/node-unlock/checkout    → create Razorpay order for node unlock
POST /api/sachets/topup/checkout          → create Razorpay order for gen topup
POST /api/sachets/bundle/checkout         → create Razorpay order for branch bundle

# Sharing
POST /api/entitlement/share              → grant partial view to connected node
DELETE /api/entitlement/share/{id}       → revoke share
GET  /api/entitlement/shares/given       → shares I have granted
GET  /api/entitlement/shares/received    → shares I have received

# Admin / Superadmin
GET    /api/admin/plans                  → list all plans including inactive
POST   /api/admin/plans                  → create new plan
PATCH  /api/admin/plans/{id}             → update plan (price/display only; limits frozen if active subs exist)
DELETE /api/admin/plans/{id}             → deactivate plan
GET    /api/admin/subscriptions          → list all user subscriptions (paginated)
POST   /api/admin/override/{user_id}     → manual entitlement override
GET    /api/admin/events                 → full subscription_events audit log
GET    /api/admin/invoices               → all invoices (GST reports)
```

---

## Frontend — Changes to Tree Canvas

### TreeCanvasV2 must:

1. **Replace `fetchVanshaTree`** with `GET /api/entitlement/tree/{vansha_id}` as data source
2. **Auto-center on user's node (G0)** on first load using React Flow's `fitView` with the ego node ID
3. **Render locked boundary nodes** as blurred `FamilyNode` cards with:
   - Lock icon overlay
   - "🔒 N members hidden" text (no names)
   - `onClick` → upgrade drawer / sachet purchase
4. **Entitlement banner** in the Panel: shows current plan name, gen window, "Upgrade" button
5. **No gen slider for free/basic** — they see their fixed window, no manual adjustment
6. **Gen slider only for Standard+** — allows panning within their allowed window

### New components needed:

```
src/components/tree/LockedNode.tsx         — ghost card with lock + count
src/components/entitlement/UpgradeDrawer.tsx — plan comparison + Razorpay checkout
src/components/entitlement/SachetModal.tsx  — node unlock / topup purchase
src/services/entitlementApi.ts             — API client for all entitlement endpoints
```

### Entitlement context:

```typescript
// src/contexts/EntitlementContext.tsx
interface Entitlement {
  plan: string;           // 'free' | 'basic' | 'standard' | 'premium'
  gen_up: number;
  gen_down: number;
  max_nodes: number;
  features: Record<string, boolean>;
  status: 'trial' | 'active' | 'grace_period' | 'expired';
  valid_until: string | null;
}
```

Fetched once on auth, stored in context, consumed by canvas and any feature-gated UI.

---

## Superadmin Dashboard

Route: `/admin/tree-packages` (protected by `require_superadmin` role check)

### Panels:

**Plan Manager**
- Table: name, price/mo, price/yr, gen_up, gen_down, max_nodes, features, active toggle, sort
- Inline edit for price and display fields
- Limits (gen_up/down/max_nodes) **locked for edit once any active subscription exists on that plan** — must create a new plan instead
- Drag-to-reorder (controls display on upgrade page)

**Subscription Explorer**
- Search by user phone / kutumb_id
- See current plan, status, valid_until
- Manual override button → creates admin_override event with reason field
- Subscription event timeline per user

**Sachet Analytics**
- Table: which nodes are most unlocked, which branches, conversion rate from ghost tap → purchase

**GST Report**
- Date range filter
- Export CSV of all invoices (for CA / GST filing)

**Audit Log**
- All subscription_events with created_by, timestamp, metadata
- Filterable by event_type, user, admin

---

## Razorpay Integration Flow

```
1. User clicks "Upgrade to Basic" in UpgradeDrawer
2. Frontend → POST /api/subscriptions/checkout {plan_id}
3. Backend: create Razorpay order, store pending in subscription_events
4. Frontend: open Razorpay checkout modal (Razorpay.js)
5. User pays (UPI / card / netbanking)
6. Razorpay → POST /api/subscriptions/webhook (HMAC signature verified)
7. Backend:
   a. Verify payment with Razorpay API
   b. Insert subscription_events row (event_type='subscribed')
   c. Upsert user_subscriptions row
   d. Trigger user_visible_nodes cache rebuild (async)
   e. Create invoice row + queue PDF generation
   f. Send notification to user
8. Frontend: polling or websocket receives confirmation → canvas refreshes
```

**HMAC verification is mandatory** — never trust webhook payload without verifying `X-Razorpay-Signature`.

---

## GST Compliance

- All subscriptions: 18% GST
- Intra-state (same state as company): CGST 9% + SGST 9%
- Inter-state: IGST 18%
- User's state is determined at checkout from billing address
- Invoice number format: `KT-YYYY-NNNNNN` (sequential, never reused)
- GST rates come from `constants.py` (already has DEFAULT_IGST_RATE, CGST, SGST)

---

## Behavioral Limits (anti-abuse, not monetisation)

The user mentioned "non-serious scrolling" — address this separately from entitlements:

1. **Rate limiting** on `GET /api/entitlement/tree/{vansha_id}`: max 30 requests/minute per user (FastAPI middleware or Supabase edge function)
2. **Analytics events**: log `tree_viewed`, `generation_scrolled`, `node_opened` with timestamp. Use these to identify scraping patterns (100+ nodes viewed in <60 seconds)
3. **Auto-flag** accounts with suspicious patterns for superadmin review
4. These are **not** communicated to the user as entitlement limits — they're backend-only protections

---

## Referral → Entitlement Link

Existing `referral_events` table already tracks confirmed referrals. Wire it to entitlements:

- Each confirmed referral (event_type='registration') increments `referral_unlocks.referrals_count`
- At 1 referral: +1 gen_up
- At 2 referrals: +1 gen_down
- At 3 referrals: +1 gen_up (total +2 up, +1 down from referrals, capped)
- Shown in the user's entitlement panel: "You've unlocked 2 extra generations through referrals 🌿"
- Insert `subscription_events` row with `event_type='referral_unlock'` for audit trail

---

## Implementation Order

**Phase 1 — Foundation (build first)**
1. Merge tree canvas worktree (`eager-banach-b2d802`) to main
2. DB migration: all 9 new tables above
3. Seed free plan as default for all existing users
4. `GET /api/entitlement/me` and `GET /api/entitlement/tree/{vansha_id}` (enforcement logic)
5. Update TreeCanvasV2 to use entitlement endpoint + auto-center on ego node
6. Render `LockedNode` ghost cards at boundary

**Phase 2 — Payments**
7. Razorpay integration + webhook handler + invoice generation
8. `POST /api/subscriptions/checkout` and webhook endpoint
9. `UpgradeDrawer` frontend component (plan comparison + checkout)
10. Subscription status in EntitlementContext

**Phase 3 — Sachets**
11. Node unlock + gen topup + branch bundle checkout endpoints
12. `SachetModal` frontend (triggered by tapping ghost node)
13. Sachet unlock notification to the unlocked person

**Phase 4 — Sharing**
14. Distance validation (ltree + relationships BFS ≤ 2 hops)
15. `entitlement_shares` CRUD endpoints
16. Share UI in right-click context menu on node

**Phase 5 — Superadmin**
17. `/admin/tree-packages` dashboard (plan CRUD, subscription explorer, audit log, GST report)
18. Manual override endpoint + UI

**Phase 6 — Growth mechanics**
19. Referral → unlock wiring
20. Rate limiting + behavioral flag system
21. Grace period cron job (daily, checks valid_until, updates status to grace_period → expired)

---

## Key Constraints to Preserve

- `/tree` (old route) must keep working exactly as before — no changes to `tree.py` or `TreePage.tsx`
- `person.py`, `union.py` — no changes
- `vrukshaRelations.ts` — no changes
- Every new endpoint requires `CurrentUser` auth dependency
- Every admin endpoint requires `require_superadmin` (add this role to auth middleware)
- TypeScript must stay clean (`npx tsc --noEmit` passes) after every change
- No new infrastructure — Supabase + Render + Cloudflare Pages only

---

## Files You Will Touch

```
backend/
  routers/entitlement.py          NEW
  routers/subscriptions.py        NEW
  routers/sachets.py              NEW
  routers/admin_plans.py          NEW
  routers/tree_v2.py              EXTEND (use entitlement cache)
  middleware/auth.py              EXTEND (add require_superadmin)
  constants.py                    EXTEND (plan defaults, Razorpay keys)
  main.py                         EXTEND (register new routers)

supabase/migrations/
  XXX_entitlement_tables.sql      NEW (all 9 tables above)
  XXX_persons_is_placeholder.sql  NEW (add is_placeholder bool if not exists)

src/
  contexts/EntitlementContext.tsx       NEW
  services/entitlementApi.ts           NEW
  services/razorpayApi.ts              NEW
  components/tree/TreeCanvasV2.tsx     MODIFY (use entitlement endpoint)
  components/tree/LockedNode.tsx       NEW
  components/entitlement/
    UpgradeDrawer.tsx                  NEW
    SachetModal.tsx                    NEW
    PlanBadge.tsx                      NEW (shows current plan in canvas panel)
  pages/
    TreePageV2.tsx                     MINOR MODIFY
    admin/TreePackagesPage.tsx         NEW
  App.tsx                              EXTEND (add admin route, EntitlementProvider)
```

---

*End of handoff document. Build in phase order. Phase 1 is unblocked immediately.*
