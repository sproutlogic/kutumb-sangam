"""Supabase table and column names — align with your Lovable / Postgres migration."""

PERSONS_TABLE = "persons"
MATRIMONY_PROFILES_TABLE = "matrimony_profiles"
VERIFICATION_REQUESTS_TABLE = "verification_requests"
UNIONS_TABLE = "unions"
USERS_TABLE = "users"
VERIFICATION_AUDIT_TABLE = "verification_audit"
NOTIFICATIONS_TABLE = "notifications"
SALES_SETTINGS_TABLE = "sales_settings"
SALES_PERFORMANCE_TABLE = "sales_performance"
PLATFORM_CONFIG_TABLE = "platform_config"
PRICING_CONFIG_ID = "pricing"
SE_APPLICATIONS_TABLE = "se_applications"
CALENDAR_EVENTS_TABLE = "calendar_events"
LEGACY_MESSAGES_TABLE = "legacy_messages"
MEMBER_LOCATIONS_TABLE = "member_locations"
# Samay Bank v2 (replaces time_bank_offers / time_bank_transactions)
SAMAY_BRANCHES_TABLE        = "samay_branches"
SAMAY_BRANCH_MEMBERS_TABLE  = "samay_branch_members"
SAMAY_REQUESTS_TABLE        = "samay_requests"
SAMAY_TRANSACTIONS_TABLE    = "samay_transactions"
SAMAY_RATINGS_TABLE         = "samay_ratings"
SAMAY_PROFILES_TABLE        = "samay_profiles"

REFERRAL_EVENTS_TABLE  = "referral_events"

# Kutumb Pro — Community OS
ORGANIZATIONS_TABLE    = "organizations"
ORG_MEMBERS_TABLE      = "org_members"
ORG_INVITES_TABLE      = "org_invites"
ORG_ENQUIRIES_TABLE    = "org_enquiries"

# Payment infrastructure
PAYMENTS_TABLE         = "payments"
SUBSCRIPTIONS_TABLE    = "subscriptions"
INVOICES_TABLE         = "invoices"
REFUNDS_TABLE          = "refunds"
PAYMENT_METHODS_TABLE  = "payment_methods"
WEBHOOK_EVENTS_TABLE   = "webhook_events"

# GST defaults (India SaaS — 18 % IGST, or 9+9 CGST+SGST intra-state)
DEFAULT_IGST_RATE      = 18.00   # used unless CGST+SGST split is requested
DEFAULT_CGST_RATE      =  9.00
DEFAULT_SGST_RATE      =  9.00

ONBOARDING_APPROVALS_TABLE = "onboarding_approvals"
TRANSACTIONS_TABLE         = "transactions"
TRANSACTION_APPROVALS_TABLE = "transaction_approvals"

VANSHA_ID_COLUMN = "vansha_id"
PARENT_UNION_ID_COLUMN = "parent_union_id"

# Prakriti — green-cover layer (MOA Objects 2, 3, 5, 6, 10, 11)
PRAKRITI_SCORES_TABLE   = "prakriti_scores"
HARIT_CIRCLES_TABLE     = "harit_circles"
ECO_CEREMONIES_TABLE    = "eco_ceremonies"

# Eco-ceremony gross amounts (INR) — Paryavaran Mitra earnings
ECO_CEREMONY_PRICES: dict[str, int] = {
    "vriksha_pratishtha":   999,
    "jal_puja":             499,
    "eco_pledge":           199,
    "dharti_sandesh":       199,
    "harit_circle_monthly": 500,
}
PLATFORM_FEE_PCT = 20.0  # 20% platform commission

# ── Eco-Panchang ──────────────────────────────────────────────────────────────
TITHIS_TABLE               = "tithis"
PANCHANG_CALENDAR_TABLE    = "panchang_calendar"
PANCHANG_ARTICLES_TABLE    = "panchang_articles"
GENERATED_CONTENT_TABLE    = "generated_content"

# ── Two-Tier Trust Model ───────────────────────────────────────────────────────
ECO_SEWA_LOGS_TABLE        = "eco_sewa_logs"
VERIFIED_ECO_ACTIONS_TABLE = "verified_eco_actions"

# ── Service Layer ─────────────────────────────────────────────────────────────
SERVICE_PACKAGES_TABLE     = "service_packages"
SERVICE_ORDERS_TABLE       = "service_orders"
VENDORS_TABLE              = "vendors"
VENDOR_ASSIGNMENTS_TABLE   = "vendor_assignments"
PROOF_SUBMISSIONS_TABLE    = "proof_submissions"

# Default service package prices in paise (runtime override from platform_config)
SERVICE_PACKAGE_DEFAULT_PRICES: dict[str, int] = {
    "taruvara":     149900,   # ₹1,499
    "dashavruksha": 1199900,  # ₹11,999
    "jala_setu":    249900,   # ₹2,499
}

# Eco-Sewa: hours credited per action type (Tier 1 → eco_hours bucket)
ECO_SEWA_HOUR_WEIGHTS: dict[str, float] = {
    "tree_watered":       0.5,
    "tree_planted_self":  2.0,
    "waste_segregated":   0.5,
    "animal_water":       0.5,
    "eco_pledge":         1.0,
    "community_clean":    1.5,
    "composting":         0.5,
    "solar_action":       1.0,
    "water_harvesting":   1.0,
}

# Auto-verification: proof must be within this distance of delivery address
GEOFENCE_RADIUS_METRES = 500

# Ujjain — traditional Hindu meridian (default for panchang sunrise computation)
UJJAIN_LAT: float = 23.1809
UJJAIN_LON: float = 75.7771
