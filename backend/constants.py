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

VANSHA_ID_COLUMN = "vansha_id"
PARENT_UNION_ID_COLUMN = "parent_union_id"
