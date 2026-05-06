/**
 * UpgradeDrawer — plan comparison + (stubbed) checkout.
 *
 * Pulls active plans from /api/subscriptions/plans, lets user pick monthly /
 * annual, calls /checkout to get a mock order_id, then immediately calls
 * /verify in dev/stub mode to flip the subscription on. When Razorpay is wired,
 * the verify call moves into the Razorpay success callback.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Loader2 } from "lucide-react";
import {
  fetchTreePlans,
  checkoutPlan,
  verifyPlan,
  type TreePlan,
} from "@/services/entitlementApi";
import { useEntitlement } from "@/contexts/EntitlementContext";

interface UpgradeDrawerProps {
  open: boolean;
  onClose: () => void;
}

type Period = "monthly" | "annual";

export const UpgradeDrawer: React.FC<UpgradeDrawerProps> = ({ open, onClose }) => {
  const { entitlement, refresh } = useEntitlement();
  const [plans, setPlans] = useState<TreePlan[]>([]);
  const [period, setPeriod] = useState<Period>("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchTreePlans()
      .then((res) => setPlans(res.plans))
      .catch((e) => toast.error(`Could not load plans: ${e instanceof Error ? e.message : e}`))
      .finally(() => setLoading(false));
  }, [open]);

  const handleUpgrade = async (plan: TreePlan) => {
    setBusy(plan.id);
    try {
      const checkout = await checkoutPlan({
        plan_id: plan.id,
        billing_period: period,
        use_igst: true,
      });

      // STUB: skip Razorpay UI for now — flip subscription on directly.
      // When Razorpay is live, open Razorpay.checkout({...}) and call verifyPlan
      // from the success handler instead.
      if (!checkout.gateway_ready) {
        toast.message("Payment gateway pending — activating in dev/stub mode.", {
          description: `Order id: ${checkout.order_id}`,
        });
        await verifyPlan({
          gateway_order_id: checkout.order_id,
          gateway_payment_id: `pay_mock_${checkout.order_id.slice(-8)}`,
        });
        toast.success(`${plan.display_name} activated.`);
        await refresh();
        onClose();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upgrade failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <Crown className="text-amber-500" /> Upgrade your tree window
          </SheetTitle>
          <SheetDescription>
            Each plan extends how many generations you can see, centred on your own node.
          </SheetDescription>
        </SheetHeader>

        <div className="flex justify-center mb-4">
          <div className="inline-flex rounded-md border bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setPeriod("monthly")}
              className={`px-4 py-1.5 text-sm rounded ${
                period === "monthly" ? "bg-background shadow font-medium" : "text-muted-foreground"
              }`}
            >Monthly</button>
            <button
              type="button"
              onClick={() => setPeriod("annual")}
              className={`px-4 py-1.5 text-sm rounded ${
                period === "annual" ? "bg-background shadow font-medium" : "text-muted-foreground"
              }`}
            >Annual <Badge variant="secondary" className="ml-1 text-[10px]">save</Badge></button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map((plan) => {
            const price = period === "monthly" ? plan.price_inr_monthly : plan.price_inr_annual;
            const isCurrent = entitlement?.plan === plan.name;
            const isFree = plan.name === "free";
            return (
              <Card key={plan.id}
                className={`p-4 relative ${
                  isCurrent ? "ring-2 ring-amber-500" : ""
                }`}>
                {isCurrent && (
                  <Badge className="absolute -top-2 right-4 bg-amber-500">Current</Badge>
                )}
                <h3 className="text-lg font-bold mb-1">{plan.display_name}</h3>
                {plan.description && (
                  <p className="text-xs text-muted-foreground mb-3">{plan.description}</p>
                )}
                <div className="text-2xl font-bold mb-1">
                  {isFree ? "₹0" : `₹${price}`}
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    / {period === "monthly" ? "month" : "year"}
                  </span>
                </div>
                <ul className="text-xs space-y-1 mt-3 mb-4">
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-emerald-600" />
                    Gen window: <strong>−{plan.gen_up} → +{plan.gen_down}</strong>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-emerald-600" />
                    Up to {plan.max_intentional_nodes >= 999999 ? "unlimited" : plan.max_intentional_nodes} nodes
                  </li>
                  {Object.entries(plan.features).filter(([, v]) => v).map(([k]) => (
                    <li key={k} className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-emerald-600" />
                      {k.replace(/_/g, " ")}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  disabled={isCurrent || isFree || busy === plan.id}
                  onClick={() => handleUpgrade(plan)}
                >
                  {busy === plan.id ? <Loader2 className="animate-spin w-4 h-4" /> :
                   isCurrent ? "Current plan" :
                   isFree ? "Free tier" :
                   "Upgrade"}
                </Button>
              </Card>
            );
          })}
        </div>

        <div className="mt-6 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <strong>Note:</strong> Payment gateway integration (Razorpay) is pending.
          Plan activation runs in dev/stub mode — your subscription will be flipped
          on without an actual charge.
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default UpgradeDrawer;
