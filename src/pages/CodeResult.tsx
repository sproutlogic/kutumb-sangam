import { useParams, useNavigate } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import AuthShell from '@/components/shells/AuthShell';
import { ShieldCheck, Users, BookOpen, AlertTriangle, Sparkles } from 'lucide-react';

const MOCK_CODES: Record<string, 'branch' | 'referral' | 'pandit'> = {
  'KTM-FAM-29A7X': 'branch',
  'KTM-REF-8B3YZ': 'referral',
  'KTM-PND-4C1WQ': 'pandit',
};

const CodeResult = () => {
  const { code, type: legacyType } = useParams<{ code?: string; type?: string }>();
  const { tr } = useLang();
  const navigate = useNavigate();

  const resolvedType = code ? MOCK_CODES[code.toUpperCase()] : (legacyType as 'branch' | 'referral' | 'pandit' | undefined);

  // Invalid code
  if (!resolvedType) {
    return (
      <AuthShell>
        <div className="bg-card rounded-xl p-8 shadow-card border border-border/50 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="font-heading text-2xl font-bold mb-2">{tr('invalidCodeTitle')}</h1>
          <p className="text-muted-foreground font-body mb-6">{tr('invalidCodeDesc')}</p>
          <button
            onClick={() => navigate('/code')}
            className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
          >
            {tr('tryAgain')}
          </button>
        </div>
      </AuthShell>
    );
  }

  // Branch — Cinematic Homecoming Moment
  if (resolvedType === 'branch') {
    return (
      <AuthShell>
        <div className="bg-card rounded-xl shadow-card border border-border/50 overflow-hidden animate-fade-in">
          {/* Cinematic header */}
          <div className="gradient-hero text-primary-foreground p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 50% 80%, rgba(255,255,255,0.3) 0%, transparent 60%)' }} />
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 animate-pulse-warm">
                <Sparkles className="w-8 h-8 text-primary-foreground" />
              </div>
              <p className="text-sm uppercase tracking-[0.2em] opacity-80 font-body mb-2">{tr('welcomeHome')}</p>
              <h1 className="font-heading text-3xl font-bold mb-2">{tr('branchInviteTitle')}</h1>
              <p className="opacity-80 font-body text-sm">{tr('ancestorsAwait')}</p>
            </div>
          </div>

          <div className="p-8 space-y-5">
            <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between font-body text-sm">
                <span className="text-muted-foreground">{tr('familyName')}</span>
                <span className="font-medium">{tr('noDataYet')}</span>
              </div>
              <div className="flex justify-between font-body text-sm">
                <span className="text-muted-foreground">{tr('invitedBy')}</span>
                <span className="font-medium">{tr('noDataYet')}</span>
              </div>
              <div className="flex justify-between font-body text-sm">
                <span className="text-muted-foreground">{tr('branchLabel')}</span>
                <span className="font-medium">{tr('noDataYet')}</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity hover-scale"
            >
              {tr('joinFamily')}
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (resolvedType === 'referral') {
    return (
      <AuthShell>
        <div className="bg-card rounded-xl p-8 shadow-card border border-border/50 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full gradient-hero flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-2xl font-bold mb-2">{tr('referralTitle')}</h1>
          <p className="text-muted-foreground font-body mb-6">{tr('referralSubtitle')}</p>
          <div className="bg-secondary/50 rounded-lg p-4 mb-6 text-left">
            <div className="flex justify-between font-body text-sm">
              <span className="text-muted-foreground">{tr('referredBy')}</span>
              <span className="font-medium">{tr('noDataYet')}</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/onboarding')}
            className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
          >
            {tr('startMyTree')}
          </button>
        </div>
      </AuthShell>
    );
  }

  // Pandit
  return (
    <AuthShell>
      <div className="bg-card rounded-xl p-8 shadow-card border border-border/50 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-full gradient-hero flex items-center justify-center mx-auto mb-6">
          <ShieldCheck className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="font-heading text-2xl font-bold mb-2">{tr('panditTitle')}</h1>
        <p className="text-muted-foreground font-body mb-6">{tr('panditSubtitle')}</p>
        <div className="bg-secondary/50 rounded-lg p-4 mb-6 text-left space-y-2">
          <div className="flex justify-between font-body text-sm">
            <span className="text-muted-foreground">{tr('panditName')}</span>
            <span className="font-medium">{tr('noPanditAssigned')}</span>
          </div>
          <div className="flex justify-between font-body text-sm">
            <span className="text-muted-foreground">{tr('verifiedScholar')}</span>
            <span className="font-medium text-primary flex items-center gap-1">
              <ShieldCheck className="w-4 h-4" /> ✓
            </span>
          </div>
        </div>
        <button
          onClick={() => navigate('/onboarding')}
          className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
        >
          {tr('proceedWithVerification')}
        </button>
      </div>
    </AuthShell>
  );
};

export default CodeResult;
