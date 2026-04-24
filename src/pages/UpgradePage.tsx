import { useLang } from '@/i18n/LanguageContext';
import { usePlan } from '@/contexts/PlanContext';
import { plans, planOrder, PlanId, EntitlementKey } from '@/config/packages.config';
import AppShell from '@/components/shells/AppShell';
import { Check, X, CreditCard, ExternalLink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const entitlementLabels: { key: EntitlementKey; labelKey: string }[] = [
  { key: 'culturalFields', labelKey: 'culturalFieldsLabel' },
  { key: 'discovery', labelKey: 'discoveryLabel' },
  { key: 'connectionChains', labelKey: 'connectionChainsLabel' },
  { key: 'panditVerification', labelKey: 'panditVerificationLabel' },
  { key: 'matrimony', labelKey: 'matrimonyLabel' },
  { key: 'sosAlerts', labelKey: 'sosAlertsLabel' },
  { key: 'treeAnnounce', labelKey: 'treeAnnounceLabel' },
];

// Simulated payment links per plan (replace with real Stripe/Razorpay links)
const paymentLinks: Record<PlanId, string> = {
  beej: '',
  ankur: 'https://pay.kutumbmap.com/ankur',
  vriksh: 'https://pay.kutumbmap.com/vriksh',
  vansh: 'https://pay.kutumbmap.com/vansh',
};

const UpgradePage = () => {
  const { tr } = useLang();
  const { planId: currentPlan, setPlanId } = usePlan();

  const handleSelectPlan = (id: PlanId) => {
    if (plans[id].price === 0) {
      setPlanId(id);
      return;
    }
    // For paid plans — simulate payment flow
    const link = paymentLinks[id];
    if (link) {
      // In production, redirect to payment gateway
      toast({
        title: tr('paymentRedirect'),
        description: tr('paymentRedirectDesc'),
      });
      // Simulate successful payment for demo
      setTimeout(() => {
        setPlanId(id);
        toast({ title: tr('planUpgraded'), description: tr(plans[id].nameKey as any) });
      }, 1500);
    }
  };

  return (
    <AppShell>
      <div className="container py-8">
        <div className="text-center mb-10">
          <h1 className="font-heading text-3xl font-bold">{tr('upgradeTitle')}</h1>
          <div className="gold-line mx-auto mt-3 mb-3" style={{ maxWidth: '100px' }} />
          <p className="text-muted-foreground font-body">{tr('upgradeSubtitle')}</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {planOrder.map(id => {
            const plan = plans[id];
            const isCurrent = id === currentPlan;
            const isPaid = plan.price > 0;
            const isTopTier = id === 'vansh';
            return (
              <div
                key={id}
                className={`relative bg-card rounded-xl p-6 shadow-card border-2 transition-all ${
                  isTopTier
                    ? 'border-gold/50 shadow-gold hover:border-gold/80'
                    : isCurrent
                      ? 'border-primary shadow-warm'
                      : 'border-border/50 hover:border-primary/30'
                }`}
              >
                {/* Top-tier gold shimmer strip */}
                {isTopTier && <div className="absolute inset-x-0 top-0 gold-line rounded-t-xl" />}

                {/* Badges row */}
                <div className="flex items-center gap-2 mb-3 flex-wrap min-h-[1.5rem]">
                  {isTopTier && (
                    <span className="inline-block text-xs px-2.5 py-0.5 rounded-full gradient-gold text-white font-semibold font-body shimmer">
                      ✦ Best Value
                    </span>
                  )}
                  {isCurrent && (
                    <span className="inline-block text-xs px-2.5 py-0.5 rounded-full gradient-hero text-primary-foreground font-medium font-body">
                      {tr('currentPlanBadge')}
                    </span>
                  )}
                </div>

                <h3 className={`font-heading text-xl font-bold mb-1 ${isTopTier ? 'text-gold-dark' : ''}`}>{tr(plan.nameKey as any)}</h3>
                <p className="text-sm text-muted-foreground font-body mb-4">{tr(plan.descKey as any)}</p>
                <p className="text-3xl font-bold font-heading mb-4">
                  {plan.price === 0 ? tr('free') : `₹${plan.price}`}
                  {plan.price > 0 && <span className="text-sm text-muted-foreground font-body">{tr('perMonth')}</span>}
                </p>

                <div className="space-y-2 mb-6 text-sm font-body">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tr('maxNodesLabel')}</span>
                    <span className="font-medium">{plan.maxNodes}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{tr('generationCapLabel')}</span>
                    <span className="font-medium">{plan.generationCap}</span>
                  </div>
                  {entitlementLabels.map(ent => (
                    <div key={ent.key} className="flex justify-between items-center">
                      <span className="text-muted-foreground">{tr(ent.labelKey as any)}</span>
                      {plan.entitlements[ent.key]
                        ? <Check className={`w-4 h-4 ${isTopTier ? 'text-gold' : 'text-primary'}`} />
                        : <X className="w-4 h-4 text-muted-foreground/40" />}
                    </div>
                  ))}
                </div>

                {!isCurrent && (
                  <button
                    onClick={() => handleSelectPlan(id)}
                    className={`w-full py-2.5 rounded-lg font-semibold font-body text-sm transition-all hover:opacity-90 hover:-translate-y-px flex items-center justify-center gap-2 ${
                      isTopTier
                        ? 'gradient-gold text-white shadow-gold shimmer'
                        : 'gradient-hero text-primary-foreground shadow-warm'
                    }`}
                  >
                    {isPaid && <CreditCard className="w-4 h-4" />}
                    {isPaid ? tr('payAndUpgrade') : tr('selectPlan')}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Payment info strip */}
        <div className="mt-8 text-center">
          <p className="text-xs text-muted-foreground font-body flex items-center justify-center gap-2">
            <CreditCard className="w-3.5 h-3.5" />
            {tr('securePaymentNote')}
          </p>
        </div>
      </div>
    </AppShell>
  );
};

export default UpgradePage;
