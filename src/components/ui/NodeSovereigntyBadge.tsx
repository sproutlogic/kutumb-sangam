import { Shield } from 'lucide-react';
import { useLang } from '@/i18n/LanguageContext';

const NodeSovereigntyBadge = () => {
  const { tr } = useLang();

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20 mb-6">
      <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center flex-shrink-0">
        <Shield className="w-5 h-5 text-primary-foreground" />
      </div>
      <div>
        <p className="text-sm font-semibold font-body text-foreground">{tr('nodeSovereignty')}</p>
        <p className="text-xs text-muted-foreground font-body">{tr('nodeSovereigntyDesc')}</p>
      </div>
    </div>
  );
};

export default NodeSovereigntyBadge;
