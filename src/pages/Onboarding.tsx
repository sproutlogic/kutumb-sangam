import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import { usePlan } from '@/contexts/PlanContext';
import { useTree } from '@/contexts/TreeContext';
import { backendPayloadToTreeState } from '@/services/mapVanshaPayload';
import { bootstrapOnboardingTree } from '@/services/api';
import LockedBanner from '@/components/states/LockedBanner';
import { toast } from '@/hooks/use-toast';

const ONBOARDING_DRAFT_KEY = 'kutumb_onboarding_draft';

const defaultForm = () => ({
  givenName: '',
  surname: '',
  dateOfBirth: '',
  ancestralPlace: '',
  currentResidence: '',
  gotra: '',
  treeName: '',
  fatherName: '',
  motherName: '',
  spouseName: '',
});

const Onboarding = () => {
  const { tr } = useLang();
  const { hasEntitlement } = usePlan();
  const { loadTreeState } = useTree();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => defaultForm());
  const [creating, setCreating] = useState(false);
  /** Avoid writing sessionStorage until we've read any existing draft (prevents wiping data on refresh). */
  const [draftReady, setDraftReady] = useState(false);

  const hasCultural = hasEntitlement('culturalFields');
  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { form?: Record<string, string>; step?: number };
        if (d.form && typeof d.form === 'object') {
          setForm((prev) => ({ ...prev, ...d.form }));
        }
        if (typeof d.step === 'number' && d.step >= 1 && d.step <= 3) {
          setStep(d.step);
        }
      }
    } catch {
      /* ignore corrupt draft */
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    try {
      sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ form, step }));
    } catch {
      /* quota / private mode */
    }
  }, [form, step, draftReady]);

  const identityComplete = [
    form.givenName,
    form.surname,
    form.dateOfBirth,
    form.ancestralPlace,
    form.currentResidence,
  ].every((s) => String(s ?? '').trim().length > 0);

  const handleCreate = async () => {
    // Never use disabled + pointer-events-none on this button: users get zero feedback when validation fails.
    if (!identityComplete) {
      const missing: string[] = [];
      if (!String(form.givenName ?? '').trim()) missing.push(tr('givenName'));
      if (!String(form.surname ?? '').trim()) missing.push(tr('surname'));
      if (!String(form.dateOfBirth ?? '').trim()) missing.push(tr('dateOfBirth'));
      if (!String(form.ancestralPlace ?? '').trim()) missing.push(tr('ancestralPlace'));
      if (!String(form.currentResidence ?? '').trim()) missing.push(tr('currentResidence'));
      toast({
        title: tr('onboardMissingFieldsTitle'),
        description: `${tr('onboardMissingFieldsDesc')}: ${missing.join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setCreating(true);
      try {
        sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
      } catch {
        /* ignore */
      }
      const treeName = form.treeName.trim() || `${form.givenName.trim()}'s Family`;
      const payload = await bootstrapOnboardingTree({
        tree_name: treeName,
        gotra: form.gotra.trim(),
        father_name: form.fatherName.trim(),
        mother_name: form.motherName.trim(),
        spouse_name: form.spouseName.trim(),
        identity: {
          given_name: form.givenName.trim(),
          surname: form.surname.trim(),
          date_of_birth: form.dateOfBirth.trim(),
          ancestral_place: form.ancestralPlace.trim(),
          current_residence: form.currentResidence.trim(),
          gender: 'male',
        },
      });
      loadTreeState(backendPayloadToTreeState(payload));
      navigate(`/passkey-setup?vansha_id=${encodeURIComponent(payload.vansha_id)}`, { replace: true });
    } catch (err) {
      toast({
        title: tr('errorGeneric'),
        description: err instanceof Error ? err.message : tr('onboardCreateFailed'),
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const inputClass = "w-full px-4 py-2.5 rounded-lg border border-input bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold font-body transition-all ${
                s <= step ? 'gradient-hero text-primary-foreground shadow-warm' : 'bg-secondary text-muted-foreground'
              }`}>
                {s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 rounded ${s < step ? 'bg-primary' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-card rounded-xl p-8 shadow-card border border-border/50">
          {step === 1 && (
            <div className="space-y-5 animate-fade-in">
              <div className="text-center mb-6">
                <h2 className="font-heading text-2xl font-bold">{tr('onboardStep1Title')}</h2>
                <p className="text-muted-foreground font-body mt-1">{tr('onboardStep1Subtitle')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('givenName')}</label>
                <input value={form.givenName} onChange={(e) => set('givenName', e.target.value)} className={inputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('surname')}</label>
                <input value={form.surname} onChange={(e) => set('surname', e.target.value)} className={inputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('dateOfBirth')}</label>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => set('dateOfBirth', e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('ancestralPlace')}</label>
                <input value={form.ancestralPlace} onChange={(e) => set('ancestralPlace', e.target.value)} className={inputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('currentResidence')}</label>
                <input value={form.currentResidence} onChange={(e) => set('currentResidence', e.target.value)} className={inputClass} required />
              </div>

              {hasCultural ? (
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">{tr('gotra')}</label>
                  <input value={form.gotra} onChange={(e) => set('gotra', e.target.value)} className={inputClass} />
                </div>
              ) : (
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground font-body mb-3">{tr('culturalFieldsLocked')}</p>
                  <LockedBanner featureKey="culturalFields" />
                </div>
              )}

              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!identityComplete}
                className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {tr('next')}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 animate-fade-in">
              <div className="text-center mb-6">
                <h2 className="font-heading text-2xl font-bold">{tr('onboardStep2Title')}</h2>
                <p className="text-muted-foreground font-body mt-1">{tr('onboardStep2Subtitle')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('familyTreeName')}</label>
                <input value={form.treeName} onChange={e => set('treeName', e.target.value)} placeholder={tr('familyTreeNamePlaceholder')} className={inputClass} />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-lg border border-border font-semibold font-body text-muted-foreground hover:bg-secondary transition-colors"
                >
                  {tr('back')}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex-1 py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
                >
                  {tr('next')}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 animate-fade-in">
              <div className="text-center mb-6">
                <h2 className="font-heading text-2xl font-bold">{tr('onboardStep3Title')}</h2>
                <p className="text-muted-foreground font-body mt-1">{tr('onboardStep3Subtitle')}</p>
              </div>

              {/* Required identity — repeated here so Create Tree works even if step 1 state was lost or skipped */}
              <div className="rounded-lg border border-border/80 bg-secondary/20 p-4 space-y-4">
                <p className="text-sm font-medium font-body text-foreground">{tr('yourProfile')}</p>
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">{tr('givenName')}</label>
                  <input value={form.givenName} onChange={(e) => set('givenName', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">{tr('surname')}</label>
                  <input value={form.surname} onChange={(e) => set('surname', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">{tr('dateOfBirth')}</label>
                  <input
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => set('dateOfBirth', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">{tr('ancestralPlace')}</label>
                  <input value={form.ancestralPlace} onChange={(e) => set('ancestralPlace', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">{tr('currentResidence')}</label>
                  <input value={form.currentResidence} onChange={(e) => set('currentResidence', e.target.value)} className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('fatherName')}</label>
                <input value={form.fatherName} onChange={e => set('fatherName', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('motherName')}</label>
                <input value={form.motherName} onChange={e => set('motherName', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('spouseName')}</label>
                <input value={form.spouseName} onChange={e => set('spouseName', e.target.value)} className={inputClass} />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex-1 py-3 rounded-lg border border-border font-semibold font-body text-muted-foreground hover:bg-secondary transition-colors"
                >
                  {tr('back')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={creating}
                  className={`flex-1 py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity relative z-10 ${
                    identityComplete ? '' : 'opacity-70'
                  }`}
                >
                  {creating ? 'Creating...' : tr('createTree')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
