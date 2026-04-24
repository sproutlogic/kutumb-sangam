import { GitFork } from 'lucide-react';
import { useLang } from '@/i18n/LanguageContext';

interface DisputeForkIndicatorProps {
  fieldName: string;
  valueA: string;
  valueB: string;
}

const DisputeForkIndicator = ({ fieldName, valueA, valueB }: DisputeForkIndicatorProps) => {
  const { tr } = useLang();

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GitFork className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold font-body text-accent">{tr('disputeForkLabel')}</span>
      </div>
      <p className="text-xs text-muted-foreground font-body">{tr('disputeForkDesc')}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-body mb-1">{tr('versionA')}</p>
          <p className="text-sm font-body font-medium">{valueA}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-body mb-1">{tr('versionB')}</p>
          <p className="text-sm font-body font-medium">{valueB}</p>
        </div>
      </div>
    </div>
  );
};

export default DisputeForkIndicator;
