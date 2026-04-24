import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import AuthShell from '@/components/shells/AuthShell';
import TrustBadge from '@/components/ui/TrustBadge';
import { AlertTriangle, Mail, Fingerprint, Smartphone, CheckCircle2 } from 'lucide-react';

type Step = 'email' | 'passkey' | 'approve' | 'done';

const DeviceReVerifyPage = () => {
  const { tr } = useLang();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [loading, setLoading] = useState(false);

  const advance = (next: Step) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep(next);
    }, 1000);
  };

  const steps: { key: Step; icon: typeof Mail; label: string }[] = [
    { key: 'email', icon: Mail, label: tr('step1VerifyEmail') },
    { key: 'passkey', icon: Fingerprint, label: tr('step2ConfirmPasskey') },
    { key: 'approve', icon: Smartphone, label: tr('step3ApproveDevice') },
  ];

  if (step === 'done') {
    return (
      <AuthShell>
        <div className="bg-card rounded-xl p-8 shadow-card border border-border/50 text-center animate-fade-in space-y-5">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-heading text-2xl font-bold">{tr('reVerificationComplete')}</h1>
          <p className="text-muted-foreground font-body">{tr('deviceNowTrusted')}</p>
          <TrustBadge variant="verified" compact />
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
          >
            {tr('continueToTree')}
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell maxWidth="max-w-lg">
      {/* Warning banner */}
      <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex items-start gap-3 mb-6 animate-fade-in">
        <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <h2 className="font-heading text-lg font-bold text-destructive">{tr('newDeviceDetected')}</h2>
          <p className="text-sm text-muted-foreground font-body mt-1">{tr('newDeviceDesc')}</p>
        </div>
      </div>

      {/* Steps progress */}
      <div className="flex items-center gap-2 mb-6 justify-center">
        {steps.map((s, i) => {
          const isCurrent = s.key === step;
          const isDone = steps.findIndex(x => x.key === step) > i;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold font-body transition-all ${
                isDone ? 'bg-primary/20 text-primary' : isCurrent ? 'gradient-hero text-primary-foreground shadow-warm' : 'bg-secondary text-muted-foreground'
              }`}>
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && <div className={`w-8 h-0.5 rounded ${isDone ? 'bg-primary' : 'bg-border'}`} />}
            </div>
          );
        })}
      </div>

      <div className="bg-card rounded-xl p-8 shadow-card border border-border/50 space-y-5 animate-fade-in">
        <h2 className="font-heading text-xl font-bold text-center">{tr('verifyIdentity')}</h2>

        {/* Current step */}
        <div className="text-center space-y-4">
          {(() => {
            const current = steps.find(s => s.key === step)!;
            const Icon = current.icon;
            return (
              <>
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Icon className="w-7 h-7 text-primary" />
                </div>
                <p className="font-body font-semibold">{current.label}</p>
              </>
            );
          })()}

          <button
            onClick={() => {
              if (step === 'email') advance('passkey');
              else if (step === 'passkey') advance('approve');
              else advance('done');
            }}
            disabled={loading}
            className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading ? '...' : step === 'approve' ? tr('step3ApproveDevice') : tr('next')}
          </button>
        </div>

        <TrustBadge variant="encrypted" compact />
      </div>
    </AuthShell>
  );
};

export default DeviceReVerifyPage;
