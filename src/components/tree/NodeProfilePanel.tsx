/**
 * NodeProfilePanel — right-side Sheet showing a person's profile.
 *
 * Privacy model (default: everything private):
 *   Public to all  → name, DOB (day + month only, never year)
 *   Owner only     → full DOB year, residence, gotra, ancestral place
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
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

/** Returns "12 March" from any ISO / date string — never exposes the year. */
function dobDayMonth(raw?: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long" });
}

/** Returns full formatted date for owner view. */
function dobFull(raw?: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function genderLabel(g?: string | null): string | null {
  if (!g) return null;
  const l = g.toLowerCase();
  if (l === "male") return "♂ Male";
  if (l === "female") return "♀ Female";
  return g;
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
    !person?.owner_id ||
    person.owner_id === appUser?.id;

  const fullName = [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "(unnamed)";

  return (
    <Sheet open={!!nodeId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-[320px] sm:max-w-[320px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="pr-6">
            {loading ? "Loading…" : fullName}
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
            {/* ── Always public ── */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gender"   value={genderLabel(person.gender)} />
              <Field label="Relation" value={person.relation} />
              {/* DOB: day + month only — year is private by default */}
              <Field label="Birthday" value={dobDayMonth(person.date_of_birth as string)} />
            </div>

            {/* ── Owner sees full profile ── */}
            {isOwner ? (
              <>
                <div className="border-t pt-3 grid grid-cols-1 gap-3">
                  <Field label="Date of birth (full)"  value={dobFull(person.date_of_birth as string)} />
                  <Field label="Ancestral place"       value={person.ancestral_place as string} />
                  <Field label="Current residence"     value={person.current_residence as string} />
                  <Field label="Gotra"                 value={person.gotra as string} />
                </div>

                <div className="border-t pt-3">
                  <Button
                    size="sm"
                    variant="default"
                    className="w-full"
                    onClick={() => {
                      onClose();
                      // Pass vansha_id so NodePage loads in the correct tree context.
                      const vid = person.vansha_id;
                      navigate(`/node/${nodeId}${vid ? `?vansha_id=${encodeURIComponent(vid)}` : ""}`);
                    }}
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
