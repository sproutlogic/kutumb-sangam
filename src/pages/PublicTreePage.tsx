/**
 * PublicTreePage — read-only shared view of a vansha tree.
 * Route: /v/:vanshCode
 * Requires login; shows the tree in read-only mode (no editing).
 */
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getVanshaByCode, type VanshaMeta } from "@/services/treeV2Api";
import TreeCanvasV2 from "@/components/tree/TreeCanvasV2";

const PublicTreePage: React.FC = () => {
  const { vanshCode } = useParams<{ vanshCode: string }>();
  const navigate = useNavigate();
  const [vansha, setVansha] = useState<VanshaMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vanshCode) return;
    setLoading(true);
    getVanshaByCode(vanshCode)
      .then(setVansha)
      .catch((e) => setError(e instanceof Error ? e.message : "Tree not found"))
      .finally(() => setLoading(false));
  }, [vanshCode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading tree…
      </div>
    );
  }

  if (error || !vansha) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error ?? "Tree not found"}</p>
        <button onClick={() => navigate(-1)} className="text-sm text-muted-foreground underline">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col">
      {/* Read-only banner */}
      <div className="shrink-0 bg-indigo-50 border-b border-indigo-200 px-4 py-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-indigo-800">
          👁 {vansha.vansh_name || vansha.vansh_code} — shared view
        </span>
        <span className="font-mono text-xs text-indigo-500">{vansha.vansh_code}</span>
      </div>
      <div className="flex-1 min-h-0">
        <TreeCanvasV2 vanshaId={vansha.vansha_id} readOnly />
      </div>
    </div>
  );
};

export default PublicTreePage;
