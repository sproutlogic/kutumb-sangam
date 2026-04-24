import { useNavigate } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import { Lock } from 'lucide-react';

interface LockedBannerProps {
  featureKey: string;
}

const LockedBanner: React.FC<LockedBannerProps> = ({ featureKey }) => {
  const navigate = useNavigate();
  const { tr } = useLang();

  return (
    <div className="bg-secondary/60 border border-border rounded-xl p-6 text-center">
      <Lock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
      <p className="font-body text-sm text-muted-foreground mb-3">
        {tr('lockedFeature')}
      </p>
      <button
        onClick={() => navigate('/upgrade')}
        className="px-6 py-2 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition-opacity"
      >
        {tr('upgradePlan')}
      </button>
    </div>
  );
};

export default LockedBanner;
