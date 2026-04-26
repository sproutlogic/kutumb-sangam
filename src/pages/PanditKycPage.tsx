import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import AuthShell from '@/components/shells/AuthShell';
import TrustBadge from '@/components/ui/TrustBadge';
import { ShieldCheck, CheckCircle2, FileText, Clock, Users } from 'lucide-react';

const PanditKycPage = () => {
  const { tr } = useLang();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    fullName: '', phoneNumber: '',
    yearsExperience: '', specialization: '', templeAffiliation: '',
    documentName: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const inputClass = "w-full px-4 py-2.5 rounded-lg border border-input bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring/30";

  const handleSubmit = () => {
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <AuthShell maxWidth="max-w-lg" theme="saffron">
        <div className="bg-card rounded-xl p-8 shadow-card border border-border/50 text-center space-y-5 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center mx-auto">
            <Clock className="w-8 h-8 text-gold" />
          </div>
          <h1 className="font-heading text-2xl font-bold">{tr('verificationPending')}</h1>
          <p className="text-muted-foreground font-body">{tr('verificationPendingDesc')}</p>
          <TrustBadge variant="verified" compact />
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-3 rounded-lg gradient-saffron text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
          >
            {tr('continueToTree')}
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell maxWidth="max-w-lg" theme="saffron">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full gradient-saffron flex items-center justify-center mx-auto mb-4 shadow-warm">
          <ShieldCheck className="w-8 h-8 text-primary-foreground" />
        </div>
        <p className="text-[10px] tracking-[0.15em] uppercase text-emerald-600 font-body mb-1">Paryavaran Mitra Enrollment</p>
        <h1 className="font-heading text-2xl font-bold mb-2">{tr('panditKycTitle')}</h1>
        <p className="text-muted-foreground font-body">{tr('panditKycSubtitle')}</p>
      </div>

      {/* Community verification note */}
      <div className="bg-secondary/30 rounded-lg p-4 flex items-start gap-3 mb-6">
        <Users className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-body font-medium">{tr('communityVerification')}</p>
          <p className="text-xs text-muted-foreground font-body mt-1">{tr('communityVerificationDesc')}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-6 justify-center">
        {[1, 2].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold font-body transition-all ${
              s <= step ? 'gradient-saffron text-primary-foreground shadow-warm' : 'bg-secondary text-muted-foreground'
            }`}>
              {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
            </div>
            {s < 2 && <div className={`w-12 h-0.5 rounded ${s < step ? 'bg-primary' : 'bg-border'}`} />}
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl p-8 shadow-card border border-border/50">
        {/* Step 1 — Personal Details */}
        {step === 1 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="font-heading text-lg font-bold text-center">{tr('panditKycStep1')}</h2>
            <div>
              <label className="block text-sm font-medium font-body mb-1.5">{tr('fullName')}</label>
              <input value={form.fullName} onChange={e => set('fullName', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium font-body mb-1.5">{tr('phoneNumber')}</label>
              <input value={form.phoneNumber} onChange={e => set('phoneNumber', e.target.value)} placeholder="+91 98765 43210" className={inputClass} />
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full py-3 rounded-lg gradient-saffron text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
            >
              {tr('next')}
            </button>
          </div>
        )}

        {/* Step 2 — Credentials, Experience & Document */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="font-heading text-lg font-bold text-center">{tr('panditKycStep2')}</h2>
            <div>
              <label className="block text-sm font-medium font-body mb-1.5">{tr('yearsExperience')}</label>
              <input value={form.yearsExperience} onChange={e => set('yearsExperience', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium font-body mb-1.5">{tr('specialization')}</label>
              <input value={form.specialization} onChange={e => set('specialization', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium font-body mb-1.5">{tr('templeAffiliation')}</label>
              <input value={form.templeAffiliation} onChange={e => set('templeAffiliation', e.target.value)} className={inputClass} />
            </div>

            {/* Document upload */}
            <div className="border-t border-border pt-5">
              <label className="block text-sm font-medium font-body mb-1.5">{tr('documentUploadLabel')}</label>
              <p className="text-xs text-muted-foreground font-body mb-3">{tr('documentUploadDesc')}</p>
              <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-border bg-secondary/20 cursor-pointer hover:bg-secondary/40 transition-colors">
                <FileText className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-body text-muted-foreground">
                  {form.documentName || tr('chooseFile')}
                </span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={e => set('documentName', e.target.files?.[0]?.name || '')}
                />
              </label>
            </div>

            <TrustBadge variant="encrypted" compact />

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-lg border border-border font-semibold font-body text-muted-foreground hover:bg-secondary transition-colors">
                {tr('back')}
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 py-3 rounded-lg gradient-saffron text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
              >
                {tr('submitForReview')}
              </button>
            </div>

            <p className="text-xs text-muted-foreground font-body text-center">{tr('disclaimer')}</p>
          </div>
        )}
      </div>
    </AuthShell>
  );
};

export default PanditKycPage;
