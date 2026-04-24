import { Shield, ShieldCheck, Lock, Eye } from 'lucide-react';
import { useLang } from '@/i18n/LanguageContext';

type TrustVariant = 'trust-score' | 'encrypted' | 'verified' | 'consent-active';

interface TrustBadgeProps {
  variant: TrustVariant;
  score?: number;
  compact?: boolean;
}

const variantConfig = {
  'trust-score': { icon: Shield, labelKey: 'trustScore' as const, colorClass: 'text-primary' },
  'encrypted': { icon: Lock, labelKey: 'endToEndEncrypted' as const, colorClass: 'text-gold' },
  'verified': { icon: ShieldCheck, labelKey: 'verified' as const, colorClass: 'text-primary' },
  'consent-active': { icon: Eye, labelKey: 'consentActive' as const, colorClass: 'text-accent' },
};

const TrustBadge = ({ variant, score, compact = false }: TrustBadgeProps) => {
  const { tr } = useLang();
  const config = variantConfig[variant];
  const Icon = config.icon;

  if (variant === 'trust-score' && score !== undefined) {
    return (
      <div className="flex items-center gap-3">
        <div className="relative w-12 h-12">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15.5" fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="3"
              strokeDasharray={`${score * 0.974} 97.4`}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold font-body text-primary">{score}%</span>
        </div>
        {!compact && (
          <div>
            <p className="text-sm font-semibold font-body">{tr('trustScore')}</p>
            <p className="text-xs text-muted-foreground font-body">{tr('trustScoreDesc')}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/60 backdrop-blur-sm border border-border/50 ${compact ? '' : 'pr-3'}`}>
      <Icon className={`w-3.5 h-3.5 ${config.colorClass}`} />
      {!compact && <span className="text-xs font-medium font-body text-foreground">{tr(config.labelKey)}</span>}
      <span className={`w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse`} />
    </div>
  );
};

export default TrustBadge;
