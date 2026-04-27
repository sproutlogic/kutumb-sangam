import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "@/components/shells/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { getApiBaseUrl } from "@/services/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle, BadgeIndianRupee, Handshake, Settings2, Users,
  Package, IndianRupee, ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  ShieldAlert, Tag,
} from "lucide-react";
import {
  defaultPricingConfig,
  defaultServicePackages,
  planOrder,
  type PricingConfig,
  type PlanId,
  type EntitlementKey,
  type ServicePackageId,
} from "@/config/packages.config";
import { TreePine, Droplets } from "lucide-react";

const SALES_ROLES = new Set(['se', 'cp', 'rp', 'zp', 'np', 'admin', 'superadmin']);

// ─── Sales types ──────────────────────────────────────────────────────────────

type SalesSettings = {
  product_price: number;
  se_direct_incentive: number;
  cp_override: number;
  rp_trade_discount: number;
  zp_trade_discount: number;
  np_trade_discount: number;
};

type SalesRow = {
  user_id: string;
  name: string;
  level: string;
  personal_sales: number;
  team_sales: number;
  pending_support_cases: number;
};

type DashboardPayload = {
  my_role: string;
  visible_role: string | null;
  can_edit_settings: boolean;
  settings: SalesSettings;
  rows: SalesRow[];
  totals: { personal_sales: number; team_sales: number; pending_support_cases: number };
};

// ─── Entitlement labels ───────────────────────────────────────────────────────

const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  culturalFields:      'Cultural Fields',
  discovery:           'Discovery',
  connectionChains:    'Connection Chains',
  panditVerification:  'Pandit Verification',
  matrimony:           'Matrimony',
  sosAlerts:           'SOS Alerts',
  treeAnnounce:        'Tree Broadcast',
};

const PLAN_LABELS: Record<PlanId, string> = {
  beej:  'Beej (Free)',
  ankur: 'Ankur  — ₹2,100/yr',
  vriksh:'Vriksh — ₹4,900/yr',
  vansh: 'Vansh  — ₹7,900/yr',
};

// ─── Pricing tab ──────────────────────────────────────────────────────────────

type Tab = 'sales' | 'pricing';

function NumberField({
  label, value, onChange, prefix = '₹', suffix = '',
}: {
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-1 rounded-lg border border-input bg-background px-3 py-2">
        {prefix && <span className="text-muted-foreground text-xs">{prefix}</span>}
        <input
          type="number"
          min={0}
          value={value}
          onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="flex-1 bg-transparent outline-none text-sm"
        />
        {suffix && <span className="text-muted-foreground text-xs">{suffix}</span>}
      </div>
    </label>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full transition-colors ${
        checked
          ? 'bg-primary/15 text-primary'
          : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
      }`}
    >
      {checked ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
      {checked ? 'On' : 'Off'}
    </button>
  );
}

function PricingTab({
  draft, setDraft, onSave, isSaving,
}: {
  draft: PricingConfig;
  setDraft: React.Dispatch<React.SetStateAction<PricingConfig>>;
  onSave: () => void;
  isSaving: boolean;
}) {
  const [expandedPlan, setExpandedPlan] = useState<PlanId | null>('beej');

  const updatePlan = (planId: PlanId, field: string, value: number | boolean | null) => {
    setDraft(prev => ({
      ...prev,
      plans: {
        ...prev.plans,
        [planId]: { ...prev.plans[planId], [field]: value },
      },
    }));
  };

  const updateEntitlement = (planId: PlanId, key: EntitlementKey, value: boolean) => {
    setDraft(prev => ({
      ...prev,
      plans: {
        ...prev.plans,
        [planId]: {
          ...prev.plans[planId],
          entitlements: { ...prev.plans[planId].entitlements, [key]: value },
        },
      },
    }));
  };

  const updateMatrimony = (key: keyof PricingConfig['matrimony'], value: number) => {
    setDraft(prev => ({ ...prev, matrimony: { ...prev.matrimony, [key]: value } }));
  };

  const updatePandit = (key: keyof PricingConfig['panditDefaults'], value: number) => {
    setDraft(prev => ({ ...prev, panditDefaults: { ...prev.panditDefaults, [key]: value } }));
  };

  const updateServicePackage = (pkgId: ServicePackageId, field: 'price_paise' | 'is_active', value: number | boolean) => {
    setDraft(prev => ({
      ...prev,
      service_packages: {
        ...(prev.service_packages ?? defaultServicePackages),
        [pkgId]: {
          ...(prev.service_packages?.[pkgId] ?? defaultServicePackages[pkgId]),
          [field]: value,
        },
      },
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-heading text-xl font-bold flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Packages & Pricing
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Changes apply to new subscriptions and transactions immediately. Existing subscribers
              are not affected until renewal.
            </p>
          </div>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-lg gradient-hero text-primary-foreground text-sm font-semibold shadow-warm hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : 'Save All Changes'}
          </button>
        </div>
      </div>

      {/* Section 1: Subscription Plans */}
      <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h3 className="font-heading text-lg font-bold">Subscription Plans</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set price, member/generation limits, and feature entitlements per plan.
          </p>
        </div>
        <div className="divide-y divide-border/50">
          {planOrder.map(planId => {
            const p = draft.plans[planId];
            const isOpen = expandedPlan === planId;
            return (
              <div key={planId}>
                {/* Plan header row */}
                <button
                  type="button"
                  onClick={() => setExpandedPlan(isOpen ? null : planId)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-secondary/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-semibold font-body">{PLAN_LABELS[planId]}</span>
                    <span className="text-sm text-primary font-semibold">
                      {p.price === 0 ? 'Free' : `₹${p.price.toLocaleString('en-IN')}/yr`}
                      {p.isPreLaunch && p.preLaunchPrice !== null && p.preLaunchPrice !== undefined && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-950/40 text-green-700 font-semibold">
                          offer ₹{p.preLaunchPrice}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.maxNodes} nodes · {p.generationCap} gen
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {(Object.keys(p.entitlements) as EntitlementKey[])
                        .filter(k => p.entitlements[k])
                        .map(k => (
                          <span key={k} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                            {ENTITLEMENT_LABELS[k]}
                          </span>
                        ))}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                </button>

                {/* Expanded editor */}
                {isOpen && (
                  <div className="px-6 pb-6 bg-secondary/10 border-t border-border/40 space-y-5">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                      <NumberField
                        label="Annual Price (INR)"
                        value={p.price}
                        onChange={v => updatePlan(planId, 'price', v)}
                      />
                      <NumberField
                        label="Pre-launch Offer Price (INR)"
                        value={p.preLaunchPrice ?? 0}
                        onChange={v => updatePlan(planId, 'preLaunchPrice', v === 0 ? null : v)}
                      />
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-muted-foreground">Pre-launch Offer Active</span>
                        <div className="mt-1 flex items-center gap-2">
                          <Toggle
                            checked={p.isPreLaunch ?? false}
                            onChange={v => updatePlan(planId, 'isPreLaunch', v)}
                          />
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {p.isPreLaunch ? 'Offer showing to users' : 'Regular price shown'}
                          </span>
                        </div>
                      </div>
                      <NumberField
                        label="Max Family Members"
                        value={p.maxNodes}
                        onChange={v => updatePlan(planId, 'maxNodes', v)}
                        prefix=""
                        suffix="nodes"
                      />
                      <NumberField
                        label="Generation Cap"
                        value={p.generationCap}
                        onChange={v => updatePlan(planId, 'generationCap', v)}
                        prefix=""
                        suffix="gen"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                        Feature Entitlements
                      </p>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {(Object.keys(ENTITLEMENT_LABELS) as EntitlementKey[]).map(key => (
                          <div key={key} className="flex items-center justify-between bg-card rounded-lg px-3 py-2 border border-border/40">
                            <span className="text-sm font-body">{ENTITLEMENT_LABELS[key]}</span>
                            <Toggle
                              checked={p.entitlements[key]}
                              onChange={v => updateEntitlement(planId, key, v)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Matrimony Transaction Fees */}
      <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card">
        <h3 className="font-heading text-lg font-bold mb-1 flex items-center gap-2">
          <IndianRupee className="w-5 h-5 text-primary" />
          Matrimony Transaction Fees
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Per-transaction charges shown to users at each matrimony flow stage.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NumberField
            label="Stage 2 — Compatibility Unlock"
            value={draft.matrimony.compatibilityUnlock}
            onChange={v => updateMatrimony('compatibilityUnlock', v)}
          />
          <NumberField
            label="Stage 4 — Photo Unlock"
            value={draft.matrimony.photoUnlock}
            onChange={v => updateMatrimony('photoUnlock', v)}
          />
          <NumberField
            label="Stage 5 — Kundali Review"
            value={draft.matrimony.kundaliReview}
            onChange={v => updateMatrimony('kundaliReview', v)}
          />
          <NumberField
            label="Gotra Consultation"
            value={draft.matrimony.gotraConsultation}
            onChange={v => updateMatrimony('gotraConsultation', v)}
          />
          <NumberField
            label="Full Family Onboarding"
            value={draft.matrimony.fullFamilyOnboarding}
            onChange={v => updateMatrimony('fullFamilyOnboarding', v)}
          />
          <NumberField
            label="Second Pandit Opinion"
            value={draft.matrimony.secondPanditOpinion}
            onChange={v => updateMatrimony('secondPanditOpinion', v)}
          />
        </div>
      </div>

      {/* Section 3: Pandit Default Fees */}
      <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card">
        <h3 className="font-heading text-lg font-bold mb-1">Pandit Default Fee Schedule</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Platform defaults shown on Pandit badges. Each Pandit can override their own rates.
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          <NumberField
            label="Kundali Milan Review"
            value={draft.panditDefaults.kundaliMilanReview}
            onChange={v => updatePandit('kundaliMilanReview', v)}
          />
          <NumberField
            label="Gotra Consultation"
            value={draft.panditDefaults.gotraConsultation}
            onChange={v => updatePandit('gotraConsultation', v)}
          />
          <NumberField
            label="Full Family Onboarding"
            value={draft.panditDefaults.fullFamilyOnboarding}
            onChange={v => updatePandit('fullFamilyOnboarding', v)}
          />
        </div>
      </div>

      {/* ── Section 4: Eco Service Packages ── */}
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4">
        <div>
          <h3 className="font-heading text-lg font-bold flex items-center gap-2">
            <TreePine className="w-5 h-5 text-green-600" />
            Eco Services
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Runtime price overrides for eco service packages. Changes reflect immediately on
            GET /api/services/packages — no redeploy needed.
          </p>
        </div>

        {(
          [
            { id: 'taruvara'     as ServicePackageId, icon: <TreePine className="w-4 h-4 text-green-600" />, label: 'Taruvara — 1 Tree',       hint: '₹1,499 default' },
            { id: 'dashavruksha' as ServicePackageId, icon: <TreePine className="w-4 h-4 text-emerald-600" />, label: 'Dashavruksha — 10 Trees', hint: '₹11,999 default' },
            { id: 'jala_setu'    as ServicePackageId, icon: <Droplets className="w-4 h-4 text-blue-500" />,   label: 'Jala Setu — Water Station', hint: '₹2,499 default' },
          ]
        ).map(pkg => {
          const cfg = draft.service_packages?.[pkg.id] ?? defaultServicePackages[pkg.id];
          return (
            <div key={pkg.id} className="flex items-center gap-4 flex-wrap border border-border/50 rounded-xl p-4 bg-muted/20">
              <span className="flex items-center gap-2 text-sm font-medium min-w-[200px]">
                {pkg.icon} {pkg.label}
              </span>

              {/* Price in rupees (display), stored as paise */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">₹</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={cfg.price_paise / 100}
                  onChange={e => updateServicePackage(pkg.id, 'price_paise', Math.round(parseFloat(e.target.value || '0') * 100))}
                  className="w-28 rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-right"
                />
                <span className="text-xs text-muted-foreground">{pkg.hint}</span>
              </div>

              {/* Active toggle */}
              <button
                type="button"
                onClick={() => updateServicePackage(pkg.id, 'is_active', !cfg.is_active)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  cfg.is_active
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {cfg.is_active
                  ? <><ToggleRight className="w-4 h-4" /> Active</>
                  : <><ToggleLeft className="w-4 h-4" /> Inactive</>
                }
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SalesDashboard() {
  const { session, appUser, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Role guard: only sales/admin roles may view this page
  useEffect(() => {
    if (authLoading) return;
    if (appUser && !SALES_ROLES.has(appUser.role)) {
      navigate('/time-bank', { replace: true });
    }
  }, [appUser, authLoading, navigate]);

  const [activeTab, setActiveTab] = useState<Tab>('sales');
  const [draftSettings, setDraftSettings] = useState<SalesSettings | null>(null);
  const [pricingDraft, setPricingDraft] = useState<PricingConfig>(defaultPricingConfig);

  const authFetch = async (url: string, init?: RequestInit) => {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${session?.access_token ?? ""}`,
        "Content-Type": "application/json",
      },
    });
    return res;
  };

  // ── Sales dashboard query ──
  const { data, isLoading, isError } = useQuery<DashboardPayload>({
    queryKey: ["sales-dashboard"],
    queryFn: async () => {
      const res = await authFetch(`${getApiBaseUrl()}/api/sales/dashboard`);
      if (!res.ok) throw new Error("Failed to load sales dashboard");
      return res.json() as Promise<DashboardPayload>;
    },
    enabled: !!session?.access_token,
  });

  // ── Pricing config query ──
  useQuery<PricingConfig>({
    queryKey: ["pricing-config"],
    queryFn: async () => {
      const res = await authFetch(`${getApiBaseUrl()}/api/admin/pricing-config`);
      if (!res.ok) return defaultPricingConfig;
      const remote = await res.json() as PricingConfig;
      setPricingDraft(remote);
      return remote;
    },
    enabled: !!session?.access_token,
    // If endpoint isn't wired yet, silently fall back to defaults
    retry: false,
  });

  // ── Sales settings mutation ──
  const saveSettingsMutation = useMutation({
    mutationFn: async (payload: SalesSettings) => {
      const res = await authFetch(`${getApiBaseUrl()}/api/sales/settings`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail ?? "Failed to save settings");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Sales settings updated." });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  // ── Pricing config mutation ──
  const savePricingMutation = useMutation({
    mutationFn: async (payload: PricingConfig) => {
      const res = await authFetch(`${getApiBaseUrl()}/api/admin/pricing-config`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail ?? "Failed to save pricing config");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pricing saved", description: "New prices are live for all new transactions." });
      qc.invalidateQueries({ queryKey: ["pricing-config"] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const settings = draftSettings ?? data?.settings ?? null;
  const visibleRows = data?.rows ?? [];
  const totals = data?.totals ?? { personal_sales: 0, team_sales: 0, pending_support_cases: 0 };
  const visibleLevel = data?.visible_role ?? null;
  const myRole = data?.my_role ?? "unknown";
  const canEditPricing = !!data?.can_edit_settings;

  const grossDirectPayout = useMemo(
    () => (settings ? totals.personal_sales * settings.se_direct_incentive : 0),
    [settings, totals.personal_sales],
  );
  const grossCpOverridePayout = useMemo(
    () => (settings && visibleLevel === "se" ? totals.personal_sales * settings.cp_override : 0),
    [settings, totals.personal_sales, visibleLevel],
  );
  const companyRetained = useMemo(
    () =>
      settings
        ? Math.max(settings.product_price * totals.personal_sales - grossDirectPayout - grossCpOverridePayout, 0)
        : 0,
    [settings, totals.personal_sales, grossCpOverridePayout, grossDirectPayout],
  );

  const updateSetting = (field: keyof SalesSettings, value: string) => {
    const numeric = Math.max(Number(value) || 0, 0);
    const base = draftSettings ?? data?.settings;
    if (!base) return;
    setDraftSettings({ ...base, [field]: numeric });
  };

  if (authLoading || isLoading) {
    return (
      <AppShell>
        <div className="container py-8 text-muted-foreground font-body">Loading dashboard…</div>
      </AppShell>
    );
  }

  // Guard: should have already redirected, but show nothing while redirecting
  if (!appUser || !SALES_ROLES.has(appUser.role)) {
    return (
      <AppShell>
        <div className="container py-20 text-center">
          <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="font-heading font-bold text-lg mb-2">Access Restricted</p>
          <p className="text-sm text-muted-foreground font-body">This page is only available to sales team members and administrators.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container py-8 space-y-6">

        {/* Page header */}
        <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Admin Command Center</p>
              <h1 className="font-heading text-3xl font-bold">Sales Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Your role: <span className="font-semibold text-foreground">{myRole}</span>
              </p>
            </div>
            {visibleLevel && (
              <div className="text-sm rounded-lg bg-secondary px-3 py-2">
                Visibility: one level below ({visibleLevel})
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 border-b border-border/60 -mx-6 px-6">
            {(['sales', 'pricing'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 px-4 text-sm font-semibold font-body transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'sales' ? 'Sales' : 'Packages & Pricing'}
                {tab === 'pricing' && !canEditPricing && (
                  <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    VIEW ONLY
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── PRICING TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'pricing' && (
          <>
            {!canEditPricing && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-3 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Read-only view. Only Superadmin can edit pricing.
              </div>
            )}
            <PricingTab
              draft={pricingDraft}
              setDraft={canEditPricing ? setPricingDraft : () => {}}
              onSave={() => savePricingMutation.mutate(pricingDraft)}
              isSaving={savePricingMutation.isPending}
            />
          </>
        )}

        {/* ── SALES TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'sales' && (
          <>
            {isError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive p-4 text-sm">
                Could not load sales data from API. Verify backend and auth.
              </div>
            )}

            {canEditPricing && settings && (
              <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card">
                <h2 className="font-heading text-xl font-bold mb-4 flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-primary" />
                  Sales Commission Settings
                </h2>
                <div className="grid md:grid-cols-3 gap-3">
                  {(
                    [
                      ['product_price', 'Product Price (INR)'],
                      ['se_direct_incentive', 'SE Direct Incentive'],
                      ['cp_override', 'CP Team Override'],
                      ['rp_trade_discount', 'RP Trade Discount (%)'],
                      ['zp_trade_discount', 'ZP Trade Discount (%)'],
                      ['np_trade_discount', 'NP Trade Discount (%)'],
                    ] as [keyof SalesSettings, string][]
                  ).map(([field, label]) => (
                    <label key={field} className="text-sm">
                      {label}
                      <input
                        value={settings[field]}
                        onChange={e => updateSetting(field, e.target.value)}
                        type="number"
                        className="mt-1 w-full rounded-lg border border-input px-3 py-2 bg-background"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => draftSettings && saveSettingsMutation.mutate(draftSettings)}
                    disabled={!draftSettings || saveSettingsMutation.isPending}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
                  >
                    {saveSettingsMutation.isPending ? "Saving…" : "Save commission settings"}
                  </button>
                </div>
              </div>
            )}

            {!visibleLevel && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                Role not mapped to sales hierarchy. Set one of: SE, CP, RP, ZP, NP, or Superadmin.
              </div>
            )}

            {myRole === "se" && (
              <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                SE users have no lower level. Use this page for personal targets and support tracking.
              </div>
            )}

            {visibleLevel && (
              <>
                <div className="grid sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Personal sales', value: totals.personal_sales },
                    { label: 'Team sales', value: totals.team_sales },
                    { label: 'Open support cases', value: totals.pending_support_cases },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-card rounded-xl border border-border/50 p-4 shadow-card">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-2xl font-heading font-bold">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card">
                  <h2 className="font-heading text-xl font-bold mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    {visibleLevel.toUpperCase()} performance (one level below)
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2">Name</th>
                          <th className="text-left py-2">Level</th>
                          <th className="text-right py-2">Personal</th>
                          <th className="text-right py-2">Team</th>
                          <th className="text-right py-2">Support</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map(m => (
                          <tr key={m.user_id} className="border-b border-border/60">
                            <td className="py-2">{m.name}</td>
                            <td className="py-2 uppercase">{m.level}</td>
                            <td className="py-2 text-right">{m.personal_sales}</td>
                            <td className="py-2 text-right">{m.team_sales}</td>
                            <td className="py-2 text-right">{m.pending_support_cases}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card">
                  <h2 className="font-heading text-xl font-bold mb-4 flex items-center gap-2">
                    <BadgeIndianRupee className="w-5 h-5 text-primary" />
                    Payout snapshot (visible scope)
                  </h2>
                  <div className="grid sm:grid-cols-3 gap-4 text-sm">
                    {[
                      { label: 'Direct incentive payout', value: grossDirectPayout },
                      { label: 'CP override payout',       value: grossCpOverridePayout },
                      { label: 'Company retained (est.)',  value: companyRetained },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-muted-foreground">{label}</p>
                        <p className="font-semibold">INR {value.toLocaleString('en-IN')}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card">
                  <h2 className="font-heading text-xl font-bold mb-4 flex items-center gap-2">
                    <Handshake className="w-5 h-5 text-primary" />
                    Support actions for {visibleLevel.toUpperCase()}
                  </h2>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li>Review pending support cases every day and close top blockers first.</li>
                    <li>Run one weekly enablement session focused on conversion objections.</li>
                    <li>Escalate payout disputes with transaction IDs and affected member IDs.</li>
                  </ul>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
