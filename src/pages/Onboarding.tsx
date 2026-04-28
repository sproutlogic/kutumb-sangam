import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import { useTree } from '@/contexts/TreeContext';
import { useAuth } from '@/contexts/AuthContext';
import { backendPayloadToTreeState } from '@/services/mapVanshaPayload';
import { bootstrapOnboardingTree, getApiBaseUrl } from '@/services/api';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { Loader2, Mail, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const ONBOARDING_DRAFT_KEY = 'kutumb_onboarding_draft';

/** Three-field DD / MM / YYYY date-of-birth input. Emits YYYY-MM-DD strings. */
function DOBInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const currentYear = new Date().getFullYear();
  const [dd, setDd] = useState('');
  const [mm, setMm] = useState('');
  const [yyyy, setYyyy] = useState('');
  const mmRef = useRef<HTMLInputElement>(null);
  const yyyyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-');
      setYyyy(y); setMm(m); setDd(d);
    }
  }, [value]);

  const emit = (d: string, m: string, y: string) => {
    if (d.length === 2 && m.length === 2 && y.length === 4) {
      onChange(`${y}-${m}-${d}`);
    } else {
      onChange('');
    }
  };

  const handleDd = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setDd(clean);
    emit(clean, mm, yyyy);
    if (clean.length === 2) mmRef.current?.focus();
  };

  const handleMm = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setMm(clean);
    emit(dd, clean, yyyy);
    if (clean.length === 2) yyyyRef.current?.focus();
  };

  const handleYyyy = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 4);
    const num = parseInt(clean, 10);
    const clamped = clean.length === 4 && num > currentYear ? String(currentYear) : clean;
    setYyyy(clamped);
    emit(dd, mm, clamped);
  };

  const seg = `border border-input bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 rounded-lg text-center`;
  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <input
        type="text" inputMode="numeric" placeholder="DD"
        value={dd} onChange={e => handleDd(e.target.value)}
        className={`${seg} w-14 px-2 py-2.5`} maxLength={2}
      />
      <span className="text-muted-foreground">/</span>
      <input
        ref={mmRef} type="text" inputMode="numeric" placeholder="MM"
        value={mm} onChange={e => handleMm(e.target.value)}
        className={`${seg} w-14 px-2 py-2.5`} maxLength={2}
      />
      <span className="text-muted-foreground">/</span>
      <input
        ref={yyyyRef} type="text" inputMode="numeric" placeholder="YYYY"
        value={yyyy} onChange={e => handleYyyy(e.target.value)}
        className={`${seg} w-20 px-2 py-2.5`} maxLength={4}
      />
    </div>
  );
}

const defaultForm = () => ({
  givenName: '',
  middleName: '',
  surname: '',
  dateOfBirth: '',
  ancestralPlace: '',
  currentResidence: '',
  treeName: '',
  fatherName: '',
  motherName: '',
  spouseName: '',
});

const Onboarding = () => {
  const { tr } = useLang();
  const { loadTreeState } = useTree();
  const { session, appUser, refreshAppUser } = useAuth();
  const navigate = useNavigate();

  // Skip onboarding only when profile is actually linked to a vansha/tree.
  // If onboarding flag is true but vansha_id is missing, allow user to fill form.
  useEffect(() => {
    if (appUser && appUser.onboarding_complete && appUser.vansha_id) {
      navigate('/dashboard', { replace: true });
    }
  }, [appUser, navigate]);

  // Step 0 = auth (shown only when no session); steps 1-3 = form
  const [step, setStep] = useState(session ? 1 : 0);
  const [form, setForm] = useState(() => defaultForm());
  const [creating, setCreating] = useState(false);

  // Auth step state
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [magicSent, setMagicSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  // Advance from step 0 once session arrives
  useEffect(() => {
    if (session && step === 0) setStep(1);
  }, [session, step]);

  const handleGoogle = async () => {
    if (!supabase) return;
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/onboarding` },
    });
    if (error) {
      toast({ title: 'Google sign-in failed', description: error.message, variant: 'destructive' });
      setGoogleLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !supabase) return;
    setEmailLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    setEmailLoading(false);
    if (error) {
      toast({ title: 'Could not send link', description: error.message, variant: 'destructive' });
    } else {
      setMagicSent(true);
    }
  };
  /** Avoid writing sessionStorage until we've read any existing draft (prevents wiping data on refresh). */
  const [draftReady, setDraftReady] = useState(false);

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
        gotra: '',
        father_name: form.fatherName.trim(),
        mother_name: form.motherName.trim(),
        spouse_name: form.spouseName.trim(),
        identity: {
          given_name: form.givenName.trim(),
          middle_name: form.middleName.trim(),
          surname: form.surname.trim(),
          date_of_birth: form.dateOfBirth.trim(),
          ancestral_place: form.ancestralPlace.trim(),
          current_residence: form.currentResidence.trim(),
          gender: 'male',
        },
      });
      loadTreeState(backendPayloadToTreeState(payload));

      // Mark onboarding complete — closes the auth backdoor
      try {
        const token = session?.access_token;
        if (token) {
          // Persist the newly created vansha on the user's profile.
          await fetch(`${getApiBaseUrl()}/api/auth/me`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ vansha_id: payload.vansha_id }),
          });
          await fetch(`${getApiBaseUrl()}/api/auth/complete-onboarding`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
          await refreshAppUser();
        }
      } catch {
        /* non-fatal — user can still proceed; flag will be set on next session sync */
      }

      // Onboarding complete — land on Eco-Sewa (the app home).
      navigate('/dashboard', { replace: true });
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
        {/* Progress — step 0 shows as pre-step; steps 1-3 are numbered */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {/* Auth dot */}
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold font-body transition-all ${
            step >= 1 ? 'bg-emerald-500 text-white' : 'gradient-hero text-primary-foreground shadow-warm'
          }`}>
            {step >= 1 ? <CheckCircle2 className="w-4 h-4" /> : '✦'}
          </div>
          <div className={`w-8 h-0.5 rounded ${step >= 1 ? 'bg-primary' : 'bg-border'}`} />
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold font-body transition-all ${
                s <= step ? 'gradient-hero text-primary-foreground shadow-warm' : 'bg-secondary text-muted-foreground'
              }`}>
                {s}
              </div>
              {s < 3 && <div className={`w-8 h-0.5 rounded ${s < step ? 'bg-primary' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-card rounded-xl p-8 shadow-card border border-border/50">
          {/* ── Step 0: Authenticate ── */}
          {step === 0 && (
            <div className="space-y-5 animate-fade-in">
              <div className="text-center mb-6">
                <a href="https://ecotech.co.in" target="_blank" rel="noopener noreferrer" className="text-[10px] tracking-[0.15em] uppercase text-emerald-600 font-body mb-1 hover:underline inline-block">Prakriti by Aarush</a>
                <h2 className="font-heading text-2xl font-bold">Start Your Green Journey</h2>
                <p className="text-muted-foreground font-body mt-1 text-sm">Sign in to begin building your Harit Vanshavali</p>
              </div>

              <button
                onClick={handleGoogle}
                disabled={googleLoading}
                className="w-full py-3.5 rounded-lg bg-white border border-gray-300 text-gray-800 font-semibold font-body shadow-sm hover:shadow-md hover:bg-gray-50 transition-all flex items-center justify-center gap-3 disabled:opacity-60"
              >
                {googleLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleIcon />}
                {googleLoading ? 'Redirecting…' : 'Continue with Google'}
              </button>

              <div className="border border-border/50 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowEmail(!showEmail)}
                  className="w-full px-5 py-3.5 flex items-center justify-between text-sm text-muted-foreground font-body hover:bg-secondary/30 transition-colors"
                >
                  <span className="flex items-center gap-2"><Mail className="w-4 h-4" />Use email instead</span>
                  {showEmail ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showEmail && (
                  <div className="px-5 pb-5 border-t border-border/50 pt-4">
                    {magicSent ? (
                      <div className="text-center space-y-3 py-2">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                        <p className="font-body text-sm font-medium">Check your inbox</p>
                        <p className="font-body text-xs text-muted-foreground">
                          We sent a sign-in link to <strong>{email}</strong>.<br />Click it to continue.
                        </p>
                        <button onClick={() => { setMagicSent(false); setEmail(''); }} className="text-xs text-primary font-body hover:underline">
                          Use a different email
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleMagicLink} className="space-y-3">
                        <input
                          type="email" value={email} onChange={e => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full px-4 py-2.5 rounded-lg border border-input bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                          required autoFocus
                        />
                        <button
                          type="submit" disabled={emailLoading || !email.trim()}
                          className="w-full py-2.5 rounded-lg border border-primary text-primary font-semibold font-body hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {emailLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                          Send magic link
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>

              <p className="text-center text-xs text-muted-foreground font-body">
                Already have an account?{' '}
                <button onClick={() => navigate('/signin')} className="text-primary font-medium hover:underline">Sign in</button>
              </p>
            </div>
          )}
          {step === 1 && (
            <form className="space-y-5 animate-fade-in" onSubmit={e => { e.preventDefault(); if (identityComplete) setStep(2); }}>
              <div className="text-center mb-6">
                <h2 className="font-heading text-2xl font-bold">{tr('onboardStep1Title')}</h2>
                <p className="text-muted-foreground font-body mt-1">{tr('onboardStep1Subtitle')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('givenName')}</label>
                <input value={form.givenName} onChange={(e) => set('givenName', e.target.value)} className={inputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('middleName')}</label>
                <input value={form.middleName} onChange={(e) => set('middleName', e.target.value)} className={inputClass} placeholder="Optional" />
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('surname')}</label>
                <input value={form.surname} onChange={(e) => set('surname', e.target.value)} className={inputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('dateOfBirth')}</label>
                <DOBInput value={form.dateOfBirth} onChange={v => set('dateOfBirth', v)} className="w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('ancestralPlace')}</label>
                <input value={form.ancestralPlace} onChange={(e) => set('ancestralPlace', e.target.value)} className={inputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium font-body mb-1.5">{tr('currentResidence')}</label>
                <input value={form.currentResidence} onChange={(e) => set('currentResidence', e.target.value)} className={inputClass} required />
              </div>


              <button
                type="submit"
                disabled={!identityComplete}
                className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {tr('next')}
              </button>
            </form>
          )}

          {step === 2 && (
            <form className="space-y-5 animate-fade-in" onSubmit={e => { e.preventDefault(); setStep(3); }}>
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
                  type="submit"
                  className="flex-1 py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
                >
                  {tr('next')}
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form className="space-y-5 animate-fade-in" onSubmit={e => { e.preventDefault(); void handleCreate(); }}>
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
                  <label className="block text-sm font-medium font-body mb-1.5">{tr('middleName')}</label>
                  <input value={form.middleName} onChange={(e) => set('middleName', e.target.value)} className={inputClass} placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">{tr('surname')}</label>
                  <input value={form.surname} onChange={(e) => set('surname', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium font-body mb-1.5">{tr('dateOfBirth')}</label>
                  <DOBInput value={form.dateOfBirth} onChange={v => set('dateOfBirth', v)} className="w-full" />
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
                  type="submit"
                  disabled={creating}
                  className={`flex-1 py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity relative z-10 ${
                    identityComplete ? '' : 'opacity-70'
                  }`}
                >
                  {creating ? 'Creating...' : tr('createTree')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
