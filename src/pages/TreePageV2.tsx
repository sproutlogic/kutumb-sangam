import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import TreeCanvasV2 from "@/components/tree/TreeCanvasV2";
import { getPersistedVanshaId } from "@/services/api";

const TreePageV2: React.FC = () => {
  const [searchParams] = useSearchParams();
  const vanshaId = useMemo(
    () =>
      (
        searchParams.get("vansha_id") ??
        import.meta.env.VITE_DEFAULT_VANSHA_ID ??
        getPersistedVanshaId() ??
        ""
      ).trim(),
    [searchParams],
  );

  if (!vanshaId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No vansha selected. Open <code>/tree-v2?vansha_id=&lt;your-id&gt;</code>.
      </div>
    );
  }

  return <TreeCanvasV2 vanshaId={vanshaId} />;
};

export default TreePageV2;
