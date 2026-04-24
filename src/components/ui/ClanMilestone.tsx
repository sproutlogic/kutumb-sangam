import { GitBranch, Layers, ShieldCheck, Users } from 'lucide-react';
import { useLang } from '@/i18n/LanguageContext';

interface Milestone {
  key: 'firstBranch' | 'threeGen' | 'panditVerified' | 'fiftyMembers';
  earned: boolean;
}

const milestoneConfig = {
  firstBranch: { icon: GitBranch, labelKey: 'milestoneFirstBranch' as const },
  threeGen: { icon: Layers, labelKey: 'milestoneThreeGen' as const },
  panditVerified: { icon: ShieldCheck, labelKey: 'milestonePanditVerified' as const },
  fiftyMembers: { icon: Users, labelKey: 'milestoneFiftyMembers' as const },
};

const ClanMilestone = ({ milestones }: { milestones: Milestone[] }) => {
  const { tr } = useLang();

  return (
    <div className="space-y-3">
      <h3 className="font-heading text-lg font-semibold">{tr('clanMilestones')}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {milestones.map((m) => {
          const config = milestoneConfig[m.key];
          const Icon = config.icon;
          return (
            <div
              key={m.key}
              className={`relative rounded-xl p-4 text-center border transition-all ${
                m.earned
                  ? 'bg-primary/5 border-primary/30 shadow-warm'
                  : 'bg-secondary/30 border-border/50 opacity-50'
              }`}
            >
              <Icon className={`w-6 h-6 mx-auto mb-2 ${m.earned ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="text-xs font-medium font-body">{tr(config.labelKey)}</p>
              <span className={`mt-1 inline-block text-[10px] px-2 py-0.5 rounded-full font-body ${
                m.earned ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
              }`}>
                {m.earned ? tr('milestoneEarned') : tr('milestoneUpcoming')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClanMilestone;
