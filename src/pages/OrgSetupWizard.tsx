/**
 * OrgSetupWizard — 4-step wizard for creating a new Kutumb Pro organisation.
 *
 * Step 1: Choose Framework  (framework_type)
 * Step 2: Define Tiers      (5 tier aliases, activate/deactivate 2/3/4)
 * Step 3: Currency & Brand  (currency_name, currency_emoji, org description)
 * Step 4: Review & Launch
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '@/components/shells/AppShell';
import { ORG_FRAMEWORKS, FRAMEWORK_ORDER, ALWAYS_ACTIVE_TIERS } from '@/config/orgFrameworks.config';
import type { FrameworkType } from '@/config/orgFrameworks.config';
import { orgApi } from '@/services/orgApi';
import { toast } from '@/hooks/use-toast';
import { ChevronRight, ChevronLeft, CheckCircle2, Layers, Coins, Eye } from 'lucide-react';

/* ── Wizard state ── */
interface WizardState {
  framework_type:  FrameworkType;
  name:            string;
  description:     string;
  tier_aliases:    [string, string, string, string, string];
  tier2_active:    boolean;
  tier3_active:    boolean;
  tier4_active:    boolean;
  currency_name:   string;
  currency_emoji:  string;
}

const EMOJI_OPTIONS = ['💫', '🌸', '⚡', '💚', '⭐', '🏡', '🔥', '🌊', '🌱', '🏆', '🎯', '🌟'];

const STEP_LABELS = ['Framework', 'Tiers', 'Currency', 'Review'];

/* ── Step indicator ── */
function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEP_LABELS.map((label, idx) => {
        const step = idx + 1;
        const done = step < current;
        const active = step === current;
        return (
          <div key={label} className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold font-body transition-all
              ${done   ? 'bg-primary text-primary-foreground'
              : active ? 'bg-primary/20 text-primary border-2 border-primary'
              :          'bg-secondary text-muted-foreground'}`}
            >
              {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : step}
            </div>
            <span className={`text-xs font-body hidden sm:inline ${active ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
              {label}
            </span>
            {idx < STEP_LABELS.length - 1 && (
              <ChevronRight className="w-3 h-3 text-muted-foreground/40 hidden sm:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── STEP 1: Framework selection ── */
function Step1Framework({ state, onChange }: { state: WizardState; onChange: (ft: FrameworkType) => void }) {
  return (
    <div>
      <h2 className="font-heading text-xl font-bold mb-1">Choose a Framework</h2>
      <p className="text-muted-foreground font-body text-sm mb-6">
        Pick the template that best fits your community. All names are 100% editable after creation.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {FRAMEWORK_ORDER.map(ft => {
          const fw = ORG_FRAMEWORKS[ft];
          const selected = state.framework_type === ft;
          return (
            <button
              key={ft}
              onClick={() => onChange(ft)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{fw.emoji}</span>
                <div>
                  <p className="font-heading font-bold text-sm">{fw.label}</p>
                  <p className="text-[11px] text-muted-foreground font-body">{fw.tagline}</p>
                </div>
                {selected && <CheckCircle2 className="w-4 h-4 text-primary ml-auto flex-shrink-0" />}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {fw.tiers.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary font-body">
                    T{i + 1}: {t}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── STEP 2: Tier aliases ── */
function Step2Tiers({ state, update }: { state: WizardState; update: (partial: Partial<WizardState>) => void }) {
  const tiers: [string, number][] = [
    [state.tier_aliases[0], 1],
    [state.tier_aliases[1], 2],
    [state.tier_aliases[2], 3],
    [state.tier_aliases[3], 4],
    [state.tier_aliases[4], 5],
  ];

  const activeMap: Record<number, boolean> = {
    1: true,
    2: state.tier2_active,
    3: state.tier3_active,
    4: state.tier4_active,
    5: true,
  };

  function setAlias(idx: number, val: string) {
    const next = [...state.tier_aliases] as [string, string, string, string, string];
    next[idx] = val;
    update({ tier_aliases: next });
  }

  function toggleTier(tier: number) {
    if (tier === 2) update({ tier2_active: !state.tier2_active });
    if (tier === 3) update({ tier3_active: !state.tier3_active });
    if (tier === 4) update({ tier4_active: !state.tier4_active });
  }

  return (
    <div>
      <h2 className="font-heading text-xl font-bold mb-1 flex items-center gap-2">
        <Layers className="w-5 h-5 text-primary" /> Define Your Tiers
      </h2>
      <p className="text-muted-foreground font-body text-sm mb-6">
        Tiers 1 and 5 are always active. You can disable middle tiers if your
        structure only needs 2 or 3 levels. All names are editable anytime.
      </p>
      <div className="space-y-3">
        {tiers.map(([alias, tier], idx) => {
          const alwaysOn = ALWAYS_ACTIVE_TIERS.has(tier);
          const isActive = activeMap[tier];
          return (
            <div
              key={tier}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                isActive ? 'border-border bg-card' : 'border-border/40 bg-secondary/30 opacity-60'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                ${isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                T{tier}
              </div>
              <input
                className="flex-1 bg-transparent text-sm font-body border-b border-border/60 focus:border-primary focus:outline-none py-1 disabled:text-muted-foreground"
                value={alias}
                onChange={e => setAlias(idx, e.target.value)}
                disabled={!isActive}
                placeholder={`Tier ${tier} title`}
                maxLength={40}
              />
              {alwaysOn ? (
                <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary font-body font-semibold flex-shrink-0">
                  Always on
                </span>
              ) : (
                <button
                  onClick={() => toggleTier(tier)}
                  className={`text-[10px] px-3 py-1.5 rounded-full border font-body font-semibold flex-shrink-0 transition-all ${
                    isActive
                      ? 'border-primary text-primary hover:bg-primary/5'
                      : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {isActive ? 'Active' : 'Activate later'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground font-body mt-4">
        Active tiers appear in your member hierarchy. Inactive tiers can be enabled later from org settings.
      </p>
    </div>
  );
}

/* ── STEP 3: Currency & Brand ── */
function Step3Currency({ state, update }: { state: WizardState; update: (partial: Partial<WizardState>) => void }) {
  return (
    <div>
      <h2 className="font-heading text-xl font-bold mb-1 flex items-center gap-2">
        <Coins className="w-5 h-5 text-primary" /> Organisation Details
      </h2>
      <p className="text-muted-foreground font-body text-sm mb-6">
        Give your organisation a name, define its local currency, and add a short description.
      </p>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
            Organisation name *
          </label>
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={state.name}
            onChange={e => update({ name: e.target.value })}
            placeholder="e.g. Sunrise Welfare Trust"
            maxLength={80}
          />
        </div>

        <div>
          <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
            Description (optional)
          </label>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            value={state.description}
            onChange={e => update({ description: e.target.value })}
            placeholder="What does your organisation do?"
            maxLength={300}
          />
        </div>

        <div>
          <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
            Local currency name
          </label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={state.currency_name}
                onChange={e => update({ currency_name: e.target.value })}
                placeholder="e.g. Punya, Seva, Credit"
                maxLength={20}
              />
            </div>
            <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background">
              <span className="text-lg">{state.currency_emoji}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground font-body mt-1">
            This is your org's internal credit unit — never mixed with Sewa Chakra global credits.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold font-body text-muted-foreground mb-1 block">
            Currency emoji
          </label>
          <div className="flex flex-wrap gap-2">
            {EMOJI_OPTIONS.map(e => (
              <button
                key={e}
                onClick={() => update({ currency_emoji: e })}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                  state.currency_emoji === e
                    ? 'bg-primary/10 border-2 border-primary'
                    : 'bg-secondary border border-border hover:border-primary/40'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── STEP 4: Review ── */
function Step4Review({ state }: { state: WizardState }) {
  const fw = ORG_FRAMEWORKS[state.framework_type];
  const activeMap: Record<number, boolean> = {
    1: true, 2: state.tier2_active, 3: state.tier3_active, 4: state.tier4_active, 5: true,
  };

  return (
    <div>
      <h2 className="font-heading text-xl font-bold mb-1 flex items-center gap-2">
        <Eye className="w-5 h-5 text-primary" /> Review & Launch
      </h2>
      <p className="text-muted-foreground font-body text-sm mb-6">
        Everything looks good? Hit Launch to create your organisation.
      </p>

      <div className="bg-secondary/50 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{fw.emoji}</span>
          <div>
            <p className="font-heading font-bold text-lg">{state.name || '(No name set)'}</p>
            <p className="text-xs text-muted-foreground font-body">{fw.label} · {fw.tagline}</p>
          </div>
        </div>

        {state.description && (
          <p className="text-sm font-body text-muted-foreground border-t border-border pt-3">
            {state.description}
          </p>
        )}

        <div className="border-t border-border pt-3">
          <p className="text-xs font-semibold font-body text-muted-foreground mb-2 uppercase tracking-wide">
            Tier Structure
          </p>
          <div className="flex flex-wrap gap-2">
            {state.tier_aliases.map((alias, idx) => {
              const tier = idx + 1;
              const active = activeMap[tier];
              return (
                <span
                  key={tier}
                  className={`text-xs px-3 py-1 rounded-full font-body ${
                    active
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'bg-muted text-muted-foreground line-through'
                  }`}
                >
                  T{tier}: {alias}
                </span>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-3 flex items-center gap-2">
          <span className="text-lg">{state.currency_emoji}</span>
          <div>
            <p className="text-xs font-semibold font-body">{state.currency_name}</p>
            <p className="text-[11px] text-muted-foreground font-body">Local currency for this org</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main wizard ── */
const OrgSetupWizard = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [state, setState] = useState<WizardState>(() => {
    const fw = ORG_FRAMEWORKS['custom'];
    return {
      framework_type: 'custom',
      name: '',
      description: '',
      tier_aliases: [...fw.tiers] as [string, string, string, string, string],
      tier2_active: true,
      tier3_active: true,
      tier4_active: true,
      currency_name: fw.currencyName,
      currency_emoji: fw.currencyEmoji,
    };
  });

  function update(partial: Partial<WizardState>) {
    setState(prev => ({ ...prev, ...partial }));
  }

  function changeFramework(ft: FrameworkType) {
    const fw = ORG_FRAMEWORKS[ft];
    setState(prev => ({
      ...prev,
      framework_type: ft,
      tier_aliases: [...fw.tiers] as [string, string, string, string, string],
      currency_name: fw.currencyName,
      currency_emoji: fw.currencyEmoji,
    }));
  }

  function canAdvance(): boolean {
    if (step === 3 && !state.name.trim()) return false;
    return true;
  }

  async function handleLaunch() {
    if (!state.name.trim()) {
      toast({ title: 'Please enter an organisation name.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const org = await orgApi.create({
        name:            state.name.trim(),
        description:     state.description.trim() || undefined,
        framework_type:  state.framework_type,
        tier1_alias:     state.tier_aliases[0],
        tier2_alias:     state.tier_aliases[1],
        tier3_alias:     state.tier_aliases[2],
        tier4_alias:     state.tier_aliases[3],
        tier5_alias:     state.tier_aliases[4],
        is_tier2_active: state.tier2_active,
        is_tier3_active: state.tier3_active,
        is_tier4_active: state.tier4_active,
        currency_name:   state.currency_name,
        currency_emoji:  state.currency_emoji,
      });
      toast({ title: `${org.name} launched! 🎉`, description: 'Your organisation is live. Start inviting members.' });
      navigate(`/org/${org.slug}`);
    } catch (err: any) {
      toast({ title: 'Could not create organisation', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="container py-8 px-4 max-w-2xl mx-auto">
        <div className="text-center mb-2">
          <h1 className="font-heading text-2xl font-bold">Create Organisation</h1>
          <p className="text-muted-foreground font-body text-sm mt-1">
            Set up your community in 4 easy steps
          </p>
        </div>

        <StepBar current={step} />

        <div className="bg-card border border-border rounded-2xl p-6 shadow-card">
          {step === 1 && <Step1Framework state={state} onChange={changeFramework} />}
          {step === 2 && <Step2Tiers state={state} update={update} />}
          {step === 3 && <Step3Currency state={state} update={update} />}
          {step === 4 && <Step4Review state={state} />}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
            <button
              onClick={() => step > 1 ? setStep(s => s - 1) : navigate('/kutumb-pro')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-body hover:bg-secondary transition"
            >
              <ChevronLeft className="w-4 h-4" />
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            {step < 4 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canAdvance()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl gradient-hero text-primary-foreground font-semibold font-body text-sm hover:opacity-90 transition disabled:opacity-50"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleLaunch}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl gradient-gold text-white font-semibold font-body text-sm hover:opacity-90 transition shimmer disabled:opacity-60"
              >
                {loading
                  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Launching…</>
                  : <><CheckCircle2 className="w-4 h-4" /> Launch Organisation</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default OrgSetupWizard;
