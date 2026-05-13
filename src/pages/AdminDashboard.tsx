import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  getApiBaseUrl,
  fetchContentQueue, approveContent, rejectContent, triggerContentGeneration,
} from "@/services/api";
import type { GeneratedContentItem, ContentType } from "@/services/api";
import {
  defaultPricingConfig, defaultServicePackages, planOrder,
  type PricingConfig, type PlanId, type EntitlementKey, type ServicePackageId,
} from "@/config/packages.config";
import {
  Users, TrendingUp, Package, FileText, Receipt, Landmark, ShieldCheck,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Tag, TreePine, Droplets,
  IndianRupee, AlertCircle, Settings2, BadgeIndianRupee,
  Loader2, CheckCircle2, XCircle, Send, RefreshCw, Instagram, Youtube,
  ShieldAlert, Menu, X, LogOut, Link2, Copy, Trash2, ChevronRight, LayoutDashboard,
} from "lucide-react";

// ─── Tab config ───────────────────────────────────────────────────────────────

type AdminTabId = "users" | "sales" | "pricing" | "content" | "transactions" | "payouts" | "kyc-support" | "referrals";

const TAB_CONFIG: { id: AdminTabId; label: string; icon: React.ReactNode; roles: UserRole[] }[] = [
  { id: "users",        label: "Users",         icon: <Users className="w-4 h-4" />,        roles: ["superadmin"] },
  { id: "sales",        label: "Sales",         icon: <TrendingUp className="w-4 h-4" />,   roles: ["superadmin", "admin"] },
  { id: "pricing",      label: "Pricing",       icon: <Package className="w-4 h-4" />,      roles: ["superadmin"] },
  { id: "content",      label: "Content",       icon: <FileText className="w-4 h-4" />,     roles: ["superadmin", "admin"] },
  { id: "transactions", label: "Transactions",  icon: <Receipt className="w-4 h-4" />,      roles: ["superadmin", "finance"] },
  { id: "payouts",      label: "Payouts",       icon: <Landmark className="w-4 h-4" />,     roles: ["superadmin", "finance"] },
  { id: "kyc-support",  label: "KYC & Support", icon: <ShieldCheck className="w-4 h-4" />, roles: ["superadmin", "admin", "office"] },
  { id: "referrals",    label: "Referrals",     icon: <Link2 className="w-4 h-4" />,        roles: ["superadmin", "admin"] },
];

const ALLOWED_ROLES: Set<UserRole> = new Set(["superadmin", "admin", "office", "finance"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function Spinner() {
  return <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
}

function NumberField({ label, value, onChange, prefix = "₹", suffix = "" }: {
  label: string; value: number; onChange: (v: number) => void; prefix?: string; suffix?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-1 rounded-lg border border-input bg-background px-3 py-2">
        {prefix && <span className="text-muted-foreground text-xs">{prefix}</span>}
        <input type="number" min={0} value={value}
          onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="flex-1 bg-transparent outline-none text-sm" />
        {suffix && <span className="text-muted-foreground text-xs">{suffix}</span>}
      </div>
    </label>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full transition-colors ${
        checked ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
      }`}>
      {checked ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
      {checked ? "On" : "Off"}
    </button>
  );
}

const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  culturalFields: "Cultural Fields", discovery: "Discovery", connectionChains: "Connection Chains",
  panditVerification: "Margdarshak Verification", matrimony: "Matrimony", sosAlerts: "SOS Alerts",
  treeAnnounce: "Tree Broadcast",
};

const PLAN_LABELS: Record<PlanId, string> = {
  beej: "Beej (Free)", ankur: "Ankur — ₹2,100/yr", vriksh: "Vriksh — ₹4,900/yr", vansh: "Vansh — ₹7,900/yr",
};

// ─── Pricing Tab ──────────────────────────────────────────────────────────────

function PricingTab({ draft, setDraft, onSave, isSaving }: {
  draft: PricingConfig;
  setDraft: React.Dispatch<React.SetStateAction<PricingConfig>>;
  onSave: () => void;
  isSaving: boolean;
}) {
  const [expandedPlan, setExpandedPlan] = useState<PlanId | null>("beej");

  const updPlan = (id: PlanId, f: string, v: number | boolean | null) =>
    setDraft(p => ({ ...p, plans: { ...p.plans, [id]: { ...p.plans[id], [f]: v } } }));

  const updEnt = (id: PlanId, k: EntitlementKey, v: boolean) =>
    setDraft(p => ({ ...p, plans: { ...p.plans, [id]: { ...p.plans[id], entitlements: { ...p.plans[id].entitlements, [k]: v } } } }));

  const updMatrimony = (k: keyof PricingConfig["matrimony"], v: number) =>
    setDraft(p => ({ ...p, matrimony: { ...p.matrimony, [k]: v } }));

  const updPandit = (k: keyof PricingConfig["panditDefaults"], v: number) =>
    setDraft(p => ({ ...p, panditDefaults: { ...p.panditDefaults, [k]: v } }));

  const updPkg = (id: ServicePackageId, f: "price_paise" | "is_active", v: number | boolean) =>
    setDraft(p => ({ ...p, service_packages: { ...(p.service_packages ?? defaultServicePackages), [id]: { ...(p.service_packages?.[id] ?? defaultServicePackages[id]), [f]: v } } }));

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-heading text-xl font-bold flex items-center gap-2"><Package className="w-5 h-5 text-primary" /> Packages & Pricing</h2>
          <p className="text-sm text-muted-foreground mt-1">Changes apply to new subscriptions immediately.</p>
        </div>
        <button onClick={onSave} disabled={isSaving}
          className="px-5 py-2.5 rounded-lg gradient-hero text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
          {isSaving ? "Saving…" : "Save All Changes"}
        </button>
      </div>

      {/* Subscription Plans */}
      <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h3 className="font-heading text-lg font-bold">Subscription Plans</h3>
        </div>
        <div className="divide-y divide-border/50">
          {planOrder.map(planId => {
            const p = draft.plans[planId];
            const isOpen = expandedPlan === planId;
            return (
              <div key={planId}>
                <button type="button" onClick={() => setExpandedPlan(isOpen ? null : planId)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-secondary/30 transition-colors text-left">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="font-semibold font-body">{PLAN_LABELS[planId]}</span>
                    <span className="text-sm text-primary font-semibold">
                      {p.price === 0 ? "Free" : `₹${p.price.toLocaleString("en-IN")}/yr`}
                      {p.isPreLaunch && p.preLaunchPrice != null && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-950/40 text-green-700 font-semibold">
                          offer ₹{p.preLaunchPrice}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">{p.maxNodes} nodes · {p.generationCap} gen</span>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-6 pb-6 bg-secondary/10 border-t border-border/40 space-y-5">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                      <NumberField label="Annual Price (INR)" value={p.price} onChange={v => updPlan(planId, "price", v)} />
                      <NumberField label="Pre-launch Offer Price" value={p.preLaunchPrice ?? 0} onChange={v => updPlan(planId, "preLaunchPrice", v === 0 ? null : v)} />
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-muted-foreground">Pre-launch Active</span>
                        <div className="mt-1 flex items-center gap-2">
                          <Toggle checked={p.isPreLaunch ?? false} onChange={v => updPlan(planId, "isPreLaunch", v)} />
                          <span className="text-xs text-muted-foreground flex items-center gap-1"><Tag className="w-3 h-3" />{p.isPreLaunch ? "Offer showing" : "Regular price"}</span>
                        </div>
                      </div>
                      <NumberField label="Max Family Members" value={p.maxNodes} onChange={v => updPlan(planId, "maxNodes", v)} prefix="" suffix="nodes" />
                      <NumberField label="Generation Cap" value={p.generationCap} onChange={v => updPlan(planId, "generationCap", v)} prefix="" suffix="gen" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Feature Entitlements</p>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {(Object.keys(ENTITLEMENT_LABELS) as EntitlementKey[]).map(key => (
                          <div key={key} className="flex items-center justify-between bg-card rounded-lg px-3 py-2 border border-border/40">
                            <span className="text-sm font-body">{ENTITLEMENT_LABELS[key]}</span>
                            <Toggle checked={p.entitlements[key]} onChange={v => updEnt(planId, key, v)} />
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

      {/* Matrimony Fees */}
      <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card">
        <h3 className="font-heading text-lg font-bold mb-4 flex items-center gap-2"><IndianRupee className="w-5 h-5 text-primary" /> Matrimony Transaction Fees</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {([
            ["compatibilityUnlock", "Stage 2 — Compatibility Unlock"],
            ["photoUnlock", "Stage 4 — Photo Unlock"],
            ["kundaliReview", "Stage 5 — Kundali Review"],
            ["gotraConsultation", "Gotra Consultation"],
            ["fullFamilyOnboarding", "Full Family Onboarding"],
            ["secondPanditOpinion", "Second Pandit Opinion"],
          ] as [keyof PricingConfig["matrimony"], string][]).map(([k, label]) => (
            <NumberField key={k} label={label} value={draft.matrimony[k]} onChange={v => updMatrimony(k, v)} />
          ))}
        </div>
      </div>

      {/* Pandit Fees */}
      <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card">
        <h3 className="font-heading text-lg font-bold mb-4">Pandit Default Fee Schedule</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <NumberField label="Kundali Milan Review" value={draft.panditDefaults.kundaliMilanReview} onChange={v => updPandit("kundaliMilanReview", v)} />
          <NumberField label="Gotra Consultation" value={draft.panditDefaults.gotraConsultation} onChange={v => updPandit("gotraConsultation", v)} />
          <NumberField label="Full Family Onboarding" value={draft.panditDefaults.fullFamilyOnboarding} onChange={v => updPandit("fullFamilyOnboarding", v)} />
        </div>
      </div>

      {/* Eco Services */}
      <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card space-y-4">
        <h3 className="font-heading text-lg font-bold flex items-center gap-2"><TreePine className="w-5 h-5 text-green-600" /> Eco Services</h3>
        {([
          { id: "taruvara" as ServicePackageId, icon: <TreePine className="w-4 h-4 text-green-600" />, label: "Taruvara — 1 Tree", hint: "₹1,499 default" },
          { id: "dashavruksha" as ServicePackageId, icon: <TreePine className="w-4 h-4 text-emerald-600" />, label: "Dashavruksha — 10 Trees", hint: "₹11,999 default" },
          { id: "jala_setu" as ServicePackageId, icon: <Droplets className="w-4 h-4 text-blue-500" />, label: "Jala Setu — Water Station", hint: "₹2,499 default" },
        ]).map(pkg => {
          const cfg = draft.service_packages?.[pkg.id] ?? defaultServicePackages[pkg.id];
          return (
            <div key={pkg.id} className="flex items-center gap-4 flex-wrap border border-border/50 rounded-xl p-4 bg-muted/20">
              <span className="flex items-center gap-2 text-sm font-medium min-w-[200px]">{pkg.icon} {pkg.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">₹</span>
                <input type="number" min={0} step={1} value={cfg.price_paise / 100}
                  onChange={e => updPkg(pkg.id, "price_paise", Math.round(parseFloat(e.target.value || "0") * 100))}
                  className="w-28 rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-right" />
                <span className="text-xs text-muted-foreground">{pkg.hint}</span>
              </div>
              <button type="button" onClick={() => updPkg(pkg.id, "is_active", !cfg.is_active)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${cfg.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/40" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
                {cfg.is_active ? <><ToggleRight className="w-4 h-4" /> Active</> : <><ToggleLeft className="w-4 h-4" /> Inactive</>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sales Tab ────────────────────────────────────────────────────────────────

type SalesSettings = { product_price: number; se_direct_incentive: number; cp_override: number; rp_trade_discount: number; zp_trade_discount: number; np_trade_discount: number };
type SalesRow = { user_id: string; name: string; level: string; personal_sales: number; team_sales: number; pending_support_cases: number };
type DashboardPayload = { my_role: string; visible_role: string | null; can_edit_settings: boolean; settings: SalesSettings; rows: SalesRow[]; totals: { personal_sales: number; team_sales: number; pending_support_cases: number } };

function SalesTab({ token }: { token: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<SalesSettings | null>(null);

  const { data, isLoading, isError } = useQuery<DashboardPayload>({
    queryKey: ["sales-dashboard"],
    queryFn: async () => {
      const r = await fetch(`${getApiBaseUrl()}/api/sales/dashboard`, { headers: authHeaders(token) });
      if (!r.ok) throw new Error("Failed to load sales dashboard");
      return r.json();
    },
    enabled: !!token,
  });

  const saveMut = useMutation({
    mutationFn: async (payload: SalesSettings) => {
      const r = await fetch(`${getApiBaseUrl()}/api/sales/settings`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json().catch(() => ({})) as { detail?: string }; throw new Error(e.detail ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => { toast({ title: "Saved" }); qc.invalidateQueries({ queryKey: ["sales-dashboard"] }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const settings = draft ?? data?.settings ?? null;
  const totals = data?.totals ?? { personal_sales: 0, team_sales: 0, pending_support_cases: 0 };
  const visibleLevel = data?.visible_role ?? null;
  const myRole = data?.my_role ?? "—";
  const canEdit = !!data?.can_edit_settings;

  const directPayout = useMemo(() => settings ? totals.personal_sales * settings.se_direct_incentive : 0, [settings, totals.personal_sales]);
  const cpPayout = useMemo(() => (settings && visibleLevel === "se" ? totals.personal_sales * settings.cp_override : 0), [settings, totals.personal_sales, visibleLevel]);
  const retained = useMemo(() => settings ? Math.max(settings.product_price * totals.personal_sales - directPayout - cpPayout, 0) : 0, [settings, totals.personal_sales, directPayout, cpPayout]);

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border border-border/50 p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">Your role:</span>
        <span className="font-semibold uppercase text-sm">{myRole}</span>
        {visibleLevel && <span className="ml-auto text-xs bg-secondary rounded-lg px-3 py-1">Visibility: one level below ({visibleLevel})</span>}
      </div>

      {isError && <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive p-4 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Could not load sales data.</div>}

      {canEdit && settings && (
        <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card">
          <h2 className="font-heading text-xl font-bold mb-4 flex items-center gap-2"><Settings2 className="w-5 h-5 text-primary" /> Commission Settings</h2>
          <div className="grid md:grid-cols-3 gap-3">
            {([
              ["product_price", "Product Price (INR)"], ["se_direct_incentive", "SE Direct Incentive"],
              ["cp_override", "CP Team Override"], ["rp_trade_discount", "RP Trade Discount (%)"],
              ["zp_trade_discount", "ZP Trade Discount (%)"], ["np_trade_discount", "NP Trade Discount (%)"],
            ] as [keyof SalesSettings, string][]).map(([field, label]) => (
              <label key={field} className="text-sm">{label}
                <input value={settings[field]} type="number"
                  onChange={e => { const base = draft ?? data?.settings; if (base) setDraft({ ...base, [field]: Math.max(0, Number(e.target.value) || 0) }); }}
                  className="mt-1 w-full rounded-lg border border-input px-3 py-2 bg-background" />
              </label>
            ))}
          </div>
          <button onClick={() => draft && saveMut.mutate(draft)} disabled={!draft || saveMut.isPending}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
            {saveMut.isPending ? "Saving…" : "Save commission settings"}
          </button>
        </div>
      )}

      {visibleLevel && (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            {[["Personal sales", totals.personal_sales], ["Team sales", totals.team_sales], ["Open support cases", totals.pending_support_cases]].map(([label, value]) => (
              <div key={String(label)} className="bg-card rounded-xl border border-border/50 p-4 shadow-card">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-heading font-bold">{value}</p>
              </div>
            ))}
          </div>

          <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card">
            <h2 className="font-heading text-xl font-bold mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> {visibleLevel.toUpperCase()} Performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border"><th className="text-left py-2">Name</th><th className="text-left py-2">Level</th><th className="text-right py-2">Personal</th><th className="text-right py-2">Team</th><th className="text-right py-2">Support</th></tr></thead>
                <tbody>{(data?.rows ?? []).map(m => (
                  <tr key={m.user_id} className="border-b border-border/60">
                    <td className="py-2">{m.name}</td><td className="py-2 uppercase">{m.level}</td>
                    <td className="py-2 text-right">{m.personal_sales}</td><td className="py-2 text-right">{m.team_sales}</td>
                    <td className="py-2 text-right">{m.pending_support_cases}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border/50 p-6 shadow-card">
            <h2 className="font-heading text-xl font-bold mb-4 flex items-center gap-2"><BadgeIndianRupee className="w-5 h-5 text-primary" /> Payout Snapshot</h2>
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              {[["Direct incentive payout", directPayout], ["CP override payout", cpPayout], ["Company retained (est.)", retained]].map(([label, value]) => (
                <div key={String(label)}><p className="text-muted-foreground">{label}</p><p className="font-semibold">₹{Number(value).toLocaleString("en-IN")}</p></div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Content Tab ──────────────────────────────────────────────────────────────

const CONTENT_SUBTABS: { id: ContentType; label: string; icon: React.ReactNode }[] = [
  { id: "blog_post", label: "Blog Posts", icon: <FileText className="w-4 h-4" /> },
  { id: "ig_caption", label: "Instagram",  icon: <Instagram className="w-4 h-4" /> },
  { id: "yt_short",  label: "YouTube",    icon: <Youtube className="w-4 h-4" /> },
];

function ContentTab() {
  const { toast } = useToast();
  const [tab, setTab] = useState<ContentType>("blog_post");
  const [items, setItems] = useState<GeneratedContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function load(ct: ContentType) {
    setLoading(true);
    const res = await fetchContentQueue({ content_type: ct, limit: 50 });
    setItems(res.items); setTotal(res.total); setLoading(false);
  }

  useEffect(() => { load(tab); }, [tab]);

  async function handleApprove(id: string, publishNow: boolean) {
    try {
      const res = await approveContent(id, publishNow);
      toast({ title: publishNow ? "✅ Approved & Published!" : "✅ Approved!", description: `Status: ${res.new_status}` });
      await load(tab);
    } catch (e) { toast({ title: String(e), variant: "destructive" }); }
  }

  async function handleReject() {
    if (!rejectId || rejectReason.trim().length < 5) { toast({ title: "कारण 5+ अक्षर का होना चाहिए।", variant: "destructive" }); return; }
    try {
      await rejectContent(rejectId, rejectReason.trim());
      toast({ title: "❌ Rejected." }); setRejectId(null); setRejectReason(""); await load(tab);
    } catch (e) { toast({ title: String(e), variant: "destructive" }); }
  }

  async function handleGenerate() {
    setGenerating(true);
    try { const res = await triggerContentGeneration(); toast({ title: "🌿 Generated!", description: res.message }); await load(tab); }
    catch (e) { toast({ title: String(e), variant: "destructive" }); }
    finally { setGenerating(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-xl font-bold">Content Review Queue</h2>
        <button onClick={handleGenerate} disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Generate Now
        </button>
      </div>

      <div className="flex gap-1 border-b border-border">
        {CONTENT_SUBTABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.id ? "border-green-500 text-green-700 dark:text-green-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.icon} {t.label}
            {tab === t.id && total > 0 && <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 px-1.5 rounded-full">{total}</span>}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : items.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">कोई draft content नहीं।</div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className="border border-border rounded-xl p-5 bg-card space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{item.panchang_date}</span>
                {item.vansha_id
                  ? <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 px-2 py-0.5 rounded-full">{item.family_name ?? item.vansha_id.slice(0, 8)}</span>
                  : <span className="text-xs bg-green-50 dark:bg-green-900/30 text-green-700 px-2 py-0.5 rounded-full">Generic</span>}
              </div>
              <h3 className="font-semibold text-sm">{item.title}</h3>
              {item.subtitle && <p className="text-xs text-muted-foreground">{item.subtitle}</p>}
              <p className="text-xs text-muted-foreground line-clamp-3 bg-muted/40 rounded-lg p-3">{item.body}</p>
              {item.hashtags && item.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1">{item.hashtags.slice(0, 5).map(h => <span key={h} className="text-[10px] bg-sky-50 dark:bg-sky-900/30 text-sky-700 px-1.5 rounded-full">{h}</span>)}</div>
              )}
              <div className="flex gap-2 flex-wrap pt-1">
                <button onClick={() => handleApprove(item.id, false)} className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/40 text-green-700 rounded-lg hover:bg-green-200 transition-colors font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Approve</button>
                <button onClick={() => handleApprove(item.id, true)} className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium"><Send className="w-3.5 h-3.5" /> Approve & Publish</button>
                <button onClick={() => { setRejectId(item.id); setRejectReason(""); }} className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-950/30 text-red-600 rounded-lg hover:bg-red-100 transition-colors"><XCircle className="w-3.5 h-3.5" /> Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejectId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h3 className="font-semibold">Rejection का कारण</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="कम से कम 5 अक्षर…" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none" />
            <div className="flex gap-2">
              <button onClick={handleReject} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium">Reject</button>
              <button onClick={() => setRejectId(null)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted">रद्द करें</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── All Transactions Tab ─────────────────────────────────────────────────────

type AdminTx = { id: string; user_id: string; user_name: string | null; payment_type: string; description: string; total_amount_paise: number; status: string; created_at: string; plan_id: string | null };

function AllTransactionsTab({ token }: { token: string }) {
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading, isError } = useQuery<{ items: AdminTx[]; total: number }>({
    queryKey: ["admin-transactions", statusFilter],
    queryFn: async () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const r = await fetch(`${getApiBaseUrl()}/api/admin/transactions${params}`, { headers: authHeaders(token) });
      if (!r.ok) return { items: [], total: 0 };
      return r.json();
    },
    enabled: !!token,
  });

  const fmt = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  const statusColor = (s: string) => s === "paid" ? "bg-green-100 text-green-700" : s === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="font-heading text-xl font-bold">All Transactions</h2>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
          {["all", "paid", "pending", "failed", "refunded"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {isLoading ? <Spinner /> : isError ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-xl text-sm">Failed to load transactions.</div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">No transactions found.</div>
      ) : (
        <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>{["User", "Type", "Description", "Amount", "Status", "Date"].map(h => <th key={h} className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wide">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(data?.items ?? []).map(tx => (
                  <tr key={tx.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{tx.user_name ?? tx.user_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-xs uppercase text-muted-foreground">{tx.payment_type}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">{tx.description}</td>
                    <td className="px-4 py-3 font-semibold">{fmt(tx.total_amount_paise)}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(tx.status)}`}>{tx.status}</span></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(tx.created_at).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Payouts Tab ──────────────────────────────────────────────────────────────

type Payout = { id: string; user_name: string | null; user_id: string; amount_paise: number; status: "pending" | "processing" | "paid" | "failed"; method: string; created_at: string; paid_at: string | null };

function PayoutsTab({ token }: { token: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ items: Payout[] }>({
    queryKey: ["admin-payouts"],
    queryFn: async () => {
      const r = await fetch(`${getApiBaseUrl()}/api/admin/payouts`, { headers: authHeaders(token) });
      if (!r.ok) return { items: [] };
      return r.json();
    },
    enabled: !!token,
  });

  const markPaidMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${getApiBaseUrl()}/api/admin/payouts/${id}/mark-paid`, { method: "POST", headers: authHeaders(token) });
      if (!r.ok) throw new Error("Failed to mark paid");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Payout marked as paid" }); qc.invalidateQueries({ queryKey: ["admin-payouts"] }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const fmt = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  const items = data?.items ?? [];
  const pendingTotal = items.filter(p => p.status === "pending").reduce((s, p) => s + p.amount_paise, 0);

  const statusColor = (s: string) =>
    s === "paid" ? "bg-green-100 text-green-700" : s === "pending" ? "bg-amber-100 text-amber-700" :
    s === "failed" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="font-heading text-xl font-bold">Payouts</h2>
        {pendingTotal > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-800 text-sm px-4 py-2 rounded-lg font-medium">
            Pending: {fmt(pendingTotal)}
          </div>
        )}
      </div>
      {isLoading ? <Spinner /> : items.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">No payouts found.</div>
      ) : (
        <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>{["Recipient", "Amount", "Method", "Status", "Date", "Action"].map(h => <th key={h} className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wide">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {items.map(p => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{p.user_name ?? p.user_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-semibold">{fmt(p.amount_paise)}</td>
                    <td className="px-4 py-3 text-xs uppercase text-muted-foreground">{p.method}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(p.status)}`}>{p.status}</span></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(p.created_at).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3">
                      {p.status === "pending" && (
                        <button onClick={() => markPaidMut.mutate(p.id)} disabled={markPaidMut.isPending}
                          className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-60">Mark Paid</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

type AdminUser = { id: string; full_name: string | null; phone: string | null; role: UserRole; kutumb_id: string | null; onboarding_complete: boolean; created_at: string };

const ALL_ROLES: UserRole[] = ["user", "margdarshak", "admin", "superadmin", "office", "finance", "se", "cp", "rp", "zp", "np"];

const roleColor = (r: string) =>
  r === "superadmin" ? "bg-purple-100 text-purple-700" : r === "admin" ? "bg-blue-100 text-blue-700" :
  r === "finance" ? "bg-green-100 text-green-700" : r === "office" ? "bg-amber-100 text-amber-700" :
  r === "margdarshak" ? "bg-rose-100 text-rose-700" : "bg-muted text-muted-foreground";

function UsersTab({ token }: { token: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<UserRole>("user");

  const { data, isLoading } = useQuery<{ items: AdminUser[]; total: number }>({
    queryKey: ["admin-users", search],
    queryFn: async () => {
      const params = search ? `?q=${encodeURIComponent(search)}` : "";
      const r = await fetch(`${getApiBaseUrl()}/api/admin/users${params}`, { headers: authHeaders(token) });
      if (!r.ok) return { items: [], total: 0 };
      return r.json();
    },
    enabled: !!token,
  });

  const updateRoleMut = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
      const r = await fetch(`${getApiBaseUrl()}/api/admin/users/${userId}/role`, {
        method: "PUT", headers: authHeaders(token), body: JSON.stringify({ role }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})) as { detail?: string }; throw new Error(e.detail ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => { toast({ title: "Role updated" }); qc.invalidateQueries({ queryKey: ["admin-users"] }); setEditingId(null); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="font-heading text-xl font-bold">User Management</h2>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone…"
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm w-64" />
      </div>
      {isLoading ? <Spinner /> : (data?.items ?? []).length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">No users found.</div>
      ) : (
        <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
          <div className="px-4 py-2 bg-muted/40 border-b border-border text-xs text-muted-foreground">
            {data?.total ?? 0} users total
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/20">
                <tr>{["Name", "Phone", "Kutumb ID", "Role", "Status", "Action"].map(h => <th key={h} className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wide">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(data?.items ?? []).map(u => (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{u.full_name ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{u.phone ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{u.kutumb_id ?? "—"}</td>
                    <td className="px-4 py-3">
                      {editingId === u.id ? (
                        <div className="flex items-center gap-2">
                          <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)} className="rounded border border-input bg-background px-2 py-1 text-xs">
                            {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <button onClick={() => updateRoleMut.mutate({ userId: u.id, role: newRole })} disabled={updateRoleMut.isPending}
                            className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded disabled:opacity-60">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 border border-border rounded hover:bg-muted">✕</button>
                        </div>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(u.role)}`}>{u.role}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.onboarding_complete ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        {u.onboarding_complete ? "Active" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {editingId !== u.id && (
                        <button onClick={() => { setEditingId(u.id); setNewRole(u.role); }} className="text-xs text-primary hover:underline">Edit role</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KYC & Support Tab ────────────────────────────────────────────────────────

type KycItem = { id: string; user_name: string | null; phone: string | null; kyc_type: string; status: string; submitted_at: string };
type SupportTicket = { id: string; user_name: string | null; subject: string; status: string; priority: string; created_at: string };

function KYCSupportTab({ token }: { token: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [subtab, setSubtab] = useState<"kyc" | "support">("kyc");

  const { data: kycData, isLoading: kycLoading } = useQuery<{ items: KycItem[] }>({
    queryKey: ["admin-kyc"],
    queryFn: async () => {
      const r = await fetch(`${getApiBaseUrl()}/api/admin/kyc-queue`, { headers: authHeaders(token) });
      if (!r.ok) return { items: [] };
      return r.json();
    },
    enabled: !!token,
  });

  const { data: ticketData, isLoading: ticketLoading } = useQuery<{ items: SupportTicket[] }>({
    queryKey: ["admin-support"],
    queryFn: async () => {
      const r = await fetch(`${getApiBaseUrl()}/api/admin/support-tickets`, { headers: authHeaders(token) });
      if (!r.ok) return { items: [] };
      return r.json();
    },
    enabled: !!token,
  });

  const kycAction = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "reject" }) => {
      const r = await fetch(`${getApiBaseUrl()}/api/admin/kyc-queue/${id}/${action}`, { method: "POST", headers: authHeaders(token) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (_, { action }) => { toast({ title: action === "approve" ? "KYC Approved" : "KYC Rejected" }); qc.invalidateQueries({ queryKey: ["admin-kyc"] }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const closeTicket = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${getApiBaseUrl()}/api/admin/support-tickets/${id}/close`, { method: "POST", headers: authHeaders(token) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Ticket closed" }); qc.invalidateQueries({ queryKey: ["admin-support"] }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const kycItems = kycData?.items ?? [];
  const ticketItems = ticketData?.items ?? [];
  const pendingKyc = kycItems.filter(k => k.status === "pending").length;

  const priorityColor = (p: string) => p === "high" ? "bg-red-100 text-red-700" : p === "medium" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground";
  const kycStatusColor = (s: string) => s === "approved" ? "bg-green-100 text-green-700" : s === "pending" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="font-heading text-xl font-bold">KYC & Support</h2>
        <div className="flex gap-1 bg-muted rounded-lg p-1 ml-auto">
          {(["kyc", "support"] as const).map(s => (
            <button key={s} onClick={() => setSubtab(s)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${subtab === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {s === "kyc" ? "KYC Queue" : "Support Tickets"}
              {s === "kyc" && pendingKyc > 0 && <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 rounded-full">{pendingKyc}</span>}
            </button>
          ))}
        </div>
      </div>

      {subtab === "kyc" && (
        kycLoading ? <Spinner /> : kycItems.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">No KYC applications pending.</div>
        ) : (
          <div className="space-y-3">
            {kycItems.map(item => (
              <div key={item.id} className="bg-card border border-border/50 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium text-sm">{item.user_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{item.phone} · {item.kyc_type} · {new Date(item.submitted_at).toLocaleDateString("en-IN")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${kycStatusColor(item.status)}`}>{item.status}</span>
                  {item.status === "pending" && (
                    <>
                      <button onClick={() => kycAction.mutate({ id: item.id, action: "approve" })} disabled={kycAction.isPending}
                        className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-60">Approve</button>
                      <button onClick={() => kycAction.mutate({ id: item.id, action: "reject" })} disabled={kycAction.isPending}
                        className="text-xs px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg disabled:opacity-60">Reject</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {subtab === "support" && (
        ticketLoading ? <Spinner /> : ticketItems.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">No open support tickets.</div>
        ) : (
          <div className="space-y-3">
            {ticketItems.map(ticket => (
              <div key={ticket.id} className="bg-card border border-border/50 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium text-sm">{ticket.subject}</p>
                  <p className="text-xs text-muted-foreground">{ticket.user_name} · {new Date(ticket.created_at).toLocaleDateString("en-IN")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor(ticket.priority)}`}>{ticket.priority}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ticket.status === "open" ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>{ticket.status}</span>
                  {ticket.status === "open" && (
                    <button onClick={() => closeTicket.mutate(ticket.id)} disabled={closeTicket.isPending}
                      className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg disabled:opacity-60">Close</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── ReferralsTab ─────────────────────────────────────────────────────────────

interface InviteCodeRow {
  id: string; code: string; created_for: string | null;
  status: "active" | "used" | "revoked"; created_at: string;
  used_at: string | null;
  creator: { id?: string; full_name?: string | null; role?: string; phone?: string | null } | null;
  user_info: { id?: string; full_name?: string | null; role?: string } | null;
}
interface ReferralStats { total: number; used: number; active: number; revoked: number; unique_generators: number; }
interface UserHistory {
  profile: { id: string; full_name: string | null; role: string; phone: string | null; kutumb_id: string | null; created_at: string } | null;
  codes_created: InviteCodeRow[];
  joined_via: InviteCodeRow | null;
  referral_events: { id: string; event_type: string; created_at: string; kutumb_id_used: string }[];
  performance?: { total_score: number; tier: string; events: Array<{ event_type: string; weight: number; created_at: string }> };
}

interface LeaderboardRow {
  user_id: string; rank: number; total: number; tier: string;
  by_type: Record<string, number>;
  profile: { full_name?: string | null; role?: string; phone?: string | null } | null;
}

const TIER_COLORS: Record<string, string> = {
  platinum: "text-slate-600",
  gold:     "text-amber-600",
  silver:   "text-gray-500",
  bronze:   "text-orange-700",
};

function ReferralsTab({ token }: { token: string }) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const [drillUserId, setDrillUserId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"leaderboard" | "codes">("leaderboard");

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const { data: stats, isLoading: sLoad } = useQuery<ReferralStats>({
    queryKey: ["admin-ref-stats"],
    queryFn: () => fetch(`${base}/api/referral/admin/stats`, { headers }).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    staleTime: 30_000,
  });

  const { data: leaderboard = [], isLoading: lbLoad } = useQuery<LeaderboardRow[]>({
    queryKey: ["admin-ref-leaderboard"],
    queryFn: () => fetch(`${base}/api/referral/admin/leaderboard?limit=50`, { headers }).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    staleTime: 60_000,
  });

  const { data: allData, isLoading: cLoad, refetch } = useQuery<{ codes: InviteCodeRow[]; total: number }>({
    queryKey: ["admin-ref-all"],
    queryFn: () => fetch(`${base}/api/referral/admin/all?limit=300`, { headers }).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    staleTime: 30_000,
    enabled: activeSection === "codes",
  });

  const { data: history, isLoading: hLoad } = useQuery<UserHistory>({
    queryKey: ["admin-ref-user", drillUserId],
    queryFn: () => fetch(`${base}/api/referral/admin/user/${drillUserId!}`, { headers }).then(r => { if (!r.ok) throw new Error(r.status.toString()); return r.json(); }),
    enabled: !!drillUserId,
    staleTime: 30_000,
  });

  const codes = allData?.codes ?? [];

  function copyLink(code: string) {
    void navigator.clipboard.writeText(`${window.location.origin}/?ref=${code}`);
    toast({ title: "Invite link copied!" });
  }

  const statusBadge = (s: string) => {
    if (s === "active")  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">Active</span>;
    if (s === "used")    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700"><CheckCircle2 size={9}/> Used</span>;
    return                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">Revoked</span>;
  };

  const codes = allData?.codes ?? [];

  return (
    <div className="space-y-6">
      {/* Invite code stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Codes Generated", value: stats?.total ?? "—" },
          { label: "Used",            value: stats?.used    ?? "—", accent: true },
          { label: "Active",          value: stats?.active  ?? "—" },
          { label: "Revoked",         value: stats?.revoked ?? "—" },
          { label: "Unique Generators", value: stats?.unique_generators ?? "—" },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border p-4 ${k.accent ? "border-emerald-200 bg-emerald-50" : "border-border bg-card"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 ${k.accent ? "text-emerald-700" : ""}`}>{sLoad ? "…" : String(k.value)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left panel — leaderboard + codes toggle */}
        <div className="lg:col-span-2 space-y-4">
          {/* Section toggle */}
          <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
            {(["leaderboard", "codes"] as const).map(s => (
              <button key={s} onClick={() => setActiveSection(s)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors capitalize ${activeSection === s ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {s === "leaderboard" ? "Performance Leaderboard" : "Invite Codes"}
              </button>
            ))}
          </div>

          {/* Leaderboard */}
          {activeSection === "leaderboard" && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50">
                <p className="font-semibold text-sm">Top Performers</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Ranked by cumulative performance score</p>
              </div>
              {lbLoad ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground"/></div>
              ) : leaderboard.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No performance data yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        {["#", "Name", "Role", "Score", "Tier", "Breakdown"].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map(row => (
                        <tr key={row.user_id} className="border-b border-border/30 hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => setDrillUserId(row.user_id)}>
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.rank}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-xs">{row.profile?.full_name ?? row.profile?.phone ?? "—"}</p>
                          </td>
                          <td className="px-3 py-2.5 text-[10px] text-muted-foreground capitalize">{row.profile?.role}</td>
                          <td className="px-3 py-2.5 font-bold text-sm">{row.total}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-xs font-bold capitalize ${TIER_COLORS[row.tier] ?? ""}`}>{row.tier}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1 flex-wrap">
                              {Object.entries(row.by_type).map(([t, s]) => (
                                <span key={t} className="text-[9px] font-mono bg-muted px-1 py-0.5 rounded">
                                  {t.replace(/_/g," ")} {s}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Invite codes table */}
          {activeSection === "codes" && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <p className="font-semibold text-sm">All Invite Codes</p>
                <button onClick={() => void refetch()} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><RefreshCw size={13}/></button>
              </div>
              {cLoad ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground"/></div>
              ) : codes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No codes generated yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        {["Code", "For", "Creator", "Status", "Date", ""].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {codes.map(c => (
                        <tr key={c.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2 font-mono text-xs font-bold text-amber-700 tracking-widest">{c.code}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{c.created_for ?? "—"}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => setDrillUserId(c.creator?.id ?? null)}
                              className="flex items-center gap-1 text-xs hover:text-primary transition-colors">
                              {c.creator?.full_name ?? c.creator?.phone ?? "—"}
                              {c.creator?.id && <ChevronRight size={11} className="text-muted-foreground"/>}
                            </button>
                            <p className="text-[10px] text-muted-foreground capitalize">{c.creator?.role}</p>
                          </td>
                          <td className="px-3 py-2">{statusBadge(c.status)}</td>
                          <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                            {new Date(c.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </td>
                          <td className="px-3 py-2">
                            {c.status === "active" && (
                              <button onClick={() => copyLink(c.code)} title="Copy invite link"
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                                <Copy size={12}/>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Node history + performance panel */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <p className="font-semibold text-sm">Node History</p>
            {drillUserId && (
              <button onClick={() => setDrillUserId(null)} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
            )}
          </div>
          {!drillUserId ? (
            <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
              <Link2 size={28} strokeWidth={1.5}/>
              <p className="text-sm text-center px-4">Click any row to view their full history &amp; score.</p>
            </div>
          ) : hLoad ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground"/></div>
          ) : !history ? (
            <p className="text-sm text-muted-foreground text-center py-10">Not found.</p>
          ) : (
            <div className="divide-y divide-border/30 text-sm">
              {/* Profile */}
              <div className="px-4 py-3 space-y-1">
                <p className="font-semibold">{history.profile?.full_name ?? "—"}</p>
                <p className="text-xs text-muted-foreground capitalize">{history.profile?.role} · {history.profile?.phone ?? "no phone"}</p>
                {history.profile?.kutumb_id && (
                  <p className="font-mono text-[10px] text-muted-foreground">KM ID: {history.profile.kutumb_id}</p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Joined {history.profile?.created_at ? new Date(history.profile.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                </p>
              </div>

              {/* Performance score */}
              {history.performance && (
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Performance Score</p>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-2xl font-bold">{history.performance.total_score}</span>
                    <span className={`text-xs font-bold capitalize ${TIER_COLORS[history.performance.tier] ?? ""}`}>{history.performance.tier}</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {history.performance.events.slice(0, 8).map((e: { event_type: string; weight: number; created_at: string }, i: number) => (
                      <span key={i} className="text-[9px] font-mono bg-muted px-1 py-0.5 rounded">
                        {e.event_type.replace(/_/g," ")} +{e.weight}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Joined via */}
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Joined via</p>
                {history.joined_via ? (
                  <span className="font-mono text-xs font-bold text-amber-700">{history.joined_via.code}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Direct / unknown</span>
                )}
              </div>

              {/* Codes created */}
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Codes Generated ({history.codes_created.length})
                </p>
                {history.codes_created.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {history.codes_created.map(c => (
                      <div key={c.id} className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-amber-700">{c.code}</span>
                        <div className="flex items-center gap-1.5">
                          {statusBadge(c.status)}
                          {c.user_info?.full_name && (
                            <span className="text-[10px] text-muted-foreground">→ {c.user_info.full_name}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Referral events */}
              {history.referral_events.length > 0 && (
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Referral Events ({history.referral_events.length})
                  </p>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {history.referral_events.map(e => (
                      <div key={e.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground capitalize">{e.event_type.replace(/_/g, " ")}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {new Date(e.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main AdminDashboard ──────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { session, appUser, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<AdminTabId>("sales");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pricingDraft, setPricingDraft] = useState<PricingConfig>(defaultPricingConfig);

  useEffect(() => {
    if (authLoading) return;
    if (!appUser) return;
    if (appUser.role === "margdarshak") { navigate("/margdarshak", { replace: true }); return; }
    if (!ALLOWED_ROLES.has(appUser.role)) { navigate("/dashboard", { replace: true }); return; }
    const first = TAB_CONFIG.find(t => t.roles.includes(appUser.role));
    if (first) setActiveTab(first.id);
  }, [appUser, authLoading, navigate]);

  useQuery<PricingConfig>({
    queryKey: ["pricing-config"],
    queryFn: async () => {
      const r = await fetch(`${getApiBaseUrl()}/api/admin/pricing-config`, { headers: authHeaders(session?.access_token ?? "") });
      if (!r.ok) return defaultPricingConfig;
      const remote = await r.json() as PricingConfig;
      setPricingDraft(remote);
      return remote;
    },
    enabled: !!session?.access_token && appUser?.role === "superadmin",
    retry: false,
  });

  const savePricingMut = useMutation({
    mutationFn: async (payload: PricingConfig) => {
      const r = await fetch(`${getApiBaseUrl()}/api/admin/pricing-config`, {
        method: "PUT", headers: authHeaders(session?.access_token ?? ""), body: JSON.stringify(payload),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})) as { detail?: string }; throw new Error(e.detail ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => { toast({ title: "Pricing saved" }); qc.invalidateQueries({ queryKey: ["pricing-config"] }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!appUser || !ALLOWED_ROLES.has(appUser.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="font-heading font-bold text-lg">Access Restricted</p>
          <p className="text-sm text-muted-foreground">You don't have permission to view the admin dashboard.</p>
        </div>
      </div>
    );
  }

  const visibleTabs = TAB_CONFIG.filter(t => t.roles.includes(appUser.role));
  const token = session?.access_token ?? "";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-card border-r border-border/50 flex flex-col transition-transform duration-200 md:relative md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <div>
            <p className="font-heading font-bold text-base">Admin</p>
            <p className="text-xs text-muted-foreground capitalize">{appUser.role}</p>
          </div>
          <button className="md:hidden p-1 hover:bg-muted rounded" onClick={() => setSidebarOpen(false)}><X className="w-4 h-4" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleTabs.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-left ${activeTab === tab.id ? "bg-primary/10 text-primary border-r-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-border/50 space-y-2">
          <button onClick={() => navigate("/")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <LayoutDashboard className="w-3.5 h-3.5 flex-shrink-0" /> Switch to User View
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground truncate flex-1">
              {appUser.full_name ?? appUser.phone ?? appUser.id.slice(0, 12)}
            </span>
            <button onClick={() => signOut()} title="Sign out"
              className="flex-shrink-0 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="h-14 border-b border-border/50 bg-card flex items-center gap-3 px-4 flex-shrink-0">
          <button className="md:hidden p-1 hover:bg-muted rounded" onClick={() => setSidebarOpen(true)}><Menu className="w-5 h-5" /></button>
          <h1 className="font-heading font-bold">{visibleTabs.find(t => t.id === activeTab)?.label ?? "Admin"}</h1>
        </div>
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === "users"        && <UsersTab token={token} />}
          {activeTab === "sales"        && <SalesTab token={token} />}
          {activeTab === "pricing"      && <PricingTab draft={pricingDraft} setDraft={setPricingDraft} onSave={() => savePricingMut.mutate(pricingDraft)} isSaving={savePricingMut.isPending} />}
          {activeTab === "content"      && <ContentTab />}
          {activeTab === "transactions" && <AllTransactionsTab token={token} />}
          {activeTab === "payouts"      && <PayoutsTab token={token} />}
          {activeTab === "kyc-support"  && <KYCSupportTab token={token} />}
          {activeTab === "referrals"    && <ReferralsTab token={token} />}
        </main>
      </div>
    </div>
  );
}
