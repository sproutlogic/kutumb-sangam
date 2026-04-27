import { useNavigate } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import AuthShell from '@/components/shells/AuthShell';
import { ShieldCheck } from 'lucide-react';

const ReferralPandit = () => {
  const { tr } = useLang();
  const navigate = useNavigate();

  return (
    <AuthShell theme="saffron">
      <div className="bg-card rounded-xl p-8 shadow-card border border-border/50 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-full gradient-saffron flex items-center justify-center mx-auto mb-6">
          <ShieldCheck className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="font-heading text-2xl font-bold mb-2">{tr('referralPanditTitle')}</h1>
        <p className="text-muted-foreground font-body mb-6">{tr('referralPanditDesc')}</p>
        <button
          onClick={() => navigate('/margdarshak-kyc')}
          className="w-full py-3 rounded-lg gradient-saffron text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
        >
          {tr('proceedWithVerification')}
        </button>
      </div>
    </AuthShell>
  );
};

export default ReferralPandit;
