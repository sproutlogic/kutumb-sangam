import { usePlan } from '@/contexts/PlanContext';
import { useLang } from '@/i18n/LanguageContext';
import { useTree } from '@/contexts/TreeContext';
import AppShell from '@/components/shells/AppShell';
import LockedState from '@/components/states/LockedState';
import LockedBanner from '@/components/states/LockedBanner';
import { Search, Eye, EyeOff, Users, Lock, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { privacyLevelsForPlan } from '@/engine/privacy';
import type { NodePrivacyLevel } from '@/engine/types';

/** Human-readable label + icon for each privacy level. */
const LEVEL_META: Record<NodePrivacyLevel, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  private:            { label: 'Private (only you)',     icon: Lock },
  parents:            { label: 'Parents',                icon: UserCheck },
  grandparents:       { label: 'Grandparents',           icon: Users },
  great_grandparents: { label: 'Great-grandparents',     icon: Users },
  custom_five_nodes:  { label: 'Custom (5 people)',      icon: UserCheck },
  public:             { label: 'Public',                 icon: Eye },
};

const DiscoveryPage = () => {
  const { hasEntitlement, planId } = usePlan();
  const { tr } = useLang();
  const { state, setNodePrivacy } = useTree();

  if (!hasEntitlement('discovery')) {
    return <LockedState titleKey="discoveryLockedTitle" descKey="discoveryLockedDesc" />;
  }

  // Plan-gated privacy levels: only show what the current plan allows
  const allowedLevels = privacyLevelsForPlan(planId);

  const handleVisibilityChange = (nodeId: string, level: NodePrivacyLevel) => {
    setNodePrivacy(nodeId, level);
    const meta = LEVEL_META[level];
    toast.success(`Visibility updated → ${meta?.label ?? level}`);
  };

  return (
    <AppShell>
      <div className="container py-8 max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-full gradient-hero flex items-center justify-center mx-auto mb-4 shadow-warm">
            <Search className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-3xl font-bold mb-2">{tr('discoveryTitle')}</h1>
          <p className="text-muted-foreground font-body">{tr('discoveryDesc')}</p>
        </div>

        {/* Explainer */}
        <div className="bg-secondary/50 rounded-xl p-4 border border-border/50 text-sm text-muted-foreground font-body">
          {tr('visibilityExplainer')}
        </div>

        {/* Per-node visibility controls */}
        <div className="space-y-3">
          {state.nodes.length === 0 && (
            <p className="text-center text-sm text-muted-foreground font-body py-8">{tr('noNodesYet')}</p>
          )}
          {state.nodes.map(node => {
            const isOwned = node.ownerId === state.currentUserId || node.createdBy === state.currentUserId;
            // node.visibility is already a NodePrivacyLevel after normalizeNodePrivacy
            const currentLevel = (node.visibility as NodePrivacyLevel) || 'public';
            const CurrentIcon = LEVEL_META[currentLevel]?.icon ?? Eye;

            return (
              <div
                key={node.id}
                className="bg-card rounded-xl p-5 shadow-card border border-border/50 flex items-center justify-between gap-4 hover:shadow-elevated transition-shadow"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-body font-semibold text-sm truncate">{node.name}</p>
                  <p className="text-xs text-muted-foreground font-body capitalize">{node.relation}</p>
                </div>

                {isOwned ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <CurrentIcon className="w-4 h-4 text-primary shrink-0" />
                    <select
                      value={currentLevel}
                      onChange={e => handleVisibilityChange(node.id, e.target.value as NodePrivacyLevel)}
                      className="px-3 py-1.5 rounded-lg border border-input bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-ring/30 min-w-[160px]"
                    >
                      {allowedLevels.map(level => (
                        <option key={level} value={level}>
                          {LEVEL_META[level]?.label ?? level}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-body shrink-0">
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>{tr('onlyOwnerCanChange')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Connection chains sub-gate */}
        {!hasEntitlement('connectionChains') && (
          <div className="mt-4">
            <LockedBanner featureKey="connectionChains" />
            <p className="text-xs text-muted-foreground font-body text-center mt-2">{tr('connectionChainsLocked')}</p>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default DiscoveryPage;
