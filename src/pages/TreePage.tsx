import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import { usePlan } from '@/contexts/PlanContext';
import { useTree } from '@/contexts/TreeContext';
import AppShell from '@/components/shells/AppShell';
import TreeCompletionScore from '@/components/ui/TreeCompletionScore';
import TrustBadge from '@/components/ui/TrustBadge';
import { fetchMatrimonyProfile, fetchVanshaTree, getApiBaseUrl, getPersistedVanshaId } from '@/services/api';
import { backendPayloadToTreeState } from '@/services/mapVanshaPayload';
import { mergeMatrimonyProfile } from '@/engine/matrimonyDefaults';
import { toast } from '@/hooks/use-toast';
import type { PositionedTreeNode } from '@/engine/treeLayout';
import { layoutTreeNodes, nodesForParentalUnionRow } from '@/engine/treeLayout';
import {
  getTreeNodeContainerVariant,
  idEqNodeIds,
  isAdoptedChildRelation,
  isSpouseRelation,
} from '@/constants/vrukshaRelations';
import { PersonNode } from '@/components/tree/PersonNode';
import {
  SpouseCoupleFrame,
  SpousePlusMark,
  spousePlusCenterY,
} from '@/components/tree/MaritalUnitGraphics';
import { AlertCircle, Loader2, Pencil, TreePine, UserPlus } from 'lucide-react';

/** Distinct connector hue per marital union (polygamy: one color per wife/husband line). */
function unionStrokeColor(unionId: string): string {
  let h = 0;
  for (let i = 0; i < unionId.length; i++) {
    h = (h * 31 + unionId.charCodeAt(i)) >>> 0;
  }
  return `hsl(${h % 360} 58% 40%)`;
}

const TreePage = () => {
  const { tr } = useLang();
  const { plan, membersUsed, generationsUsed } = usePlan();
  const { state, isTreeInitialized, loadTreeState, setMatrimonyProfile } = useTree();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const vanshaId = useMemo(
    () => (searchParams.get('vansha_id') ?? import.meta.env.VITE_DEFAULT_VANSHA_ID ?? getPersistedVanshaId() ?? '').trim(),
    [searchParams],
  );
  const defaultVanshaFromEnv = useMemo(
    () => (import.meta.env.VITE_DEFAULT_VANSHA_ID ?? '').trim(),
    [],
  );
  const useRemoteVansha = vanshaId.length > 0;

  const [remotePhase, setRemotePhase] = useState<'idle' | 'loading' | 'error' | 'done'>(() =>
    useRemoteVansha ? 'loading' : 'idle',
  );
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!useRemoteVansha) {
      setRemotePhase('idle');
      setRemoteError(null);
      return;
    }

    let cancelled = false;
    setRemotePhase('loading');
    setRemoteError(null);

    (async () => {
      try {
        const data = await fetchVanshaTree(vanshaId);
        if (cancelled) return;
        loadTreeState(backendPayloadToTreeState(data));
        try {
          const mp = await fetchMatrimonyProfile(vanshaId);
          if (cancelled) return;
          setMatrimonyProfile(mergeMatrimonyProfile(mp ?? {}));
        } catch {
          /* tree still usable without matrimony row */
        }
        setRemotePhase('done');
      } catch (e) {
        if (cancelled) return;
        setRemoteError(e instanceof Error ? e.message : 'Failed to load tree');
        setRemotePhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [useRemoteVansha, vanshaId, loadTreeState, retryToken, setMatrimonyProfile]);

  // Main-line progeny on axis; incoming spouse beside (+); children centered on union midpoint when unionRows exist.
  const { positionedNodes, viewHeight, viewWidth } = useMemo(() => {
    if (!isTreeInitialized) return { positionedNodes: [], viewHeight: 320, viewWidth: 400 };
    const { positionedNodes: pos, viewHeight: h, viewWidth: w } = layoutTreeNodes(
      state.nodes,
      state.edges,
      state.unionRows ?? [],
    );
    return { positionedNodes: pos, viewHeight: h, viewWidth: w };
  }, [state.nodes, state.edges, state.unionRows, isTreeInitialized]);

  const edges = state.edges;
  const nodeMap = Object.fromEntries(positionedNodes.map((n) => [n.id, n]));
  const spouseEdges = edges.filter((e) => isSpouseRelation(e.relation));
  /**
   * Drop edges that duplicate the union trunk: any link between a child of union u
   * and u’s male or female node (covers Son/Daughter/Father/Mother and legacy labels).
   */
  const lineageEdges = useMemo(() => {
    const raw = edges.filter(
      (e) => !isSpouseRelation(e.relation),
    );
    const unionRows = state.unionRows ?? [];

    const edgeDuplicatesUnionTrunk = (e: (typeof edges)[number]): boolean => {
      for (const u of unionRows) {
        const children = nodesForParentalUnionRow(state.nodes, u);
        const childIds = new Set(children.map((c) => c.id));
        const isParent = (id: string) =>
          idEqNodeIds(id, u.maleNodeId) || idEqNodeIds(id, u.femaleNodeId);
        if (childIds.has(e.from) && isParent(e.to)) return true;
        if (childIds.has(e.to) && isParent(e.from)) return true;
      }
      return false;
    };

    return raw.filter((e) => !edgeDuplicatesUnionTrunk(e));
  }, [edges, state.nodes, state.unionRows]);

  const openBirthVanshaIfPresent = (node: PositionedTreeNode): boolean => {
    const m = node.maidenVanshaId != null && String(node.maidenVanshaId).trim() !== "";
    const p = node.paternalVanshaId != null && String(node.paternalVanshaId).trim() !== "";
    if (m) {
      navigate(`/tree?vansha_id=${encodeURIComponent(String(node.maidenVanshaId).trim())}`);
      return true;
    }
    if (p) {
      navigate(`/tree?vansha_id=${encodeURIComponent(String(node.paternalVanshaId).trim())}`);
      return true;
    }
    return false;
  };

  const treeCanvasBody = () => {
    if (useRemoteVansha && remotePhase === 'loading') {
      return (
        <div className="p-16 flex flex-col items-center justify-center gap-4 text-center min-h-[320px]">
          <Loader2 className="w-12 h-12 text-primary animate-spin" aria-hidden />
          <div>
            <p className="font-medium font-body text-foreground">Loading family tree from server…</p>
            <p className="text-sm text-muted-foreground font-body mt-2 max-w-md">
              Resolving gotra and lineage data can take a moment.
            </p>
          </div>
        </div>
      );
    }

    if (useRemoteVansha && remotePhase === 'error') {
      return (
        <div className="p-12 text-center min-h-[320px] flex flex-col items-center justify-center gap-4">
          <AlertCircle className="w-12 h-12 text-destructive" aria-hidden />
          <div>
            <p className="font-heading font-semibold text-destructive">Could not load tree</p>
            <p className="text-sm text-muted-foreground font-body mt-2 max-w-lg break-words">{remoteError}</p>
            <p className="text-xs text-muted-foreground font-body mt-3">
              API base URL: {getApiBaseUrl()}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRetryToken(t => t + 1)}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg border border-border bg-secondary font-semibold font-body text-sm hover:bg-secondary/80 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }

    if (useRemoteVansha && remotePhase === 'done' && !isTreeInitialized) {
      return (
        <div className="p-12 text-center min-h-[280px] flex flex-col items-center justify-center gap-2">
          <TreePine className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground font-body">No members returned for this vansha.</p>
        </div>
      );
    }

    if (!isTreeInitialized) {
      return (
        <div className="p-12 text-center">
          <TreePine className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground font-body">{tr('treeEmpty')}</p>
          <button
            onClick={() => navigate('/onboarding')}
            className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition-opacity"
          >
            {tr('startTree')}
          </button>
        </div>
      );
    }

    return (
      <>
        <div className="relative w-full" style={{ height: Math.max(320, viewHeight) }}>
          <div className="absolute inset-0 gradient-warm opacity-50" />
          <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${viewWidth} ${viewHeight}`} preserveAspectRatio="xMidYMid meet">
            {/* Marital unit: rounded frame (behind nodes) */}
            {spouseEdges.map((e) => {
              const a = nodeMap[e.from];
              const b = nodeMap[e.to];
              if (!a || !b) return null;
              const left = a.x <= b.x ? a : b;
              const right = a.x <= b.x ? b : a;
              return <SpouseCoupleFrame key={`frame-${e.from}-${e.to}`} left={left} right={right} />;
            })}

            {/* Parent-child / lineage edges — biological union color; adopted / step styling differs */}
            {lineageEdges.map((e, i) => {
              const from = nodeMap[e.from];
              const to = nodeMap[e.to];
              if (!from || !to) return null;
              const childNode = state.nodes.find((n) => n.id === e.from);
              const adopted = childNode ? isAdoptedChildRelation(childNode.relation) : false;
              const pu = childNode?.parentUnionId?.trim();
              const stroke = adopted
                ? "hsl(var(--accent))"
                : pu
                  ? unionStrokeColor(pu)
                  : "hsl(var(--primary))";
              return (
                <line
                  key={`ln-${i}`}
                  x1={from.x}
                  y1={from.y + 20}
                  x2={to.x}
                  y2={to.y}
                  stroke={stroke}
                  strokeWidth={adopted ? 2 : 2.5}
                  strokeOpacity={adopted ? 0.55 : 0.38}
                  strokeDasharray={adopted ? "5 4" : undefined}
                  className="animate-fade-in"
                />
              );
            })}

            {/* Trunk: one riser from above the +, then optional horizontal bar; drops to each child (orange bio / green adopted). */}
            {(state.unionRows ?? []).map((u) => {
              const children = nodesForParentalUnionRow(state.nodes, u);
              if (children.length === 0) return null;
              const m = nodeMap[u.maleNodeId];
              const f = nodeMap[u.femaleNodeId];
              if (!m || !f) return null;
              const cx = (m.x + f.x) / 2;
              const coupleY = (m.y + f.y) / 2;
              const yTrunkStart = spousePlusCenterY(coupleY) - 10;
              const trunkStroke = "hsl(var(--primary))";
              const trunkW = 3;
              const dropBio = "#ea580c";
              const dropAdopted = "#16a34a";
              const dropStroke = (rel: string) =>
                isAdoptedChildRelation(rel) ? dropAdopted : dropBio;

              const ordered = [...children].sort(
                (a, b) => (nodeMap[a.id]?.x ?? 0) - (nodeMap[b.id]?.x ?? 0),
              );
              const attachY = (childId: string) => {
                const p = nodeMap[childId];
                return p ? p.y + 18 : 0;
              };
              const bottoms = ordered.map((c) => attachY(c.id)).filter((y) => y > 0);
              if (bottoms.length === 0) return null;
              const yBar = Math.max(...bottoms) + 28;

              if (ordered.length === 1) {
                const c = ordered[0];
                const xc = nodeMap[c.id]?.x ?? cx;
                const yAttach = attachY(c.id);
                return (
                  <g key={`trunk-${u.id}`} className="animate-fade-in">
                    <line
                      x1={cx}
                      y1={yTrunkStart}
                      x2={xc}
                      y2={yAttach}
                      stroke={dropStroke(c.relation)}
                      strokeWidth={3.25}
                      strokeOpacity={0.92}
                      strokeLinecap="round"
                    />
                  </g>
                );
              }

              const xs = ordered.map((c) => nodeMap[c.id]?.x ?? cx);
              const left = Math.min(...xs);
              const right = Math.max(...xs);

              return (
                <g key={`trunk-${u.id}`} className="animate-fade-in">
                  <line
                    x1={cx}
                    y1={yTrunkStart}
                    x2={cx}
                    y2={yBar}
                    stroke={trunkStroke}
                    strokeWidth={trunkW}
                    strokeOpacity={0.5}
                    strokeLinecap="round"
                  />
                  <line
                    x1={left}
                    y1={yBar}
                    x2={right}
                    y2={yBar}
                    stroke={trunkStroke}
                    strokeWidth={trunkW}
                    strokeOpacity={0.5}
                    strokeLinecap="round"
                  />
                  {ordered.map((c) => {
                    const xc = nodeMap[c.id]?.x ?? cx;
                    const yAttach = attachY(c.id);
                    return (
                      <line
                        key={`drop-${u.id}-${c.id}`}
                        x1={xc}
                        y1={yBar}
                        x2={xc}
                        y2={yAttach}
                        stroke={dropStroke(c.relation)}
                        strokeWidth={3}
                        strokeOpacity={0.92}
                        strokeLinecap="round"
                      />
                    );
                  })}
                </g>
              );
            })}

            {positionedNodes.map((node) => {
              const hasDispute = state.disputes.some(d => d.nodeId === node.id && d.status === 'active');
              const hasBridge =
                (node.maidenVanshaId != null && String(node.maidenVanshaId).trim() !== "") ||
                (node.paternalVanshaId != null && String(node.paternalVanshaId).trim() !== "");
              return (
                <PersonNode
                  key={node.id}
                  node={node}
                  hasDispute={hasDispute}
                  isSelected={selectedNodeId === node.id}
                  hasMatrimonialBridge={hasBridge}
                  containerVariant={getTreeNodeContainerVariant(node, state.unionRows ?? [])}
                  onSelect={(e) => {
                    if (hasBridge && !e.shiftKey) {
                      openBirthVanshaIfPresent(node);
                      return;
                    }
                    setSelectedNodeId(node.id);
                  }}
                />
              );
            })}

            {spouseEdges.map((e) => {
              const a = nodeMap[e.from];
              const b = nodeMap[e.to];
              if (!a || !b) return null;
              const left = a.x <= b.x ? a : b;
              const right = a.x <= b.x ? b : a;
              return <SpousePlusMark key={`plus-${e.from}-${e.to}`} left={left} right={right} />;
            })}
          </svg>

          <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg glass-card text-xs font-body text-muted-foreground max-w-[min(100%,20rem)]">
            {tr('tapToExplore')}
            <span className="block mt-1 text-[10px] opacity-90">{tr('treeTapShiftSelect')}</span>
          </div>
        </div>

        <div className="border-t border-border/50 p-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          {selectedNodeId && (
            <button
              type="button"
              onClick={() => navigate(`/node/${selectedNodeId}`)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-secondary font-semibold font-body text-sm hover:bg-secondary/80 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              {tr('editSelectedMember')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!selectedNodeId) {
                toast({
                  title: tr('selectTreeMemberFirst'),
                  variant: 'destructive',
                });
                return;
              }
              const vidForAdd = vanshaId || defaultVanshaFromEnv;
              if (vidForAdd) {
                navigate(
                  `/node?vansha_id=${encodeURIComponent(vidForAdd)}&anchor_node_id=${encodeURIComponent(selectedNodeId)}`,
                );
                return;
              }
              navigate(`/node?anchor_node_id=${encodeURIComponent(selectedNodeId)}`);
            }}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition-opacity hover-scale"
          >
            <UserPlus className="w-4 h-4" />
            {tr('addMember')}
          </button>
        </div>
      </>
    );
  };

  return (
    <AppShell>
      <div className="container py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold">{tr('treeTitle')}</h1>
            <p className="text-muted-foreground font-body mt-1">
              {isTreeInitialized ? state.treeName : tr('treeSubtitle')}
            </p>
          </div>
          <TrustBadge variant="encrypted" />
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl p-5 shadow-card border border-border/50">
            <p className="text-sm text-muted-foreground font-body">{tr('memberLimit')}</p>
            <p className="text-2xl font-bold font-heading">{membersUsed} <span className="text-base text-muted-foreground font-body">{tr('ofCap')} {plan.maxNodes}</span></p>
            <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full gradient-hero rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (membersUsed / plan.maxNodes) * 100)}%` }} />
            </div>
          </div>
          <div className="bg-card rounded-xl p-5 shadow-card border border-border/50">
            <p className="text-sm text-muted-foreground font-body">{tr('generationLimit')}</p>
            <p className="text-2xl font-bold font-heading">{generationsUsed} <span className="text-base text-muted-foreground font-body">{tr('ofCap')} {plan.generationCap}</span></p>
            <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full gradient-hero rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (generationsUsed / plan.generationCap) * 100)}%` }} />
            </div>
          </div>
          <div className="bg-card rounded-xl p-5 shadow-card border border-border/50 flex items-center">
            <TreeCompletionScore membersUsed={membersUsed} maxNodes={plan.maxNodes} generationsUsed={generationsUsed} generationCap={plan.generationCap} size="sm" />
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-card border border-border/50 overflow-hidden">
          {treeCanvasBody()}
        </div>
      </div>
    </AppShell>
  );
};

export default TreePage;
