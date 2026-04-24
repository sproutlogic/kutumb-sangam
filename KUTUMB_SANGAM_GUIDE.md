# Kutumb Sangam — Complete Guide

## What Is Kutumb Sangam?

**Kutumb Sangam** (meaning "Family Gathering") is a **digital family tree and matrimonial intelligence platform** built specifically for South Asian families. It solves a uniquely Indian problem: preserving ancestral knowledge (vanshavali), preventing forbidden cross-gotra marriages, and helping families find compatible life partners — all in one place.

Think of it as: **WhatsApp Family Group + Ancestry.com + Traditional Pandit + Matrimonial Site** — combined into one trusted platform.

---

## Who Is It For?

| User | Why They Use It |
|------|----------------|
| Families with deep ancestral roots | Preserve and share family history digitally |
| Parents seeking marriage alliances | Verify gotra compatibility before proceeding |
| NRI / diaspora families | Reconnect with extended family across geographies |
| Community elders (Pandits) | Digitally verify family authenticity |
| Young adults | Explore roots, find vetted matrimonial matches |

---

## Core Features & How They Work

### 1. Family Tree Builder (Vanshavali)

**What it does:**  
Users build a multi-generational family tree starting from themselves, adding parents, grandparents, children, and spouses. Each person is a "node" on the tree.

**How it works:**
- During onboarding, the user enters their own details (name, date of birth, hometown, gotra)
- They optionally add father, mother, and spouse immediately
- Each new person is connected via a **Union** (marital couple) model — children don't link to a single parent, they link to the *couple together*. This mirrors how traditional Indian families record lineage.
- The tree renders visually as an SVG diagram — ancestors above, descendants below, spouses beside each other in a shared frame

**Logic behind the model:**
- A "Union" is created whenever two spouses are linked
- Children always attach to a Union, not just a parent — ensuring accurate paternal + maternal lineage
- Placeholder nodes are auto-created when needed (e.g., if you add a grandchild but the grandmother isn't in the tree yet)

---

### 2. Trust & Verification System

**What it does:**  
Every person node has a **verification tier** that tells others how trustworthy that information is.

| Tier | Meaning |
|------|---------|
| Self-Declared | User entered this themselves (no external check) |
| Expert-Verified | A Pandit (community elder/expert) has confirmed it |
| Community-Endorsed | The broader community has collectively validated it |

**How it works:**
- Users request verification from Pandits through the Verification page
- Pandits go through a KYC process (identity verification)
- Once a Pandit verifies a node, no one else can edit that data — it's locked
- This creates a chain of trust for sensitive information like gotra and ancestry

---

### 3. Decision Engine (Governance)

**What it does:**  
Manages WHO can edit WHAT and how changes are processed. Prevents fraud, manipulation, and accidental data corruption.

**The 4 Edit Types:**

| Action Type | When It Applies | What Happens |
|-------------|----------------|--------------|
| **Personal Edit** | You edit your own data | Applied immediately |
| **Factual Correction** | You edit someone else's unverified data | Goes to pending — needs 3 approvals |
| **Contested Fact** | Someone already raised a dispute on this field | Both versions shown; resolver decides |
| **Manipulation Flag** | 5+ rapid edits OR editing expert-verified data | Blocked and flagged as suspicious |

**Logic (step by step):**
1. App checks: who owns this node?
2. App checks: is this node expert-verified?
3. App checks: is there already an active dispute?
4. App checks: has this person made 5+ edits recently?
5. Based on answers → routes to the correct handler

---

### 4. Matrimonial Intelligence

**What it does:**  
Helps families find compatible marriage matches while automatically preventing **gotra collisions** (same-gotra marriages are forbidden in Hindu tradition).-	(Ask the user preference)

**How it works:**
- Families opt into matrimony matching by filling a detailed preference form
- Preferences include: gotra details (own, mother's, grandmother's, etc.), kundali (birth chart) data, lifestyle preferences, generation avoidance rules
- The backend runs a **daily automated scan** that checks all opted-in profiles for gotra matches/collisions
- Families are alerted when a collision is detected (same gotra = not eligible)
- A **Matrimonial Bridge** links a bride/groom's profile back to their paternal family tree, so you can view their full ancestry before proceeding

**Logic:**
- Each person gets a `match_hash` — a fingerprint of their gotra combination
- Two families with the same `match_hash` = gotra collision = incompatible										(Ask User)
- This check runs every night at 2:30 AM UTC automatically

---

### 5. Privacy Controls

**What it does:**  
Each person node can have different visibility levels. You decide who can see what about your family members.

| Privacy Level | Who Can See |
|---------------|-------------|
| Private | Only you |
| Parents | Only your parents |
| Grandparents | Grandparents and above |
| Tree (All Generations) | Everyone in your family tree |
| Custom 5 Nodes | 5 specific people you choose |
| Public | Anyone on the platform |

**Logic:**  
Non-public nodes appear as anonymous silhouettes to outsiders. Full details are only revealed based on the visibility level set by the node's owner.

---

### 6. Discovery

**What it does:**  
Allows families to be "found" by other families on the platform — enabling reconnection across geographies and generations.

**How it works:**
- Available only on Vriksh (₹299/mo) and Vansh (₹799/mo) plans
- The Vansh plan adds "Connection Chains" — showing how two families are distantly related
- Respects all privacy settings — only public nodes are discoverable

---

### 7. Plan Tiers (Monetization)

| Plan | Price | Max Family Members | Max Generations | Key Features |
|------|-------|--------------------|-----------------|--------------|
| **Beej** (Seed) | Free | 15 | 3 | Basic tree only |
| **Ankur** (Sprout) | ₹99/mo | 50 | 5 | + Gotra, cultural fields |
| **Vriksh** (Tree) | ₹299/mo | 200 | 10 | + Discovery, Pandit verification |
| **Vansh** (Lineage) | ₹799/mo | 1000 | 25 | + Matrimony, connection chains |

---

### 8. Multi-language Support

- Full English and Hindi interface
- Users can switch languages at any time
- All labels, buttons, notifications, and error messages are translated

---

## Actions Required Before Launching the Website

### Step 1: Set Up the Database
- [ ] Create a Supabase project at supabase.com
- [ ] Run the SQL migration files (in `/backend/sql/`) to create the `persons`, `unions`, and `matrimony_profiles` tables
- [ ] Copy your Supabase project URL and Service Role Key

### Step 2: Configure Environment Variables
- [ ] Fill in the `.env` file at the project root:
  - `SUPABASE_URL` — your Supabase project URL
  - `SUPABASE_SERVICE_ROLE_KEY` — your Supabase secret key
  - `VITE_API_BASE_URL` — URL where your FastAPI backend will run (e.g. `https://your-api.railway.app`)
  - (Optional) `VITE_DEFAULT_VANSHA_ID` — a demo family UUID for testing

### Step 3: Start the Backend (FastAPI)
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Step 4: Start the Frontend (React)
```bash
npm install
npm run dev          # Development server at http://localhost:8080
# OR for production:
npm run build        # Creates /dist folder for deployment
```

### Step 5: Deploy to Production
- [ ] Deploy the frontend (`/dist` folder) to Vercel, Netlify, or any static host
- [ ] Deploy the FastAPI backend to Railway, Fly.io, or a VPS
- [ ] Update `VITE_API_BASE_URL` in your hosting environment to point to your live backend URL
- [ ] Verify backend health at `https://your-backend-url/health`

### Step 6: Fix Known Issues Before Launch
These are known incomplete features identified in the codebase:

- [ ] **Logo click bug** — currently resets the tree instead of navigating to `/dashboard`  
  File: `src/components/shells/AppTopBar.tsx`

- [ ] **Verification button** — "Request" button is static, needs a working Pandit request flow  
  File: `src/pages/VerificationPage.tsx`

- [ ] **Discovery visibility** — currently toggles the whole tree; should be per-node  
  File: `src/pages/DiscoveryPage.tsx`

- [ ] **Matrimony Opt-In** — "Opt In" button does nothing; needs to open the preference form  
  File: `src/pages/MatrimonyPage.tsx`

### Step 7: Pre-Launch Testing
- [ ] Run unit tests: `npm run test`
- [ ] Run E2E tests: `npx playwright test`
- [ ] Create a test family tree end-to-end: sign up → onboarding → add 5 members → verify tree renders correctly
- [ ] Test matrimony matching: create two fake profiles with the same gotra (should show a collision warning)
- [ ] Test plan upgrade flow: Beej → Vansh

### Step 8: Business Readiness
- [ ] **Payment gateway** — integrate Razorpay or Stripe for plan upgrades (not yet implemented)
- [ ] **Recruit Pandits** — onboard initial community elders for the verification network
- [ ] **Notifications** — configure email/SMS for dispute alerts, approvals, and match notifications (not yet implemented)
- [ ] **Analytics** — add Google Analytics or Mixpanel to track user journeys and funnels
- [ ] **Legal** — publish Privacy Policy and Terms of Service (you handle sensitive genealogical + matrimonial data — this is critical)

---

## Benefits & Unique Selling Points (USP)

### Core Benefits

**For Families:**
- Never lose ancestral history — digital, permanent, accessible from anywhere
- Prevent forbidden marriages through automatic gotra collision detection
- Trust verified data — community-backed verification via Pandits
- Privacy-first: you control exactly who sees what about your family

**For Matrimonial Search:**
- Background check built-in — view the full family tree of any prospective match
- Gotra-safe matching: automated, not manual — eliminates human error
- Multi-generational avoidance (3/5/7 generations configurable)
- Kundali + lifestyle + dietary + professional filters all in one place

**For Community:**
- Rediscover lost family connections across geographies
- Connection Chains show how two families are distantly related
- Elders participate as Pandits — preserving oral knowledge in digital form

### What Makes It Unique (USP Comparison)

| Feature | Kutumb Sangam | Ancestry.com | Shaadi.com / Jeevansaathi |
|---------|:---:|:---:|:---:|
| Indian cultural data model (gotra, mool niwas) | ✅ | ❌ | Partial |
| Gotra collision auto-detection | ✅ | ❌ | ❌ |
| Pandit-verified family data | ✅ | ❌ | ❌ |
| Union-based lineage model | ✅ | ❌ | ❌ |
| Matrimony + family tree in one platform | ✅ | ❌ | ❌ |
| Privacy per individual node | ✅ | ❌ | ❌ |
| Governance / dispute resolution engine | ✅ | ❌ | ❌ |
| Hindi language support | ✅ | ❌ | Partial |

**Core USP in one sentence:**  
*Kutumb Sangam is the only platform that combines verified family tree building, gotra-safe matrimonial matching, and community governance — built specifically for the values and traditions of South Asian families.*

---

## 7 Best Business Ideas from This Platform

### 1. Matrimonial SaaS for Regional Communities
Target specific communities (Brahmins, Rajputs, Jains, Marwaris) with community-specific gotra databases and custom verification networks. Charge a premium subscription (₹999–₹2999/year) to community organizations to white-label the platform for their members. The gotra collision engine becomes their "safety guarantee."

**Why it works:** Community sabhas and samaj organizations already collect this data manually. Giving them a digital tool with authority saves effort and earns trust immediately.

---

### 2. Pandit-as-a-Service Marketplace
Build a verified network of Pandits offering paid services: family tree verification (₹199/session), kundali matching (₹499), matrimonial horoscope consultation (₹999+). Platform takes 20–30% commission. This monetizes the existing verification infrastructure and creates a gig economy for traditional experts.

**Why it works:** Demand for traditional rituals is high; finding credible Pandits is hard. Verified profiles on a trusted platform solve the credibility problem.

---

### 3. Digital Vanshavali for Temples & Trusts
Partner with family temples (kuldevi mandirs) and community trusts that maintain paper pothis (ancestral registers). Offer them a paid digitization service to migrate records into Kutumb Sangam. This gives the platform pre-seeded, authoritative data and a recurring institutional revenue stream.

**Why it works:** Temples are custodians of ancestral records for thousands of families. Digitizing one temple's records instantly onboards hundreds of families.

---

### 4. NRI Diaspora Subscription Tier
Create a "Global" plan targeted at NRI families (US, UK, Canada, UAE) wanting to stay connected to ancestral roots, find India-based matches, or verify family credentials for visa/inheritance purposes. Price in USD ($9.99–$29.99/month). Privacy controls and Pandit verification make it credible for legal/immigration contexts.

**Why it works:** NRIs have higher purchasing power and a strong emotional desire to stay connected to roots. They are also underserved by existing Indian matrimonial platforms.

---

### 5. Family Reunion Event Planning Tool
Add an event module: families on Kutumb Sangam organize kuldevi yatras, shaadi gatherings, or annual milan events using the family tree as the guest list. Monetize via booking fees, vendor partnerships (caterers, decorators, bus services), and premium "event coordination" plan add-ons.

**Why it works:** The family tree already IS the guest list. No other platform can auto-generate a reunion invite list filtered by generation or branch — that's a unique capability.

---

### 6. Genealogical Research API for Legal & Estate Use
Expose an API for law firms, estate lawyers, and banks needing to verify inheritance chains (who is the legal heir?). The union-based lineage model and verification tiers make the data legally defensible. Charge per API call (₹50–₹200/query) or enterprise SLAs.

**Why it works:** Inheritance disputes in India are common, slow, and expensive. A verified digital vanshavali as legal evidence has clear monetary value. High margin, low volume — ideal B2B revenue.

---

### 7. Ancestral Health Risk Platform
Integrate basic health questionnaire data at the node level (diabetes, heart disease, hereditary conditions). Families can see health patterns across generations. Partner with health insurance companies or hospitals — they pay for anonymized population-level insights. Extends the existing data model without major architectural changes, and creates a defensible health-tech angle for fundraising.

**Why it works:** Hereditary disease patterns are invisible without multi-generational data. Kutumb Sangam is uniquely positioned to capture this — no other platform has verified, multi-generational family health data for Indian families at scale.

---

## Technical Architecture (Plain English)

```
User's Browser (React App)
       ↕  HTTP API calls
  FastAPI Backend (Python)
       ↕  Database queries
  Supabase (PostgreSQL Database)
       ↕  Scheduled nightly job
  Gotra Collision Detector (runs at 2:30 AM UTC daily)
```

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | React + TypeScript + Tailwind | What users see and interact with |
| Backend | Python FastAPI | Business logic, data routing |
| Database | Supabase (PostgreSQL) | Permanent storage of all family data |
| Scheduler | APScheduler | Nightly gotra collision detection job |
| State | React Context + localStorage | Fast, local UI state without constant API calls |
| Auth | Supabase Auth | User accounts and session management |

---

*Document generated: April 2026 | App version: Kutumb Sangam v1.0 (pre-launch)*
