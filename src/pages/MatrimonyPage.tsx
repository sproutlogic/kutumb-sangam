import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePlan } from '@/contexts/PlanContext';
import { useLang } from '@/i18n/LanguageContext';
import { useTree } from '@/contexts/TreeContext';
import AppShell from '@/components/shells/AppShell';
import LockedState from '@/components/states/LockedState';
import { Check, ChevronLeft, ChevronRight, Heart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { MatrimonyProfile } from '@/engine/types';
import { mergeMatrimonyProfile } from '@/engine/matrimonyDefaults';
import { fetchMatrimonyProfile, saveMatrimonyProfile } from '@/services/api';

const MatrimonyPage = () => {
  const { hasEntitlement } = usePlan();
  const { tr } = useLang();
  const { state, setMatrimonyProfile } = useTree();
  const [searchParams] = useSearchParams();

  const vanshaId = useMemo(
    () => (searchParams.get('vansha_id') ?? import.meta.env.VITE_DEFAULT_VANSHA_ID ?? '').trim(),
    [searchParams],
  );

  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<MatrimonyProfile>(() =>
    mergeMatrimonyProfile(state.matrimonyProfile ?? null),
  );
  const [newSurname, setNewSurname] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!vanshaId) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchMatrimonyProfile(vanshaId);
        if (cancelled) return;
        const merged = mergeMatrimonyProfile(p ?? {});
        setForm(merged);
        setMatrimonyProfile(merged);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to load matrimony profile');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vanshaId, setMatrimonyProfile]);

  if (!hasEntitlement('matrimony')) {
    return <LockedState titleKey="matrimonyLockedTitle" descKey="matrimonyLockedDesc" />;
  }

  if (state.matrimonyProfile?.optedIn) {
    return (
      <AppShell>
        <div className="container py-8 max-w-lg text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="font-heading text-2xl font-bold">{tr('matrimonyOptedIn')}</h1>
          <p className="text-muted-foreground font-body">{tr('matrimonyOptedInDesc')}</p>
        </div>
      </AppShell>
    );
  }

  // Show intro/consent screen before the form
  if (!showForm) {
    return (
      <AppShell>
        <div className="container py-8 max-w-lg">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full gradient-hero flex items-center justify-center mx-auto mb-4 shadow-warm">
              <Heart className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="font-heading text-3xl font-bold mb-2">{tr('matrimonyTitle')}</h1>
            <p className="text-muted-foreground font-body">{tr('matrimonyDesc')}</p>
          </div>

          <div className="bg-card rounded-xl p-6 shadow-card border border-border/50 space-y-5">
            {/* What you'll fill in */}
            <div className="space-y-3">
              {[
                { num: '01', text: tr('matIntroStep1') },
                { num: '02', text: tr('matIntroStep2') },
                { num: '03', text: tr('matIntroStep3') },
                { num: '04', text: tr('matIntroStep4') },
              ].map(s => (
                <div key={s.num} className="flex items-start gap-3">
                  <span className="text-xs font-bold font-heading text-primary/40 w-6 shrink-0 pt-0.5">{s.num}</span>
                  <p className="text-sm font-body text-foreground leading-relaxed">{s.text}</p>
                </div>
              ))}
            </div>

            {/* Privacy note */}
            <div className="bg-secondary/50 rounded-lg p-3 border border-border/50">
              <p className="text-xs text-muted-foreground font-body leading-relaxed">{tr('matrimonyPrivacyNote')}</p>
            </div>

            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-all hover:-translate-y-px flex items-center justify-center gap-2"
            >
              <Heart className="w-4 h-4" />
              {tr('optInMatrimony')}
            </button>

            <p className="text-xs text-muted-foreground font-body text-center">{tr('matrimonyDisclaimer')}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const set = (k: keyof MatrimonyProfile, v: any) => setForm(p => ({ ...p, [k]: v }));
  const setKundali = (k: string, v: string) => setForm(p => ({ ...p, kundaliData: { ...p.kundaliData, [k]: v } }));

  const selectClass = "w-full px-4 py-2.5 rounded-lg border border-input bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring/30";
  const inputClass = selectClass;

  const handleSubmit = async () => {
    const finalProfile = { ...form, optedIn: true, stage: 5 };
    if (vanshaId) {
      try {
        setSaving(true);
        await saveMatrimonyProfile(vanshaId, finalProfile);
        setMatrimonyProfile(finalProfile);
        toast.success(tr('matrimonyOptedIn'));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to save matrimony profile');
      } finally {
        setSaving(false);
      }
    } else {
      setMatrimonyProfile(finalProfile);
      toast.success(tr('matrimonyOptedIn'));
    }
  };

  const addSurname = () => {
    if (newSurname.trim()) {
      set('surnamesToAvoid', [...form.surnamesToAvoid, newSurname.trim()]);
      setNewSurname('');
    }
  };

  const gotraField = (label: string, field: keyof MatrimonyProfile) => (
    <div>
      <label className="block text-sm font-medium font-body mb-1.5">{label}</label>
      <input
        value={(form[field] as string) || ''}
        onChange={e => set(field, e.target.value)}
        placeholder={tr('matGotraPlaceholder')}
        className={inputClass}
      />
      <div className="flex gap-2 mt-1.5">
        <button type="button" onClick={() => set(field, 'unknown')} className={`text-xs px-2 py-1 rounded border ${form[field] === 'unknown' ? 'border-primary text-primary bg-primary/10' : 'border-input text-muted-foreground'}`}>{tr('matDontKnow')}</button>
        <button type="button" onClick={() => set(field, 'askPandit')} className={`text-xs px-2 py-1 rounded border ${form[field] === 'askPandit' ? 'border-primary text-primary bg-primary/10' : 'border-input text-muted-foreground'}`}>{tr('matAskPandit')}</button>
        <button type="button" onClick={() => set(field, 'notApplicable')} className={`text-xs px-2 py-1 rounded border ${form[field] === 'notApplicable' ? 'border-primary text-primary bg-primary/10' : 'border-input text-muted-foreground'}`}>{tr('matNotApplicable')}</button>
      </div>
    </div>
  );

  const steps = [
    // Step 0: Entry
    <div key={0} className="space-y-5">
      <h2 className="font-heading text-xl font-bold">{tr('matStep0Title')}</h2>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matSearchingFor')}</label>
        <select value={form.searchingFor} onChange={e => set('searchingFor', e.target.value as any)} className={selectClass}>
          <option value="myself">{tr('matMyself')}</option>
          <option value="son">{tr('son')}</option>
          <option value="daughter">{tr('daughter')}</option>
          <option value="familyMember">{tr('matFamilyMember')}</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matIntent')}</label>
        <select value={form.intent} onChange={e => set('intent', e.target.value as any)} className={selectClass}>
          <option value="open">{tr('matIntentOpen')}</option>
          <option value="exploring">{tr('matIntentExploring')}</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matManagement')}</label>
        <select value={form.management} onChange={e => set('management', e.target.value as any)} className={selectClass}>
          <option value="self">{tr('matManageSelf')}</option>
          <option value="parents">{tr('matManageParents')}</option>
          <option value="joint">{tr('matManageJoint')}</option>
          <option value="elder">{tr('matManageElder')}</option>
        </select>
      </div>
    </div>,

    // Step 1: Sanskriti — Lifestyle
    <div key={1} className="space-y-5">
      <h2 className="font-heading text-xl font-bold">{tr('matStep1Title')}</h2>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matDietary')}</label>
        <select value={form.dietary} onChange={e => set('dietary', e.target.value)} className={selectClass}>
          <option value="">{tr('matSelect')}</option>
          <option value="pure-veg">{tr('matPureVeg')}</option>
          <option value="jain">{tr('matJain')}</option>
          <option value="non-veg">{tr('matNonVeg')}</option>
          <option value="vegan">{tr('matVegan')}</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matReligiousPractice')}</label>
        <select value={form.religiousPractice} onChange={e => set('religiousPractice', e.target.value)} className={selectClass}>
          <option value="">{tr('matSelect')}</option>
          <option value="orthodox">{tr('matOrthodox')}</option>
          <option value="moderate">{tr('matModerate')}</option>
          <option value="liberal">{tr('matLiberal')}</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matLanguage')}</label>
        <input value={form.languageAtHome} onChange={e => set('languageAtHome', e.target.value)} className={inputClass} placeholder="Hindi, Marathi, Tamil..." />
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matEducation')}</label>
        <select value={form.educationLevel} onChange={e => set('educationLevel', e.target.value)} className={selectClass}>
          <option value="">{tr('matSelect')}</option>
          <option value="school">{tr('matSchool')}</option>
          <option value="graduate">{tr('matGraduate')}</option>
          <option value="postgraduate">{tr('matPostgraduate')}</option>
          <option value="professional">{tr('matProfessional')}</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matProfession')}</label>
        <input value={form.professionCategory} onChange={e => set('professionCategory', e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matLiving')}</label>
        <select value={form.livingSituation} onChange={e => set('livingSituation', e.target.value)} className={selectClass}>
          <option value="">{tr('matSelect')}</option>
          <option value="joint">{tr('matJointFamily')}</option>
          <option value="nuclear">{tr('matNuclear')}</option>
          <option value="flexible">{tr('matFlexible')}</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matGeographic')}</label>
        <select value={form.geographicPreference} onChange={e => set('geographicPreference', e.target.value)} className={selectClass}>
          <option value="">{tr('matSelect')}</option>
          <option value="same-city">{tr('matSameCity')}</option>
          <option value="open">{tr('matOpenRelocation')}</option>
          <option value="nri">{tr('matNriOpen')}</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matHoroscope')}</label>
        <select value={form.horoscopeWillingness} onChange={e => set('horoscopeWillingness', e.target.value)} className={selectClass}>
          <option value="">{tr('matSelect')}</option>
          <option value="yes">{tr('matHoroscopeYes')}</option>
          <option value="kundali-only">{tr('matHoroscopeKundali')}</option>
          <option value="no">{tr('matHoroscopeNo')}</option>
        </select>
      </div>
    </div>,

    // Step 2: Gotra & Lineage
    <div key={2} className="space-y-5">
      <h2 className="font-heading text-xl font-bold">{tr('matStep2Title')}</h2>
      <p className="text-sm text-muted-foreground font-body">{tr('matStep2Desc')}</p>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matGenerationAvoidance')}</label>
        <select value={form.generationAvoidance} onChange={e => set('generationAvoidance', e.target.value as any)} className={selectClass}>
          <option value="3">{tr('matGen3')}</option>
          <option value="5">{tr('matGen5')}</option>
          <option value="7">{tr('matGen7')}</option>
          <option value="askPandit">{tr('matAskPandit')}</option>
          <option value="notApplicable">{tr('matNotApplicable')}</option>
        </select>
      </div>
      {gotraField(tr('matOwnGotra'), 'ownGotra')}
      {form.ownGotra && form.ownGotra !== 'unknown' && form.ownGotra !== 'notApplicable' && (
        <div className="space-y-4 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground font-body">{tr('matExtendedGotraDesc')}</p>
          {gotraField(tr('matMothersGotra'), 'mothersGotra')}
          {gotraField(tr('matDadisGotra'), 'dadisGotra')}
          {gotraField(tr('matNanisGotra'), 'nanisGotra')}
          {gotraField(tr('matBuasGotra'), 'buasGotra')}
          {gotraField(tr('matMausisGotra'), 'mausisGotra')}
        </div>
      )}
    </div>,

    // Step 3: Surname Cross-Check
    <div key={3} className="space-y-5">
      <h2 className="font-heading text-xl font-bold">{tr('matStep3Title')}</h2>
      <p className="text-sm text-muted-foreground font-body">{tr('matStep3Desc')}</p>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matFamilySurname')}</label>
        <input value={form.familySurname} onChange={e => set('familySurname', e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matSurnamesToAvoid')}</label>
        <div className="flex gap-2">
          <input value={newSurname} onChange={e => setNewSurname(e.target.value)} className={inputClass} placeholder={tr('matAddSurname')} onKeyDown={e => e.key === 'Enter' && addSurname()} />
          <button type="button" onClick={addSurname} className="px-4 py-2 rounded-lg gradient-hero text-primary-foreground font-body text-sm shrink-0">+</button>
        </div>
        {form.surnamesToAvoid.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {form.surnamesToAvoid.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-secondary text-sm font-body">
                {s}
                <button onClick={() => set('surnamesToAvoid', form.surnamesToAvoid.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>,

    // Step 4: Kundali Data
    <div key={4} className="space-y-5">
      <h2 className="font-heading text-xl font-bold">{tr('matStep4Title')}</h2>
      <p className="text-sm text-muted-foreground font-body">{tr('matStep4Desc')}</p>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matDob')}</label>
        <input type="date" value={form.kundaliData.dob} onChange={e => setKundali('dob', e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matTimeOfBirth')}</label>
        <input type="time" value={form.kundaliData.timeOfBirth} onChange={e => setKundali('timeOfBirth', e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matTimeKnown')}</label>
        <select value={form.kundaliData.timeKnown} onChange={e => setKundali('timeKnown', e.target.value)} className={selectClass}>
          <option value="exact">{tr('matTimeExact')}</option>
          <option value="approximate">{tr('matTimeApprox')}</option>
          <option value="unknown">{tr('matTimeUnknown')}</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matPlaceOfBirth')}</label>
        <input value={form.kundaliData.placeOfBirth} onChange={e => setKundali('placeOfBirth', e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matState')}</label>
        <input value={form.kundaliData.state} onChange={e => setKundali('state', e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matCountry')}</label>
        <input value={form.kundaliData.country} onChange={e => setKundali('country', e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="block text-sm font-medium font-body mb-1.5">{tr('matBirthSource')}</label>
        <select value={form.kundaliData.birthDetailsSource} onChange={e => setKundali('birthDetailsSource', e.target.value)} className={selectClass}>
          <option value="">{tr('matSelect')}</option>
          <option value="hospital">{tr('matSourceHospital')}</option>
          <option value="family">{tr('matSourceFamily')}</option>
          <option value="pandit">{tr('matSourcePandit')}</option>
          <option value="unknown">{tr('matSourceUnknown')}</option>
        </select>
      </div>
    </div>,

    // Step 5: Review & Submit
    <div key={5} className="space-y-5">
      <h2 className="font-heading text-xl font-bold">{tr('matStep5Title')}</h2>
      <div className="space-y-3 text-sm font-body">
        <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
          <p><span className="font-medium">{tr('matSearchingFor')}:</span> {form.searchingFor}</p>
          <p><span className="font-medium">{tr('matIntent')}:</span> {form.intent}</p>
          <p><span className="font-medium">{tr('matManagement')}:</span> {form.management}</p>
        </div>
        {form.dietary && (
          <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
            <p className="font-medium">{tr('matStep1Title')}</p>
            {form.dietary && <p>{tr('matDietary')}: {form.dietary}</p>}
            {form.religiousPractice && <p>{tr('matReligiousPractice')}: {form.religiousPractice}</p>}
            {form.livingSituation && <p>{tr('matLiving')}: {form.livingSituation}</p>}
          </div>
        )}
        {form.ownGotra && (
          <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
            <p className="font-medium">{tr('matStep2Title')}</p>
            <p>{tr('matOwnGotra')}: {form.ownGotra}</p>
            <p>{tr('matGenerationAvoidance')}: {form.generationAvoidance}</p>
          </div>
        )}
        {form.kundaliData.dob && (
          <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
            <p className="font-medium">{tr('matStep4Title')}</p>
            <p>{tr('matDob')}: {form.kundaliData.dob}</p>
            <p>{tr('matPlaceOfBirth')}: {form.kundaliData.placeOfBirth}</p>
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSubmit()}
        className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {saving ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            Saving…
          </span>
        ) : (
          tr('optInMatrimony')
        )}
      </button>
      <p className="text-xs text-muted-foreground font-body text-center">{tr('matrimonyDisclaimer')}</p>
    </div>,
  ];

  const totalSteps = steps.length;

  return (
    <AppShell>
      <div className="container py-8 max-w-lg">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full gradient-hero flex items-center justify-center mx-auto mb-4">
            <Heart className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-3xl font-bold mb-2">{tr('matrimonyTitle')}</h1>
          <p className="text-muted-foreground font-body">{tr('matrimonyDesc')}</p>
        </div>

        {/* Progress */}
        <div className="flex gap-1 mb-6">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${i <= step ? 'gradient-hero' : 'bg-secondary'}`} />
          ))}
        </div>

        <div className="bg-card rounded-xl p-8 shadow-card border border-border/50">
          {steps[step]}

          {/* Navigation */}
          {step < totalSteps - 1 && (
            <div className="flex justify-between mt-8">
              <button
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={step === 0}
                className="flex items-center gap-1 px-4 py-2 text-sm font-body text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> {tr('back')}
              </button>
              <button
                onClick={() => setStep(s => Math.min(totalSteps - 1, s + 1))}
                className="flex items-center gap-1 px-6 py-2 rounded-lg gradient-hero text-primary-foreground text-sm font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
              >
                {tr('next')} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          {step > 0 && step === totalSteps - 1 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1 mt-4 text-sm font-body text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> {tr('back')}
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default MatrimonyPage;
