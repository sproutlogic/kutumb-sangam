import { useState, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, ShieldCheck, Banknote, Users, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getApiBaseUrl } from '@/services/api';
import { useLang } from '@/i18n/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

type Step = 'intro' | 'referral' | 'kyc' | 'bank' | 'done';

interface FormState {
  referralCode: string;
  aadhaarRaw: string;        // 12-digit number — never sent to server
  aadhaarName: string;
  aadhaarDob: string;        // YYYY-MM-DD
  kycConsent: boolean;
  bankAccountNo: string;
  bankIfsc: string;
  bankHolderName: string;
}

const EMPTY_FORM: FormState = {
  referralCode: '',
  aadhaarRaw: '',
  aadhaarName: '',
  aadhaarDob: '',
  kycConsent: false,
  bankAccountNo: '',
  bankIfsc: '',
  bankHolderName: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAadhaar(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function maskAadhaar(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  if (digits.length < 4) return '•'.repeat(digits.length);
  return '•••• •••• ' + digits.slice(-4);
}

function validateIfsc(v: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(v.trim());
}

function validateAccountNo(v: string): boolean {
  return /^\d{9,18}$/.test(v.trim());
}

// ─── Component ───────────────────────────────────────────────────────────────

export function JoinSEModal({ onClose }: Props) {
  const { tr } = useLang();
  const { session } = useAuth();
  const [step, setStep] = useState<Step>('intro');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [aadhaarFocused, setAadhaarFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  const set = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  // ── Referral step validation ──────────────────────────────────────────────

  function nextFromReferral() {
    // Referral code is optional — blank means admin-approval path
    setError('');
    setStep('kyc');
  }

  // ── KYC step validation ───────────────────────────────────────────────────

  function nextFromKyc() {
    const digits = form.aadhaarRaw.replace(/\D/g, '');
    if (digits.length !== 12) { setError(tr('seAadhaarInvalid')); return; }
    if (!form.aadhaarName.trim()) { setError(tr('seAadhaarNameRequired')); return; }
    if (!form.aadhaarDob) { setError(tr('seAadhaarDobRequired')); return; }
    if (!form.kycConsent) { setError(tr('seKycConsentRequired')); return; }
    setError('');
    setStep('bank');
  }

  // ── Bank step + submit ────────────────────────────────────────────────────

  async function submitApplication() {
    if (!validateAccountNo(form.bankAccountNo)) { setError(tr('seBankAccountInvalid')); return; }
    if (!validateIfsc(form.bankIfsc)) { setError(tr('seBankIfscInvalid')); return; }
    if (!form.bankHolderName.trim()) { setError(tr('seBankHolderRequired')); return; }

    setError('');
    setLoading(true);

    const aadhaarDigits = form.aadhaarRaw.replace(/\D/g, '');

    try {
      // Prefer in-memory session token; fallback to storage scan for compatibility.
      let token = session?.access_token ?? '';
      if (!token) {
        const keys = Object.keys(localStorage).filter(k => k.endsWith('-auth-token'));
        for (const k of keys) {
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.access_token) {
              token = parsed.access_token;
              break;
            }
          } catch {
            // Ignore malformed localStorage entries and continue.
          }
        }
      }

      const res = await fetch(`${getApiBaseUrl()}/api/sales/apply-se`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          referral_code: form.referralCode.trim().toUpperCase() || null,
          aadhaar_last4: aadhaarDigits.slice(-4),   // only last 4 sent
          aadhaar_name: form.aadhaarName.trim(),
          aadhaar_dob: form.aadhaarDob,
          kyc_consent: true,
          bank_account_no: form.bankAccountNo.trim(),
          bank_ifsc: form.bankIfsc.trim().toUpperCase(),
          bank_holder_name: form.bankHolderName.trim(),
        }),
      });

      const text = await res.text();
      let data: { detail?: string } | null = null;
      if (text) {
        try {
          data = JSON.parse(text) as { detail?: string };
        } catch {
          data = null;
        }
      }
      if (!res.ok) {
        setError(data?.detail ?? tr('seSubmitError'));
        return;
      }
      setStep('done');
    } catch {
      setError(tr('seSubmitError'));
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border/50 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <span className="font-heading font-bold text-base">{tr('seEnrollTitle')}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        {step !== 'intro' && step !== 'done' && (
          <div className="flex gap-1.5 px-6 pt-4">
            {(['referral', 'kyc', 'bank'] as const).map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  ['referral', 'kyc', 'bank'].indexOf(step) >= i ? 'bg-primary' : 'bg-border'
                }`}
              />
            ))}
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* ── Step: intro ─────────────────────────────────────── */}
          {step === 'intro' && (
            <>
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-primary-foreground" />
                </div>
                <h2 className="font-heading text-xl font-bold mb-2">{tr('joinSalesTeam')}</h2>
                <p className="text-sm text-muted-foreground font-body">{tr('seIntroDesc')}</p>
              </div>

              <div className="space-y-3">
                {[
                  { icon: '🌿', label: tr('sePerSale'), sub: tr('sePerSaleSub') },
                  { icon: '🌐', label: tr('seNetwork'), sub: tr('seNetworkSub') },
                  { icon: '🏦', label: tr('seWallet'), sub: tr('seWalletSub') },
                ].map((b, i) => (
                  <div key={i} className="flex items-start gap-3 bg-secondary/30 rounded-xl p-3">
                    <span className="text-xl mt-0.5">{b.icon}</span>
                    <div>
                      <p className="text-sm font-semibold font-body">{b.label}</p>
                      <p className="text-xs text-muted-foreground font-body">{b.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground font-body text-center">{tr('seIntroLegal')}</p>
            </>
          )}

          {/* ── Step: referral ──────────────────────────────────── */}
          {step === 'referral' && (
            <>
              <div>
                <h3 className="font-heading font-bold text-base mb-1">{tr('seReferralTitle')}</h3>
                <p className="text-sm text-muted-foreground font-body">{tr('seReferralDesc')}</p>
              </div>
              <div>
                <label className="block text-xs font-medium font-body mb-1.5">{tr('seReferralCode')}</label>
                <input
                  type="text"
                  value={form.referralCode}
                  onChange={e => set({ referralCode: e.target.value.toUpperCase().trim() })}
                  placeholder={tr('seReferralPlaceholder')}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p className="text-xs text-muted-foreground font-body mt-1.5">{tr('seReferralHint')}</p>
              </div>
            </>
          )}

          {/* ── Step: kyc ───────────────────────────────────────── */}
          {step === 'kyc' && (
            <>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <h3 className="font-heading font-bold text-base">{tr('seKycTitle')}</h3>
              </div>

              {/* Aadhaar number */}
              <div>
                <label className="block text-xs font-medium font-body mb-1.5">{tr('seAadhaarNumber')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={aadhaarFocused ? formatAadhaar(form.aadhaarRaw) : (form.aadhaarRaw ? maskAadhaar(form.aadhaarRaw) : '')}
                  onFocus={() => setAadhaarFocused(true)}
                  onBlur={() => setAadhaarFocused(false)}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '').slice(0, 12);
                    set({ aadhaarRaw: raw });
                  }}
                  placeholder="XXXX XXXX XXXX"
                  maxLength={14}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p className="text-xs text-muted-foreground font-body mt-1">{tr('seAadhaarMaskNote')}</p>
              </div>

              <div>
                <label className="block text-xs font-medium font-body mb-1.5">{tr('seAadhaarName')}</label>
                <input
                  type="text"
                  value={form.aadhaarName}
                  onChange={e => set({ aadhaarName: e.target.value })}
                  placeholder={tr('seAadhaarNamePlaceholder')}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium font-body mb-1.5">{tr('seAadhaarDob')}</label>
                <input
                  type="date"
                  value={form.aadhaarDob}
                  onChange={e => set({ aadhaarDob: e.target.value })}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* KYC Consent */}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <input
                    id="kyc-consent"
                    type="checkbox"
                    checked={form.kycConsent}
                    onChange={e => set({ kycConsent: e.target.checked })}
                    className="mt-0.5 accent-primary"
                  />
                  <label htmlFor="kyc-consent" className="text-xs text-foreground/80 font-body leading-relaxed cursor-pointer">
                    {tr('seKycConsentText')}
                  </label>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-secondary/30 rounded-lg px-3 py-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-muted-foreground font-body">{tr('seAadhaarLegalNote')}</p>
              </div>
            </>
          )}

          {/* ── Step: bank ──────────────────────────────────────── */}
          {step === 'bank' && (
            <>
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-primary" />
                <h3 className="font-heading font-bold text-base">{tr('seBankTitle')}</h3>
              </div>
              <p className="text-sm text-muted-foreground font-body">{tr('seBankDesc')}</p>

              <div>
                <label className="block text-xs font-medium font-body mb-1.5">{tr('seBankAccountNo')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.bankAccountNo}
                  onChange={e => set({ bankAccountNo: e.target.value.replace(/\D/g, '').slice(0, 18) })}
                  placeholder="e.g. 1234567890"
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium font-body mb-1.5">{tr('seBankIfsc')}</label>
                <input
                  type="text"
                  value={form.bankIfsc}
                  onChange={e => set({ bankIfsc: e.target.value.toUpperCase().slice(0, 11) })}
                  placeholder="e.g. SBIN0001234"
                  maxLength={11}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {form.bankIfsc.length === 11 && !validateIfsc(form.bankIfsc) && (
                  <p className="text-xs text-destructive font-body mt-1">{tr('seBankIfscInvalid')}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium font-body mb-1.5">{tr('seBankHolderName')}</label>
                <input
                  type="text"
                  value={form.bankHolderName}
                  onChange={e => set({ bankHolderName: e.target.value })}
                  placeholder={tr('seBankHolderPlaceholder')}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div className="flex items-start gap-2 bg-secondary/30 rounded-lg px-3 py-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-muted-foreground font-body">{tr('seBankLegalNote')}</p>
              </div>
            </>
          )}

          {/* ── Step: done ──────────────────────────────────────── */}
          {step === 'done' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950/50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="font-heading text-xl font-bold mb-2">{tr('seSubmitDoneTitle')}</h2>
              <p className="text-sm text-muted-foreground font-body mb-6">{tr('seSubmitDoneDesc')}</p>
              <div className="bg-secondary/30 rounded-xl p-4 text-left space-y-2 mb-2">
                {[
                  tr('seSubmitStep1'),
                  tr('seSubmitStep2'),
                  tr('seSubmitStep3'),
                ].map((s, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                    <p className="text-xs font-body text-foreground/80">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-destructive font-body">{error}</p>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="px-6 py-4 border-t border-border/50 flex gap-3">
          {step === 'intro' && (
            <button
              onClick={() => setStep('referral')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition-opacity"
            >
              {tr('getStarted')} <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 'referral' && (
            <>
              <button
                onClick={() => { setError(''); setStep('intro'); }}
                className="px-4 py-2.5 rounded-lg border border-border font-body text-sm hover:bg-secondary transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> {tr('back')}
              </button>
              <button
                onClick={nextFromReferral}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition-opacity"
              >
                {tr('next')} <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
          {step === 'kyc' && (
            <>
              <button
                onClick={() => { setError(''); setStep('referral'); }}
                className="px-4 py-2.5 rounded-lg border border-border font-body text-sm hover:bg-secondary transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> {tr('back')}
              </button>
              <button
                onClick={nextFromKyc}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition-opacity"
              >
                {tr('next')} <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
          {step === 'bank' && (
            <>
              <button
                onClick={() => { setError(''); setStep('kyc'); }}
                className="px-4 py-2.5 rounded-lg border border-border font-body text-sm hover:bg-secondary transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> {tr('back')}
              </button>
              <button
                onClick={submitApplication}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? tr('submitting') : tr('seSubmitBtn')}
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition-opacity"
            >
              {tr('done')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
