import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import { Lock } from 'lucide-react';
import AppShell from '@/components/shells/AppShell';

interface LockedStateProps {
  titleKey: string;
  descKey: string;
}

const LockedState: React.FC<LockedStateProps> = ({ titleKey, descKey }) => {
  const navigate = useNavigate();
  const { tr } = useLang();

  return (
    <AppShell>
      <div className="container py-16 max-w-md mx-auto">
      <div className="bg-card rounded-xl p-10 shadow-card border border-border/50 text-center">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="font-heading text-2xl font-bold mb-2">{tr(titleKey as any)}</h1>
        <p className="text-muted-foreground font-body mb-6">{tr(descKey as any)}</p>
        <button
          onClick={() => navigate('/upgrade')}
          className="px-8 py-3 rounded-lg gradient-hero text-primary-foreground font-semibold font-body shadow-warm hover:opacity-90 transition-opacity"
        >
          {tr('upgradePlan')}
        </button>
      </div>
      </div>
    </AppShell>
  );
};

export default LockedState;
