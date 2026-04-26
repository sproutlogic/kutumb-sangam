import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import { usePlan } from '@/contexts/PlanContext';
import { plans, planOrder, type PlanId, type EntitlementKey } from '@/config/packages.config';
import AppShell from '@/components/shells/AppShell';
import { Check, X, CreditCard, Tag, Zap, Receipt } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { getApiBaseUrl } from '@/services/api';

function getAuthToken(): string {
  try {
    const keys = Object.keys(localStorage).filter(k => k.endsWith('-auth-token'));
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (raw) { const p = JSON.parse(raw); if (p?.access_token) return p.access_token; }
    }
  } catch { /* ignore */ }
  return '';
}

const entitlementLabels: { key: EntitlementKey; label: string }[] = [
  { key: 'culturalFields',     label: 'Cultural Fields' },
  { key: 'discovery',          label: 'Discovery' },
  { key: 'connectionChains',   label: 'Connection Chains' },
  { key: 'panditVerification', label: 'Paryavaran Mitra Verification' },
  { key: 'matrimony',          label: 'Matrimony' },
  { key: 'sosAlerts',          label: 'SOS Alerts' },
  { key: 'treeAnnounce',       label: 'Tree Broadcast' },
  { key: 'ecoScore',           label: 'Prakriti Score Card' },
  { key: 'haritCircle',        label: 'Harit Circle Access' },
];

const planDisplayNames: Record<PlanId, string> = {
  beej:  'Beej',
  ankur: 'Ankur',
  vriksh:'Vriksh',
  vansh: 'Vansh',
};

const UpgradePage = () => {
  const { tr } = useLang();
  const navigate = useNavigate();
  const { planId: currentPlan, setPlanId, pricingConfig } = usePlan();
  const [processingPlan, setProcessingPlan] = useState<PlanId | null>(null);

  const handleSelectPlan = async (id: PlanId) => {
    const planLimits = pricingConfig.plans[id];
    const isPreLaunch = planLimits?.isPreLaunch ?? plans[id].isPreLaunch;
    if ((planLimits?.price ?? plans[id].price) === 0) {
      setPlanId(id);
      return;
    }
    setProcessingPlan(id);
    try {
      const token = getAuthToken();
      const res = await fetch(`${getApiBaseUrl()}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan_id: id, use_igst: true, pre_launch: isPreLaunch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? 'Order creation failed');

      // Order recorded. Gateway not live yet — show informative toast.
      toast({
        title: 'Order created',
        description: `${planDisplayNames[id]} plan order recorded (${data.display_total} incl. GST). Payment gateway coming soon.`,
      });
      // TODO: GATEWAY — open Razorpay checkout here with data.gateway_order_id + data.key_id
    } catch (err: any) {
      toast({ title: 'Could not create order', description: err?.message ?? 'Please try again.', variant: 'destructive' });
    } finally {
      setProcessingPlan(null);
    }
  };

  return (
    <AppShell>
      <div className="container py-8 px-4">
        <div className="text-center mb-10">
          <h1 className="font-heading text-3xl font-bold">{tr('upgradeTitle')}</h1>
          <div className="gold-line mx-auto mt-3 mb-3" style={{ maxWidth: '100px' }} />
          <p className="text-muted-foreground font-body">All plans billed annually · Cancel anytime</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
          {planOrder.map(id => {
            const staticPlan = plans[id];
            const runtime    = pricingConfig.plans[id];
            const price      = runtime?.price         ?? staticPlan.price;
            const prePrice   = runtime?.preLaunchPrice ?? staticPlan.preLaunchPrice;
            const isPreLaunch= runtime?.isPreLaunch    ?? staticPlan.isPreLaunch;
            const maxNodes   = runtime?.maxNodes       ?? staticPlan.maxNodes;
            const genCap     = runtime?.generationCap  ?? staticPlan.generationCap;
            const entitle    = runtime?.entitlements   ?? staticPlan.entitlements;

            const isCurrent    = id === currentPlan;
            const isFree       = price === 0;
            const isTopTier    = id === 'vansh';
            const showOffer    = isPreLaunch && prePrice !== null && prePrice < price;
            const isComingSoon = id === 'vriksh' || id === 'vansh';

            return (
              <div
                key={id}
                className={`relative bg-card rounded-2xl p-6 shadow-card border-2 transition-all flex flex-col ${
                  isComingSoon
                    ? 'border-border/30 opacity-70'
                    : isTopTier
                      ? 'border-gold/50 shadow-gold hover:border-gold/80'
                      : isCurrent
                        ? 'border-primary shadow-warm'
                        : 'border-border/50 hover:border-primary/30'
                }`}
              >
                {isTopTier && !isComingSoon && <div className="absolute inset-x-0 top-0 gold-line rounded-t-2xl" />}

                {/* Badges */}
                <div className="flex items-center gap-2 mb-3 flex-wrap min-h-[1.5rem]">
                  {isComingSoon && (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-accent/15 text-accent font-semibold font-body tracking-wide">
                      Coming Soon
                    </span>
                  )}
                  {!isComingSoon && isTopTier && (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full gradient-gold text-white font-semibold font-body shimmer flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5" /> Best Value
                    </span>
                  )}
                  {!isComingSoon && showOffer && (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 font-semibold font-body flex items-center gap-1">
                      <Tag className="w-2.5 h-2.5" /> Pre-launch Offer
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full gradient-hero text-primary-foreground font-medium font-body">
                      Current Plan
                    </span>
                  )}
                </div>

                {/* Plan name */}
                <h3 className={`font-heading text-xl font-bold mb-0.5 ${isTopTier ? 'text-gold-dark' : ''}`}>
                  {planDisplayNames[id]}
                </h3>

                {/* Pricing */}
                <div className="mb-4">
                  {isFree ? (
                    <p className="text-3xl font-bold font-heading">Free</p>
                  ) : showOffer ? (
                    <div>
                      <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-bold font-heading text-green-600">₹{prePrice}</p>
                        <span className="text-xs text-muted-foreground font-body line-through">₹{price}</span>
                      </div>
                      <p className="text-xs text-green-600 font-body font-medium">+ GST · first year</p>
                      <p className="text-[10px] text-muted-foreground font-body mt-0.5">then ₹{price}/yr</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-3xl font-bold font-heading">₹{price}</p>
                      <p className="text-xs text-muted-foreground font-body">per year</p>
                    </div>
                  )}
                </div>

                {/* Limits */}
                <div className="space-y-1.5 mb-5 text-sm font-body">
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Family members</span>
                    <span className="font-semibold">{maxNodes === 1000 ? 'Unlimited' : maxNodes}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Generations</span>
                    <span className="font-semibold">{genCap}</span>
                  </div>
                  {entitlementLabels.map(ent => (
                    <div key={ent.key} className="flex justify-between items-center py-0.5">
                      <span className="text-muted-foreground">{ent.label}</span>
                      {entitle[ent.key]
                        ? <Check className={`w-4 h-4 flex-shrink-0 ${isTopTier ? 'text-gold' : 'text-primary'}`} />
                        : <X className="w-4 h-4 flex-shrink-0 text-muted-foreground/30" />}
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="mt-auto">
                  {isComingSoon ? (
                    <div className="w-full py-2.5 rounded-xl bg-secondary text-center text-sm text-muted-foreground font-body font-medium cursor-not-allowed">
                      Coming Soon
                    </div>
                  ) : isCurrent ? (
                    <div className="w-full py-2.5 rounded-xl bg-secondary text-center text-sm text-muted-foreground font-body font-medium">
                      Your current plan
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSelectPlan(id)}
                      disabled={processingPlan !== null}
                      className={`w-full py-2.5 rounded-xl font-semibold font-body text-sm transition-all hover:opacity-90 hover:-translate-y-px flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait ${
                        isTopTier
                          ? 'gradient-gold text-white shadow-gold shimmer'
                          : 'gradient-hero text-primary-foreground shadow-warm'
                      }`}
                    >
                      {processingPlan === id ? (
                        <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Processing…</>
                      ) : (
                        <>{!isFree && <CreditCard className="w-4 h-4" />}
                        {isFree ? 'Select Free Plan' : showOffer ? `Get offer — ₹${prePrice}` : `Upgrade — ₹${price}/yr`}</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground font-body mt-8 flex items-center justify-center gap-2">
          <CreditCard className="w-3.5 h-3.5" />
          Secure payment · 30-day refund policy · All prices in INR + applicable GST
        </p>
        <div className="text-center mt-3">
          <button
            onClick={() => navigate('/transactions')}
            className="inline-flex items-center gap-1.5 text-xs text-primary font-medium font-body hover:underline underline-offset-2"
          >
            <Receipt className="w-3.5 h-3.5" /> View my transactions &amp; invoices →
          </button>
        </div>
      </div>
    </AppShell>
  );
};

export default UpgradePage;
