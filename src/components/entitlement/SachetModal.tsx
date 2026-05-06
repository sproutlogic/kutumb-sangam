/**
 * SachetModal — purchase modal for ghost-node unlocks, branch bundles, and
 * generation topups. Triggered from a tap on a LockedNode boundary card.
 *
 * Stubbed payments: checkout returns a mock order_id, modal then calls verify
 * to actually flip the unlock on. When Razorpay is wired, the verify step
 * moves to the gateway success handler.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Lock, Sparkles, TreePine, Clock } from "lucide-react";
import {
  fetchMySachets,
  checkoutNodeUnlock, verifyNodeUnlock,
  checkoutBundle, verifyBundle,
  checkoutTopup, verifyTopup,
  type SachetSummary,
} from "@/services/entitlementApi";
import { useEntitlement } from "@/contexts/EntitlementContext";

interface SachetModalProps {
  open: boolean;
  onClose: () => void;
  /** Boundary information that triggered the modal. */
  boundary?: {
    generation: number;
    side: "ancestor" | "descendant";
    nodeIds: string[];
  };
  onUnlocked?: () => void;
}

type Choice = "single" | "bundle5" | "branch" | "topup";

export const SachetModal: React.FC<SachetModalProps> = ({
  open, onClose, boundary, onUnlocked,
}) => {
  const { refresh } = useEntitlement();
  const [pricing, setPricing] = useState<SachetSummary["pricing"] | null>(null);
  const [choice,  setChoice]  = useState<Choice>("single");
  const [busy,    setBusy]    = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchMySachets()
      .then((res) => setPricing(res.pricing))
      .catch(() => { /* fall back to defaults */ });
  }, [open]);

  const lockedCount = boundary?.nodeIds.length ?? 0;
  const direction   = boundary?.side === "ancestor" ? "up" : "down";

  const buy = async () => {
    if (!boundary) return;
    setBusy(true);
    try {
      let orderId: string;
      let unlocked: string[] = [];

      if (choice === "single") {
        const co = await checkoutNodeUnlock([boundary.nodeIds[0]]);
        orderId  = co.order_id;
        const v = await verifyNodeUnlock({ gateway_order_id: orderId,
                                            gateway_payment_id: `pay_mock_${orderId.slice(-6)}` });
        unlocked = v.unlocked_node_ids;
      } else if (choice === "bundle5") {
        const ids = boundary.nodeIds.slice(0, 5);
        const co  = await checkoutNodeUnlock(ids);
        orderId   = co.order_id;
        const v   = await verifyNodeUnlock({ gateway_order_id: orderId });
        unlocked  = v.unlocked_node_ids;
      } else if (choice === "branch") {
        const co  = await checkoutBundle(boundary.nodeIds[0], boundary.nodeIds);
        orderId   = co.order_id;
        const v   = await verifyBundle({ gateway_order_id: orderId });
        unlocked  = v.unlocked_node_ids;
      } else {
        // topup
        const co = await checkoutTopup({ direction, extra_gens: 1, days: 30 });
        orderId  = co.order_id;
        await verifyTopup({ gateway_order_id: orderId });
        toast.success("Generation window extended for 30 days.");
        await refresh();
        onUnlocked?.();
        onClose();
        return;
      }

      toast.success(`Unlocked ${unlocked.length} node${unlocked.length === 1 ? "" : "s"}.`);
      await refresh();
      onUnlocked?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setBusy(false);
    }
  };

  if (!boundary) return null;

  const sideLabel = boundary.side === "ancestor" ? "ancestors" : "descendants";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4" /> Unlock {lockedCount} hidden {sideLabel}
          </DialogTitle>
          <DialogDescription>
            Generation {boundary.generation > 0 ? `+${boundary.generation}` : boundary.generation}.
            Choose how you'd like to unlock.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-3">
          <SachetOption
            icon={<Sparkles className="w-4 h-4" />}
            title="Unlock 1 person"
            subtitle="Permanent — never expires"
            price={pricing?.single_node ?? 19}
            selected={choice === "single"}
            onClick={() => setChoice("single")}
          />
          {lockedCount >= 2 && (
            <SachetOption
              icon={<Sparkles className="w-4 h-4" />}
              title={`Unlock 5 people${lockedCount < 5 ? ` (you have ${lockedCount})` : ""}`}
              subtitle="Bundle deal — better unit price"
              price={pricing?.bundle_5 ?? 49}
              selected={choice === "bundle5"}
              onClick={() => setChoice("bundle5")}
            />
          )}
          {lockedCount > 5 && (
            <SachetOption
              icon={<TreePine className="w-4 h-4" />}
              title={`Unlock entire branch (${lockedCount} people)`}
              subtitle="Full subtree — best value for large branches"
              price={pricing?.branch_bundle ?? 99}
              selected={choice === "branch"}
              onClick={() => setChoice("branch")}
            />
          )}
          <SachetOption
            icon={<Clock className="w-4 h-4" />}
            title={`Add +1 generation ${direction === "up" ? "up" : "down"} for 30 days`}
            subtitle="Temporary — expires, but you'll see the entire generation"
            price={pricing?.gen_topup ?? 39}
            selected={choice === "topup"}
            onClick={() => setChoice("topup")}
          />
        </div>

        <div className="mt-4 p-3 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
          <strong>Stub mode:</strong> payment gateway not yet wired. Confirming
          will activate the unlock immediately without an actual charge.
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={buy} disabled={busy}>
            {busy ? <Loader2 className="animate-spin w-4 h-4" /> : "Confirm purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Internal option card ───────────────────────────────────────────────────

const SachetOption: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  price: number;
  selected: boolean;
  onClick: () => void;
}> = ({ icon, title, subtitle, price, selected, onClick }) => (
  <Card
    onClick={onClick}
    className={`p-3 cursor-pointer transition-all ${
      selected
        ? "ring-2 ring-amber-500 bg-amber-50/60 dark:bg-amber-950/30"
        : "hover:bg-muted/40"
    }`}
  >
    <div className="flex items-center gap-3">
      <div className={`p-1.5 rounded ${selected ? "bg-amber-200" : "bg-muted"}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">{subtitle}</div>
      </div>
      <div className="text-right">
        <div className="text-base font-bold">₹{price}</div>
      </div>
    </div>
  </Card>
);

export default SachetModal;
