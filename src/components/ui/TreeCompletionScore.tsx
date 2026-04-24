import { useLang } from '@/i18n/LanguageContext';

interface TreeCompletionScoreProps {
  membersUsed: number;
  maxNodes: number;
  generationsUsed: number;
  generationCap: number;
  size?: 'sm' | 'md';
}

const TreeCompletionScore = ({ membersUsed, maxNodes, generationsUsed, generationCap, size = 'md' }: TreeCompletionScoreProps) => {
  const { tr } = useLang();
  const memberPct = Math.min(100, (membersUsed / maxNodes) * 100);
  const genPct = Math.min(100, (generationsUsed / generationCap) * 100);
  const score = Math.round((memberPct * 0.6 + genPct * 0.4));
  const dims = size === 'sm' ? 'w-16 h-16' : 'w-24 h-24';
  const r = size === 'sm' ? 12 : 18;
  const circumference = 2 * Math.PI * r;
  const viewBox = size === 'sm' ? '0 0 32 32' : '0 0 48 48';
  const cx = size === 'sm' ? 16 : 24;

  return (
    <div className="flex items-center gap-3">
      <div className={`relative ${dims}`}>
        <svg viewBox={viewBox} className="w-full h-full -rotate-90">
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth={size === 'sm' ? 2.5 : 3.5} />
          <circle
            cx={cx} cy={cx} r={r} fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={size === 'sm' ? 2.5 : 3.5}
            strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center font-bold font-body text-primary ${size === 'sm' ? 'text-xs' : 'text-lg'}`}>{score}%</span>
      </div>
      <div>
        <p className={`font-semibold font-body ${size === 'sm' ? 'text-sm' : 'text-base'}`}>{tr('treeCompletion')}</p>
        <p className="text-xs text-muted-foreground font-body">{tr('treeCompletionDesc')}</p>
      </div>
    </div>
  );
};

export default TreeCompletionScore;
