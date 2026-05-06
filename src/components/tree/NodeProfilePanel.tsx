/**
 * NodeProfilePanel — right-side Sheet showing a person's profile.
 *
 * Ownership / privacy rules:
 *   • owner_id === currentUserId  → full profile + edit rights
 *   • no owner_id                 → full profile + edit rights (creator's tree)
 *   • someone else owns the node  → limited public view (name, gen, relation, kutumb_id)
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
import { getPersonProfile, type PersonV2 } from "@/services/treeV2Api";

interface Props {
  nodeId: string | null;
  onClose: () => void;
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

const NodeProfilePanel: React.FC<Props> = ({ nodeId, onClose }) => {
  const navigate = useNavigate();
  const { appUser } = useAuth();
  const [person, setPerson] = useState<PersonV2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nodeId) { setPerson(null); return; }
    setLoading(true);
    setError(null);
    getPersonProfile(nodeId)
      .then(setPerson)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [nodeId]);

  const isOwner =
    !person?.owner_id ||                           // no owner → tree creator has rights
    person.owner_id === appUser?.id;               // viewer is the owner

  const name = [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "(unnamed)";

  const genderLabel = (g?: string | null) => {
    if (!g) return null;
    const l = g.toLowerCase();
    if (l === "male") return "♂ Male";
    if (l === "female") return "♀ Female";
    return g;
  };

  return (
    <Sheet open={!!nodeId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-[340px] sm:max-w-[340px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="pr-6">
            {loading ? "Loading…" : name}
          </SheetTitle>
          {person?.kutumb_id && (
            <SheetDescription className="font-mono text-xs">
              {person.kutumb_id}
            </SheetDescription>
          )}
        </SheetHeader>

        {error && (
          <div className="text-sm text-destructive mb-4">{error}</div>
        )}

        {person && !loading && (
          <div className="space-y-4">
            {/* Always visible */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gender"     value={genderLabel(person.gender)} />
              <Field label="Generation" value={person.generation !== null && person.generation !== undefined ? `G${person.generation}` : null} />
              <Field label="Relation"   value={person.relation} />
            </div>

            {/* Owner / creator sees full profile */}
            {isOwner ? (
              <>
                <div className="border-t pt-3 grid grid-cols-1 gap-3">
                  <Field label="Date of birth"      value={person.date_of_birth as string} />
                  <Field label="Ancestral place"    value={person.ancestral_place as string} />
                  <Field label="Current residence"  value={person.current_residence as string} />
                  <Field label="Gotra"              value={person.gotra as string} />
                </div>

                <div className="border-t pt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="flex-1"
                    onClick={() => { onClose(); navigate(`/node/${nodeId}`); }}
                  >
                    ✏️ Edit profile
                  </Button>
                </div>
              </>
            ) : (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Full profile visible only to the node owner.
                </p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default NodeProfilePanel;
