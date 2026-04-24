import { useNavigate } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import AuthShell from '@/components/shells/AuthShell';
import { BookOpen } from 'lucide-react';

const ReferralNewTree = () => {
  const { tr } = useLang();
  const navigate = useNavigate();

  return (
    <AuthShell>
      <div className="bg-card rounded-xl p-8 shadow-card border border-border/50 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-full gradient-hero flex items-center justify-center mx-auto mb-6">
          <BookOpen className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="font-heading text-2xl font-bold mb-2">{tr('referralNewTreeTitle')}</h1>
        <p className="text-muted-foreground font-body mb-6">{tr('referralNewTreeDesc')}</p>
        <button
          onClick={() => navigate('/onboarding')}
          className="w-full py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
        >
          {tr('startMyTree')}
        </button>
      </div>
    </AuthShell>
  );
};

export default ReferralNewTree;
