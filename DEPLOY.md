# Kutumb Sangam — Production Deployment Guide
**Stack:** Cloudflare Pages (frontend) · AWS App Runner (backend) · Supabase (DB)  
**Domain:** kutumbmap.com

---

## 0. Pre-flight: Supabase (do this first)

### 0-A. Run all SQL migrations in order
Open: **Supabase Dashboard → SQL Editor**

Run each file from `backend/sql/` in order 001 → 011.  
See `backend/MIGRATION_CHECKLIST.md` for the full table.

> **Critical:** Migration 011 (`011_samay_bank.sql`) must be run — all Samay Bank
> endpoints will fail without it.

### 0-B. Create the Storage bucket
**Supabase Dashboard → Storage → New bucket**

| Bucket name    | Public | Purpose                      |
|----------------|--------|------------------------------|
| `legacy-voices`| ✅ Yes | Legacy Box voice messages    |

### 0-C. Grab your Supabase credentials
You'll need these for both Cloudflare and App Runner:

| Key | Where to find |
|-----|---------------|
| `SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role (secret) |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → anon / public |

---

## 1. Frontend — Cloudflare Pages

### 1-A. Connect your repo
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Pages → Create a project**
2. Connect to GitHub → select the `kutumb-sangam` repo
3. Use these build settings:

| Setting | Value |
|---------|-------|
| Framework preset | None (or Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(leave blank — repo root)* |
| Node version (Environment variable) | `20` |

### 1-B. Add environment variables
In **Pages → your project → Settings → Environment variables**, add:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your anon key |
| `VITE_API_BASE_URL` | `https://api.kutumbmap.com` *(App Runner URL — set after step 2)* |
| `VITE_DEFAULT_VANSHA_ID` | *(leave blank)* |
| `VITE_BETA_ALL_ACCESS` | `false` |

> The `public/_redirects` file is already committed — it handles React Router SPA
> routing automatically on Cloudflare Pages.

### 1-C. Custom domain
1. **Pages → your project → Custom domains → Set up a custom domain**
2. Enter `kutumbmap.com`
3. Cloudflare will add the DNS record automatically (it's already on Cloudflare DNS)
4. Also add `www.kutumbmap.com` and set up a redirect to the apex

---

## 2. Backend — AWS App Runner

### 2-A. Create the service (source-based deployment)
1. Open [AWS Console → App Runner](https://console.aws.amazon.com/apprunner)
2. **Create service → Source: Source code repository**
3. Connect to GitHub → select the repo → branch: `main`
4. **Deployment trigger:** Automatic
5. App Runner will detect `apprunner.yaml` at the repo root automatically

**Service settings:**
| Setting | Value |
|---------|-------|
| Service name | `kutumb-sangam-backend` |
| CPU | 0.25 vCPU *(cheapest — fits within $100 credit)* |
| Memory | 0.5 GB |
| Port | `8080` |
| Health check path | `/health` |

### 2-B. Add environment variables
In the App Runner service settings (or during creation), add:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | your service role key |
| `ALLOWED_ORIGINS` | `https://kutumbmap.com,https://www.kutumbmap.com` |
| `MATCHER_CRON_HOUR` | `2` |
| `MATCHER_CRON_MINUTE` | `30` |

> **Note:** `SUPABASE_JWT_SECRET` is NOT required — the backend validates tokens via
> `supabase.auth.get_user()`, not by verifying JWTs locally.

### 2-C. Custom domain for the API
1. In App Runner → your service → **Custom domains → Link domain**
2. Enter `api.kutumbmap.com`
3. App Runner gives you CNAME records → add them in **Cloudflare DNS**:
   - Type: `CNAME`, Name: `api`, Target: your App Runner endpoint
   - **Proxy status: DNS only** (grey cloud — App Runner handles its own TLS)

### 2-D. Copy the App Runner URL back to Cloudflare Pages
Once the service is running, copy the `api.kutumbmap.com` URL and set it as
`VITE_API_BASE_URL` in Cloudflare Pages environment variables, then trigger a
re-deploy.

---

## 3. DNS Summary (Cloudflare)

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| `CNAME` | `@` (or A record) | Cloudflare Pages handles this automatically | ✅ Proxied |
| `CNAME` | `www` | same as apex | ✅ Proxied |
| `CNAME` | `api` | your-app-runner-id.region.awsapprunner.com | ⬜ DNS only |

---

## 4. Docker deployment (alternative to source-based App Runner)

If you prefer Docker-based App Runner:
1. Build & push the image:
```bash
cd backend
aws ecr create-repository --repository-name kutumb-backend
docker build -t kutumb-backend .
docker tag kutumb-backend:latest <account>.dkr.ecr.<region>.amazonaws.com/kutumb-backend:latest
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker push <account>.dkr.ecr.<region>.amazonaws.com/kutumb-backend:latest
```
2. Create App Runner service → Source: **Container registry → Amazon ECR**

The `backend/Dockerfile` is ready for this path.

---

## 5. Local dev (quick reminder)

```bash
# Frontend
cp .env.example .env.local   # fill in values
npm install
npm run dev

# Backend (run from backend/ directory)
cd backend
cp .env.example .env         # fill in values
pip install -r requirements.txt
uvicorn main:app --reload
```

---

## 6. Post-deploy smoke test

```bash
# Health check
curl https://api.kutumbmap.com/health
# → {"status":"ok"}

# Confirm DB tables (run in Supabase SQL Editor)
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

Expected tables: `calendar_events`, `legacy_messages`, `matrimony_profiles`,
`member_locations`, `persons`, `samay_branch_members`, `samay_branches`,
`samay_profiles`, `samay_ratings`, `samay_requests`, `samay_transactions`,
`se_applications`, `unions`, `users`, `verification_requests`

---

## 7. Estimated AWS cost (with $100 credit)

| Service | Config | Monthly estimate |
|---------|--------|-----------------|
| App Runner | 0.25 vCPU / 0.5 GB, ~5% utilization | ~$5–8 |
| Data transfer | Low traffic | ~$1–2 |
| ECR (if Docker path) | Minimal storage | ~$0.50 |
| **Total** | | **~$7–11/month** |

Your $100 credit covers roughly **9–14 months** of backend hosting.
