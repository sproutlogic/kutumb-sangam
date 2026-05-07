/**
 * NodeProfilePanel — right-side Sheet showing a person's profile.
 *
 * What is shown publicly: name, birthday (day+month only), gender, parent names.
 * Owner/creator additionally sees: full DOB, full profile link, claim status.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getPersonProfile, claimNode, type PersonV2 } from "@/services/treeV2Api";

interface Props {
  nodeId: string | null;
  onClose: () => void;
  parentNames?: { father?: string; mother?: string };
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function dobDayMonth(raw?: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long" });
}

function genderLabel(g?: string | null): string | null {
  if (!g) return null;
  const l = g.toLowerCase();
  if (l === "male") return "♂ Male";
  if (l === "female") return "♀ Female";
  return g;
}

function canEditNode(person: PersonV2, userId?: string): boolean {
  if (!userId) return false;
  const owner = person.owner_id || "";
  const creator = person.creator_id || "";
  if (owner) return owner === userId;
  return creator === userId;
}

const NodeProfilePanel: React.FC<Props> = ({ nodeId, onClose, parentNames }) => {
  const navigate = useNavigate();
  const { appUser } = useAuth();
  const [person, setPerson] = useState<PersonV2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Claim flow
  const [showClaim, setShowClaim] = useState(false);
  const [claimCode, setClaimCode] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    if (!nodeId) { setPerson(null); setShowClaim(false); return; }
    setLoading(true);
    setError(null);
    getPersonProfile(nodeId)
      .then(setPerson)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [nodeId]);

  const userId = appUser?.id;
  const isClaimed = !!(person?.owner_id);
  const isOwner = !!person && person.owner_id === userId;
  const isCreator = !!person && (person.creator_id || "") === userId;
  const canEdit = !!person && canEditNode(person, userId);

  const fullName = [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "(unnamed)";

  async function handleClaim() {
    if (!claimCode.trim()) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const updated = await claimNode(claimCode.trim());
      setPerson(updated);
      setShowClaim(false);
      setClaimCode("");
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <Sheet open={!!nodeId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-[300px] sm:max-w-[300px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="pr-6">
            {loading ? "Loading…" : fullName}
          </SheetTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {person?.kutumb_id && isOwner && (
              <SheetDescription className="font-mono text-xs tracking-widest">
                ****{String(person.kutumb_id).slice(-3)}
              </SheetDescription>
            )}
            {person && (
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                isClaimed
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}>
                {isClaimed ? "✓ Claimed" : "○ Unclaimed"}
              </span>
            )}
          </div>
        </SheetHeader>

        {error && (
          <div className="text-sm text-destructive mb-4">{error}</div>
        )}

        {person && !loading && (
          <div className="space-y-4">
            {/* Public info */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gender" value={genderLabel(person.gender)} />
              <Field label="Birthday" value={dobDayMonth(person.date_of_birth as string)} />
            </div>

            {/* Parent names (passed from canvas; computed from graph edges) */}
            {(parentNames?.father || parentNames?.mother) && (
              <div className="grid grid-cols-2 gap-3">
                {parentNames.father && <Field label="Father" value={parentNames.father} />}
                {parentNames.mother && <Field label="Mother" value={parentNames.mother} />}
              </div>
            )}

            {/* Creator info when unclaimed */}
            {!isClaimed && person.creator_id && (
              <div className="border rounded-md px-3 py-2 bg-amber-50 text-xs text-amber-800 space-y-0.5">
                <div className="font-semibold uppercase tracking-wide text-[9px]">Added by creator</div>
                <div className="font-mono break-all">{person.creator_id.slice(0, 8)}…</div>
                <div className="text-[10px] text-amber-600">
                  This node hasn't been claimed by its person yet.
                </div>
              </div>
            )}

            {/* Full profile link (owner/creator only) */}
            {canEdit && (
              <div className="border-t pt-3">
                <Button
                  size="sm"
                  variant="default"
                  className="w-full"
                  onClick={() => { onClose(); navigate(`/profile/${nodeId}`); }}
                >
                  📋 View full profile
                </Button>
              </div>
            )}

            {!canEdit && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Full profile visible only to the node owner.
                </p>
              </div>
            )}

            {/* Claim section */}
            {!isClaimed && !isCreator && (
              <div className="border-t pt-3">
                {!showClaim ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-amber-400 text-amber-700 hover:bg-amber-50"
                    onClick={() => setShowClaim(true)}
                  >
                    🔑 Is this you? Claim this node
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Enter your invite code (shared by the tree creator):
                    </p>
                    <input
                      autoFocus
                      value={claimCode}
                      onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleClaim(); if (e.key === "Escape") setShowClaim(false); }}
                      placeholder="KMxxxxxxxx"
                      className="w-full border rounded-md px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    {claimError && <p className="text-xs text-destructive">{claimError}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setShowClaim(false)} className="flex-1">
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                        disabled={!claimCode.trim() || claiming}
                        onClick={() => void handleClaim()}
                      >
                        {claiming ? "Claiming…" : "Claim"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isClaimed && isOwner && (
              <div className="border-t pt-2">
                <p className="text-[10px] text-emerald-600 font-medium">✓ You are the verified owner of this node.</p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default NodeProfilePanel;
