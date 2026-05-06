/**
 * PlanBadge — compact display of the user's resolved plan + window inside
 * the tree canvas Panel. Includes referral / topup bonus indicators.
 */
import React from "react";
import { Crown, Zap, Users, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEntitlement } from "@/contexts/EntitlementContext";

interface PlanBadgeProps {
  onUpgradeClick?: () => void;
  compact?: boolean;
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free:     <Users className="w-3.5 h-3.5" />,
  basic:    <Star className="w-3.5 h-3.5" />,
  standard: <Zap className="w-3.5 h-3.5" />,
  premium:  <Crown className="w-3.5 h-3.5" />,
};

const PLAN_COLORS: Record<string, string> = {
  free:     "bg-slate-100 text-slate-800 border-slate-300",
  basic:    "bg-emerald-100 text-emerald-900 border-emerald-300",
  standard: "bg-amber-100 text-amber-900 border-amber-400",
  premium:  "bg-gradient-to-r from-amber-200 to-rose-200 text-rose-900 border-amber-500",
};

export const PlanBadge: React.FC<PlanBadgeProps> = ({ onUpgradeClick, compact = false }) => {
  const { entitlement, loading } = useEntitlement();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
        <span className="w-3 h-3 rounded-full bg-muted" />
        Loading plan…
      </div>
    );
  }
  if (!entitlement) {
    return null;
  }

  const showRefBonus  = entitlement.referral_bonus_up + entitlement.referral_bonus_down > 0;
  const showTopupBonus = entitlement.topup_bonus_up + entitlement.topup_bonus_down > 0;
  const canUpgrade    = entitlement.plan !== "premium";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant="outline"
        className={`flex items-center gap-1.5 px-2 py-0.5 ${PLAN_COLORS[entitlement.plan] || ""}`}>
        {PLAN_ICONS[entitlement.plan]}
        <span className="font-semibold">{entitlement.plan_display_name}</span>
      </Badge>

      {!compact && (
        <span className="text-xs text-muted-foreground">
          Gen <span className="font-mono font-medium text-foreground">−{entitlement.gen_up}</span>
          {" → "}
          <span className="font-mono font-medium text-foreground">+{entitlement.gen_down}</span>
          {entitlement.max_nodes < 999999 && (
            <> • {entitlement.max_nodes} nodes</>
          )}
        </span>
      )}

      {showRefBonus && (
        <Badge variant="secondary"
               className="bg-green-50 text-green-800 border-green-300 text-[10px] py-0">
          🌿 +{entitlement.referral_bonus_up + entitlement.referral_bonus_down} from referrals
        </Badge>
      )}

      {showTopupBonus && (
        <Badge variant="secondary"
               className="bg-blue-50 text-blue-800 border-blue-300 text-[10px] py-0">
          ⚡ +{entitlement.topup_bonus_up + entitlement.topup_bonus_down} topup
        </Badge>
      )}

      {entitlement.has_admin_override && (
        <Badge variant="destructive" className="text-[10px] py-0">admin override</Badge>
      )}

      {entitlement.status === "grace_period" && (
        <Badge variant="destructive" className="text-[10px] py-0">grace period</Badge>
      )}

      {canUpgrade && onUpgradeClick && !compact && (
        <Button size="sm" variant="default" className="h-7 text-xs"
                onClick={onUpgradeClick}>
          Upgrade
        </Button>
      )}
    </div>
  );
};

export default PlanBadge;
