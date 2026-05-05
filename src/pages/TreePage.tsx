import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLang } from '@/i18n/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePersonalLabels } from '@/hooks/usePersonalLabels';
import { usePlan } from '@/contexts/PlanContext';
import { useTree } from '@/contexts/TreeContext';
import AppShell from '@/components/shells/AppShell';
import TreeCompletionScore from '@/components/ui/TreeCompletionScore';
import TrustBadge from '@/components/ui/TrustBadge';
import { deletePerson, fetchMatrimonyProfile, fetchVanshaTree, fetchVanshaTreePage, getApiBaseUrl, getPersistedVanshaId, linkPersons, unlinkPersons, updatePerson, updateVanshaMetadata } from '@/services/api';
import { backendPayloadToTreeState } from '@/services/mapVanshaPayload';
import { mergeMatrimonyProfile } from '@/engine/matrimonyDefaults';
import { canViewerSeeNodeDetails } from '@/engine/privacy';
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
import { AlertCircle, ChevronLeft, ChevronRight, Copy, Check, Link2, Loader2, Pencil, Share2, TreePine, UserPlus, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const PAGE_SIZE = 6;        // generations per page window
const PAGE_THRESHOLD = 150; // switch to paginated mode above this many persons

// ── Invite helpers ─────────────────────────────────────────────────────────────
type InviteMode = 'node' | 'tree' | 'platform';

function generateInviteCode(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${code}`;
}

interface InvitePanelProps {
  selectedNodeId: string | null;
  nodeName?: string;
  treeName?: string;
}

const InvitePanel: React.FC<InvitePanelProps> = ({ selectedNodeId, nodeName, treeName }) => {
  const [mode, setMode]                 = useState<InviteMode>('tree');
  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied]             = useState(false);
  const [open, setOpen]                 = useState(false);

  const modeConfig: { mode: InviteMode; prefix: string; icon: React.ReactNode; title: string; desc: string }[] = [
    {
      mode: 'node',
      prefix: 'KTM-NOD',
      icon: <UserPlus className="w-4 h-4" />,
      title: 'इस नोड पर आमंत्रित करें',
      desc: selectedNodeId
        ? `केवल ${nodeName ?? 'चुने नोड'} के साथ जुड़ने की अनुमति`
        : 'पहले पेड़ से कोई सदस्य चुनें',
    },
    {
      mode: 'tree',
      prefix: 'KTM-TRE',
      icon: <TreePine className="w-4 h-4" />,
      title: 'पूरे वंश वृक्ष पर आमंत्रित करें',
      desc: `${treeName ?? 'इस वंश वृक्ष'} में किसी भी नोड पर जुड़ सकते हैं`,
    },
    {
      mode: 'platform',
      prefix: 'KTM-GEN',
      icon: <Share2 className="w-4 h-4" />,
      title: 'नया खाता बनाने के लिए आमंत्रित करें',
      desc: 'नया सदस्य अपना खुद का खाता और नया वंश शुरू करेगा',
    },
  ];

  const handleGenerate = () => {
    if (mode === 'node' && !selectedNodeId) {
      toast({ title: 'पहले पेड़ से एक सदस्य चुनें', variant: 'destructive' });
      return;
    }
    const cfg = modeConfig.find(m => m.mode === mode)!;
    setGeneratedCode(generateInviteCode(cfg.prefix));
    setCopied(false);
  };

  const inviteLink = useMemo(() => {
    if (!generatedCode) return '';
    const params = new URLSearchParams({ code: generatedCode, type: mode });
    if (mode === 'node' && selectedNodeId) params.set('nodeId', selectedNodeId);
    if (mode === 'tree' && treeName) params.set('tree', treeName);
    return `${window.location.origin}/code?${params.toString()}`;
  }, [generatedCode, mode, selectedNodeId, treeName]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: 'कॉपी हो गया!', description: text });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed' });
    }
  };

  const handleShare = async () => {
    if (navigator.share && inviteLink) {
      try { await navigator.share({ title: 'Kutumb Map invitation', url: inviteLink }); }
      catch { /* user cancelled */ }
    } else {
      handleCopy(inviteLink);
    }
  };

  return (
    <div className="border border-border/50 rounded-xl bg-card shadow-card overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center flex-shrink-0">
            <UserPlus className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="text-left">
            <p className="font-body font-semibold text-sm">सदस्य आमंत्रित करें</p>
            <p className="text-xs text-muted-foreground font-body">नोड, वंश वृक्ष, या प्लेटफ़ॉर्म पर</p>
          </div>
        </div>
        <span className="text-muted-foreground text-lg leading-none">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border/50 pt-4 animate-fade-in">
          {/* Mode selector */}
          <div className="space-y-2">
            {modeConfig.map(cfg => (
              <button
                key={cfg.mode}
                onClick={() => { setMode(cfg.mode); setGeneratedCode(''); }}
                disabled={cfg.mode === 'node' && !selectedNodeId}
                className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all text-left disabled:opacity-40 ${
                  mode === cfg.mode
                    ? 'border-primary bg-primary/5 shadow-warm'
                    : 'border-border/50 bg-secondary/30 hover:border-primary/30'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  mode === cfg.mode ? 'gradient-hero' : 'bg-secondary'
                }`}>
                  <span className={mode === cfg.mode ? 'text-primary-foreground' : 'text-muted-foreground'}>
                    {cfg.icon}
                  </span>
                </div>
                <div>
                  <p className="font-body font-semibold text-sm">{cfg.title}</p>
                  <p className="text-xs text-muted-foreground font-body mt-0.5">{cfg.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            className="w-full py-2.5 rounded-lg gradient-hero text-primary-foreground font-semibold font-body text-sm shadow-warm hover:opacity-90 transition-opacity"
          >
            आमंत्रण कोड बनाएं
          </button>

          {/* Result */}
          {generatedCode && (
            <div className="bg-secondary/40 rounded-xl p-4 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground font-body mb-1">आपका आमंत्रण कोड</p>
                  <span className="font-heading text-xl font-bold tracking-wider text-primary">{generatedCode}</span>
                </div>
                <button
                  onClick={() => handleCopy(generatedCode)}
                  className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-2.5 py-2 rounded-lg bg-background border border-border text-[11px] font-mono text-muted-foreground truncate">
                  {inviteLink}
                </div>
                <button
                  onClick={() => handleCopy(inviteLink)}
                  className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex-shrink-0"
                >
                  <Link2 className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleShare}
                className="w-full py-2 rounded-lg border-2 border-primary text-primary font-semibold font-body text-sm hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                शेयर करें
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Component ──────────────────────────────────────────────────────────────────

/** Distinct connector hue per marital union (polygamy: one color per wife/husband line). */
function unionStrokeColor(unionId: string): string {
  let h = 0;
  for (let i = 0; i < unionId.length; i++) {
    h = (h * 31 + unionId.charCodeAt(i)) >>> 0;
  }
  return `hsl(${h % 360} 58% 40%)`;
}

// ── Personal label inline editor ───────────────────────────────────────────
const PersonalLabelEditor: React.FC<{
  nodeId: string;
  currentLabel: string;
  onSave: (label: string) => void;
}> = ({ currentLabel, onSave }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(currentLabel);

  React.useEffect(() => {
    setDraft(currentLabel);
    setEditing(false);
  }, [currentLabel]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setEditing(false);
  };

  return (
    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'linear-gradient(135deg,rgba(74,33,104,0.06),rgba(212,154,31,0.04))', border: '1px solid rgba(74,33,104,0.12)', marginBottom: 16 }}>
      <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'rgba(74,33,104,0.5)', fontFamily: 'var(--font-mono,monospace)', textTransform: 'uppercase', marginBottom: 8 }}>
        आप इन्हें क्या कहते हैं?
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="पिताजी, बप्पा, Chachu…"
            style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(74,33,104,0.25)', background: 'rgba(252,250,244,0.9)', fontSize: 13, fontFamily: 'var(--font-body,sans-serif)', outline: 'none' }}
          />
          <button
            onClick={handleSave}
            style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: 'var(--ds-plum,#2e1346)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >✓</button>
          <button
            onClick={() => setEditing(false)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(74,33,104,0.2)', background: 'transparent', fontSize: 12, cursor: 'pointer', color: 'rgba(74,33,104,0.6)' }}
          >✕</button>
        </div>
      ) : (
        <button
          onClick={() => { setDraft(currentLabel); setEditing(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left' }}
        >
          {currentLabel ? (
            <span style={{ fontSize: 16, fontFamily: 'var(--font-heading,serif)', fontWeight: 700, color: 'var(--ds-plum,#2e1346)' }}>{currentLabel}</span>
          ) : (
            <span style={{ fontSize: 13, color: 'rgba(212,154,31,0.9)', fontStyle: 'italic' }}>Set your name for this person →</span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(74,33,104,0.45)' }}>✎</span>
        </button>
      )}
    </div>
  );
};


const TreePage = () => {
  const { tr } = useLang();
  const { plan, membersUsed, generationsUsed, hasEntitlement } = usePlan();
  const { state, isTreeInitialized, loadTreeState, setMatrimonyProfile } = useTree();
  const { appUser } = useAuth();
  const { getLabel, setLabel } = usePersonalLabels(appUser?.id, appUser?.vansha_id);
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
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [connectPopup, setConnectPopup] = useState<{ targetId: string; targetName: string; options: string[]; parentUnions: Array<{ id: string; label: string }> } | null>(null);
  const [connectRelation, setConnectRelation] = useState('');
  const [connectUnionId, setConnectUnionId] = useState('');
  const [connectLinking, setConnectLinking] = useState(false);
  // Drag-to-connect: use refs for logic (no stale-closure issues), state only for the preview render
  const svgRef = useRef<SVGSVGElement>(null);
  const dragPotentialRef = useRef<{ id: string; screenX: number; screenY: number } | null>(null);
  const dragFromRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const wasDraggingRef = useRef(false); // suppresses onClick after a completed drag
  const [dragPreview, setDragPreview] = useState<{ fx: number; fy: number; tx: number; ty: number } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [linkParentUnionId, setLinkParentUnionId] = useState('');
  // Kul Devata inline edit state (tree overview panel)
  const [kuldeviEdit, setKuldeviEdit] = useState('');
  const [kuldevtaEdit, setKuldevtaEdit] = useState('');
  const [kulDevEditing, setKulDevEditing] = useState(false);
  const [kulDevSaving, setKulDevSaving] = useState(false);
  const [isSavingParentLink, setIsSavingParentLink] = useState(false);
  const [unlinkingEdge, setUnlinkingEdge] = useState<string | null>(null);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [isPaginated, setIsPaginated] = useState(false);
  const [genMin, setGenMin] = useState(-3);
  const [genMax, setGenMax] = useState(genMin + PAGE_SIZE - 1);

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
        let data;
        if (isPaginated) {
          data = await fetchVanshaTreePage(vanshaId, genMin, genMax);
        } else {
          data = await fetchVanshaTree(vanshaId);
          // auto-switch to paginated if tree is large
          if (data.persons.length > PAGE_THRESHOLD) {
            setIsPaginated(true);
            const gens = data.persons.map((p) => Number((p as Record<string, unknown>).generation ?? 0));
            const minG = Math.min(...gens);
            setGenMin(minG);
            setGenMax(minG + PAGE_SIZE - 1);
            data = await fetchVanshaTreePage(vanshaId, minG, minG + PAGE_SIZE - 1);
          }
        }
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
  }, [useRemoteVansha, vanshaId, loadTreeState, retryToken, setMatrimonyProfile, isPaginated, genMin, genMax]);

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

  const coupleNodeIds = useMemo(() => {
    const s = new Set<string>();
    spouseEdges.forEach(e => { s.add(e.from); s.add(e.to); });
    return s;
  }, [spouseEdges]);

  // Y of the bottom edge of a node's container (frame bottom for couples, nameplate bottom for singles).
  // SpouseCoupleFrame: R=26, FRAME_MARGIN_Y_BOTTOM=48 → frame bottom = leftSpouse.y + 74 (+2px buffer = +76)
  // Single nodes: nameplate = R(26)+stem(8)+NP_H(30) = y+64
  const frameBottomY = (id: string): number => {
    const n = nodeMap[id];
    if (!n) return 0;
    // For couple nodes, prefer the leftmost-by-x spouse's y to match SpouseCoupleFrame reference
    if (coupleNodeIds.has(id)) {
      const se = spouseEdges.find(e => e.from === id || e.to === id);
      const partnerId = se ? (se.from === id ? se.to : se.from) : null;
      const partner = partnerId ? nodeMap[partnerId] : null;
      const leftY = partner && partner.x < n.x ? partner.y : n.y;
      return leftY + 76; // SpouseCoupleFrame bottom (leftNode.y + 74) + 2px gap
    }
    return n.y + 64;
  };

  // Y of the top edge of a node's container (frame top for couples, shape top for singles).
  // SpouseCoupleFrame: R=26, FRAME_MARGIN_Y_TOP=8 → frame top = leftSpouse.y - 34 (-2px buffer = -36)
  // Single nodes: shape top = y - R(26)
  const frameTopY = (id: string): number => {
    const n = nodeMap[id];
    if (!n) return 0;
    if (coupleNodeIds.has(id)) {
      const se = spouseEdges.find(e => e.from === id || e.to === id);
      const partnerId = se ? (se.from === id ? se.to : se.from) : null;
      const partner = partnerId ? nodeMap[partnerId] : null;
      const leftY = partner && partner.x < n.x ? partner.y : n.y;
      return leftY - 36; // SpouseCoupleFrame top (leftNode.y - 34) - 2px gap
    }
    return n.y - 26;
  };

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

  const hoverDetailsForNode = (node: PositionedTreeNode): string[] => {
    const canSee = canViewerSeeNodeDetails(node, state.currentUserId, state.edges);
    if (!canSee) return ['Details hidden by node privacy settings.'];
    const myLabel = getLabel(node.id);
    if (!myLabel) return [`आप इन्हें क्या कहते हैं?`, `Click node → set your label`];
    return [myLabel, node.name || ''];
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
        {isPaginated && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40">
            <button
              type="button"
              disabled={remotePhase === 'loading'}
              onClick={() => { const next = genMin - PAGE_SIZE; setGenMin(next); setGenMax(next + PAGE_SIZE - 1); }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium font-body border border-border bg-background hover:bg-secondary disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Older
            </button>
            <span className="text-xs text-muted-foreground font-body">
              Generations {genMin} to {genMax}
            </span>
            <button
              type="button"
              disabled={remotePhase === 'loading'}
              onClick={() => { const next = genMin + PAGE_SIZE; setGenMin(next); setGenMax(next + PAGE_SIZE - 1); }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium font-body border border-border bg-background hover:bg-secondary disabled:opacity-40 transition-colors"
            >
              Newer <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
        <div
          style={{
            width: Math.max(viewWidth * zoom, 100),
            height: Math.max(viewHeight * zoom, 320),
            minWidth: '100%',
            position: 'relative',
          }}
        >
          <svg
            ref={svgRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', WebkitUserSelect: 'none', userSelect: 'none', cursor: dragPreview ? 'crosshair' : undefined } as React.CSSProperties}
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            preserveAspectRatio="xMidYMid meet"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={cancelDrag}
          >
            <defs>
              <linearGradient id="branch-grad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#6b4a2a" stopOpacity="0.7"/>
                <stop offset="60%" stopColor="#9a7a4a" stopOpacity="0.6"/>
                <stop offset="100%" stopColor="#c89e58" stopOpacity="0.5"/>
              </linearGradient>
              {/* Person node fill gradients */}
              <radialGradient id="person-grad-male" cx="40%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#7a4a9a"/>
                <stop offset="100%" stopColor="#2e1346"/>
              </radialGradient>
              <radialGradient id="person-grad-female" cx="40%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#d47a9e"/>
                <stop offset="100%" stopColor="#6a2a52"/>
              </radialGradient>
              <radialGradient id="person-grad-other" cx="40%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#8a8aaa"/>
                <stop offset="100%" stopColor="#3a3a5a"/>
              </radialGradient>
            </defs>
            {/* Marital unit: rounded frame — only for real (non-placeholder) couples */}
            {spouseEdges.map((e) => {
              const a = nodeMap[e.from];
              const b = nodeMap[e.to];
              if (!a || !b) return null;
              // Skip if either spouse is a placeholder — avoids solo-node ghost frames
              if (a.isPlaceholder || b.isPlaceholder) return null;
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
              const stroke = adopted ? "hsl(var(--accent))" : pu ? unionStrokeColor(pu) : "hsl(var(--primary))";
              const fromY = frameBottomY(e.from);
              const toY   = frameTopY(e.to);
              const midY  = (fromY + toY) / 2;
              const d = `M${from.x},${fromY} C${from.x},${midY} ${to.x},${midY} ${to.x},${toY}`;
              const vid = vanshaId;
              return (
                <g key={`ln-${i}`} style={{ cursor: 'pointer' }} onClick={() => handleDeleteLine(`leg-${e.from}-${e.to}`, async () => {
                  if (!vid) return;
                  await unlinkPersons({ vansha_id: vid, person_id: e.from, target_person_id: e.to });
                })}>
                  <path d={d} stroke={adopted ? stroke : "url(#branch-grad)"} strokeWidth={adopted ? 2 : 2.5} strokeOpacity={adopted ? 0.55 : 1} strokeDasharray={adopted ? "5 4" : undefined} fill="none" strokeLinecap="round" />
                  <path d={d} stroke="transparent" strokeWidth={14} fill="none" pointerEvents="all" />
                </g>
              );
            })}

            {/* Trunk: from parent frame bottom → horizontal bar → child frame tops */}
            {(state.unionRows ?? []).map((u) => {
              const children = nodesForParentalUnionRow(state.nodes, u);
              if (children.length === 0) return null;
              const m = nodeMap[u.maleNodeId];
              const f = nodeMap[u.femaleNodeId];
              if (!m || !f) return null;
              const cx = (m.x + f.x) / 2;
              // Tree renders bottom-to-top: children (level +1) are above parents (level 0) in SVG space.
              // Trunk starts at the TOP edge of the parent couple frame and goes upward.
              // The horizontal bar sits just below the children's bottom edges.
              // Drop lines go from that bar up to the BOTTOM edge of each child container.
              const leftParent = m.x <= f.x ? m : f;
              const yTrunkStart = leftParent.y - 36; // = SpouseCoupleFrame top edge
              const trunkStroke = "hsl(var(--primary))";
              const trunkW = 2.5;
              const dropBio = "#ea580c";
              const dropAdopted = "#16a34a";
              const dropStroke = (rel: string) =>
                isAdoptedChildRelation(rel) ? dropAdopted : dropBio;

              const ordered = [...children].sort(
                (a, b) => (nodeMap[a.id]?.x ?? 0) - (nodeMap[b.id]?.x ?? 0),
              );
              // Attach drop lines to the BOTTOM edge of each child container.
              const childBottomY = (childId: string) => frameBottomY(childId);
              const bottoms = ordered.map((c) => childBottomY(c.id)).filter((y) => y > 0);
              if (bottoms.length === 0) return null;
              // Bar sits just below the lowest child bottom (largest Y among bottoms),
              // between children and the parent couple's top edge.
              const minGap = 16;
              const yBarIdeal = yTrunkStart - (yTrunkStart - Math.max(...bottoms)) / 3;
              const yBar = Math.max(yBarIdeal, Math.max(...bottoms) + minGap);

              const vid = vanshaId;

              if (ordered.length === 1) {
                const c = ordered[0];
                const xc = nodeMap[c.id]?.x ?? cx;
                const yAttach = childBottomY(c.id);
                return (
                  <g key={`trunk-${u.id}`}>
                    {/* Trunk spine — click to remove the couple link */}
                    <g style={{ cursor: 'pointer' }} onClick={() => handleDeleteLine(`su-${u.id}`, async () => {
                      if (!vid) return;
                      await unlinkPersons({ vansha_id: vid, person_id: u.maleNodeId, target_person_id: u.femaleNodeId });
                    })}>
                      <line x1={cx} y1={yTrunkStart} x2={cx} y2={yBar} stroke={trunkStroke} strokeWidth={trunkW} strokeOpacity={0.5} strokeLinecap="round" />
                      <line x1={cx} y1={yTrunkStart} x2={cx} y2={yBar} stroke="transparent" strokeWidth={14} pointerEvents="all" />
                    </g>
                    <line x1={cx} y1={yBar} x2={xc} y2={yBar} stroke={trunkStroke} strokeWidth={trunkW} strokeOpacity={0.5} strokeLinecap="round" />
                    {/* Drop — click to remove child's parent link */}
                    <g style={{ cursor: 'pointer' }} onClick={() => handleDeleteLine(`pu-${c.id}`, async () => {
                      await updatePerson(c.id, { parent_union_id: '' });
                    })}>
                      <line x1={xc} y1={yBar} x2={xc} y2={yAttach} stroke={dropStroke(c.relation)} strokeWidth={2} strokeOpacity={0.8} strokeLinecap="round" />
                      <line x1={xc} y1={yBar} x2={xc} y2={yAttach} stroke="transparent" strokeWidth={14} pointerEvents="all" />
                    </g>
                  </g>
                );
              }

              const xs = ordered.map((c) => nodeMap[c.id]?.x ?? cx);
              const leftX = Math.min(...xs);
              const rightX = Math.max(...xs);

              return (
                <g key={`trunk-${u.id}`}>
                  {/* Trunk spine — click to remove couple link */}
                  <g style={{ cursor: 'pointer' }} onClick={() => handleDeleteLine(`su-${u.id}`, async () => {
                    if (!vid) return;
                    await unlinkPersons({ vansha_id: vid, person_id: u.maleNodeId, target_person_id: u.femaleNodeId });
                  })}>
                    <line x1={cx} y1={yTrunkStart} x2={cx} y2={yBar} stroke={trunkStroke} strokeWidth={trunkW} strokeOpacity={0.5} strokeLinecap="round" />
                    <line x1={cx} y1={yTrunkStart} x2={cx} y2={yBar} stroke="transparent" strokeWidth={14} pointerEvents="all" />
                  </g>
                  <line x1={leftX} y1={yBar} x2={rightX} y2={yBar} stroke={trunkStroke} strokeWidth={trunkW} strokeOpacity={0.5} strokeLinecap="round" />
                  {/* Drops — each click removes that child's parent link */}
                  {ordered.map((c) => {
                    const xc = nodeMap[c.id]?.x ?? cx;
                    const yAttach = childBottomY(c.id);
                    return (
                      <g key={`drop-${u.id}-${c.id}`} style={{ cursor: 'pointer' }} onClick={() => handleDeleteLine(`pu-${c.id}`, async () => {
                        await updatePerson(c.id, { parent_union_id: '' });
                      })}>
                        <line x1={xc} y1={yBar} x2={xc} y2={yAttach} stroke={dropStroke(c.relation)} strokeWidth={2} strokeOpacity={0.8} strokeLinecap="round" />
                        <line x1={xc} y1={yBar} x2={xc} y2={yAttach} stroke="transparent" strokeWidth={14} pointerEvents="all" />
                      </g>
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
                  personalLabel={getLabel(node.id)}
                  onHoverChange={(isHovering) => setHoveredNodeId(isHovering ? node.id : null)}
                  onDragStart={handleNodeDragStart}
                  onSelect={(e) => {
                    // If this click ended a drag, don't also run the select/connect flow
                    if (wasDraggingRef.current) { wasDraggingRef.current = false; return; }
                    if (connectingFromId) {
                      if (node.id === connectingFromId) { setConnectingFromId(null); return; }
                      const src = positionedNodes.find(n => n.id === connectingFromId);
                      if (!src) return;
                      const diff = node.generation - src.generation;
                      const opts = (diff > 0 && Number.isFinite(diff))
                        ? ['Son', 'Daughter', 'Adopted Son', 'Adopted Daughter']
                        : (diff < 0 && Number.isFinite(diff))
                          ? ['Father', 'Mother']
                          : diff === 0
                            ? ['Spouse']
                            : ['Son', 'Daughter', 'Father', 'Mother', 'Spouse', 'Adopted Son', 'Adopted Daughter'];
                      // Find unions belonging to the parent node for the picker
                      const parentNodeId = diff > 0 ? src.id : diff < 0 ? node.id : null;
                      const nameById = new Map(positionedNodes.map(n => [n.id, n.name]));
                      const parentUnions = parentNodeId
                        ? (state.unionRows ?? [])
                            .filter(u => u.maleNodeId === parentNodeId || u.femaleNodeId === parentNodeId)
                            .map(u => ({ id: u.id, label: `${nameById.get(u.maleNodeId) ?? '—'} + ${nameById.get(u.femaleNodeId) ?? '—'}` }))
                        : [];
                      setConnectPopup({ targetId: node.id, targetName: node.name, options: opts, parentUnions });
                      setConnectRelation(opts[0]);
                      setConnectUnionId(parentUnions.length === 1 ? parentUnions[0].id : '');
                      return;
                    }
                    if (hasBridge && !e.shiftKey) {
                      openBirthVanshaIfPresent(node);
                      return;
                    }
                    setSelectedNodeId(node.id);
                  }}
                />
              );
            })}

            {(() => {
              if (!hoveredNodeId) return null;
              const hovered = nodeMap[hoveredNodeId];
              if (!hovered) return null;
              const lines = hoverDetailsForNode(hovered);
              const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
              const width = Math.min(Math.max(170, maxChars * 6.2 + 18), 290);
              const lineH = 14;
              const height = 10 + lines.length * lineH;
              const padX = 8;
              const preferredX = hovered.x + 26;
              const x = Math.max(8, Math.min(preferredX, viewWidth - width - 8));
              const preferredY = hovered.y - height - 14;
              const y = Math.max(8, Math.min(preferredY, viewHeight - height - 8));
              return (
                <g pointerEvents="none" aria-hidden>
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx={8}
                    ry={8}
                    fill="hsl(var(--card))"
                    stroke="hsl(var(--border))"
                    strokeWidth={1}
                    opacity={0.98}
                  />
                  <text
                    x={x + padX}
                    y={y + 16}
                    className="text-[10px] font-body fill-foreground"
                  >
                    {lines.map((line, idx) => (
                      <tspan key={`hover-line-${idx}`} x={x + padX} dy={idx === 0 ? 0 : lineH}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })()}

            {spouseEdges.map((e) => {
              const a = nodeMap[e.from];
              const b = nodeMap[e.to];
              if (!a || !b) return null;
              const left = a.x <= b.x ? a : b;
              const right = a.x <= b.x ? b : a;
              return <SpousePlusMark key={`plus-${e.from}-${e.to}`} left={left} right={right} />;
            })}

            {/* Drag-to-connect preview line (L-shaped: horizontal then vertical) */}
            {dragPreview && (
              <g pointerEvents="none">
                <path
                  d={`M ${dragPreview.fx},${dragPreview.fy} H ${dragPreview.tx} V ${dragPreview.ty}`}
                  stroke="rgba(46,19,70,0.7)"
                  strokeWidth={2}
                  strokeDasharray="7 4"
                  fill="none"
                  strokeLinecap="round"
                />
                <circle cx={dragPreview.tx} cy={dragPreview.ty} r={5} fill="rgba(46,19,70,0.45)" />
              </g>
            )}

          </svg>

        </div>
      </>
    );
  };

  const isMobile = useIsMobile();
  const isTablet = !isMobile && typeof window !== 'undefined' && window.innerWidth < 1024;
  const selectedNode = positionedNodes.find(n => n.id === selectedNodeId);

  const [zoom, setZoom] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const clampZoom = (z: number) => Math.max(0.25, Math.min(3, z));
  const zoomIn  = useCallback(() => setZoom(z => clampZoom(z + 0.15)), []);
  const zoomOut = useCallback(() => setZoom(z => clampZoom(z - 0.15)), []);
  const zoomFit = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { clientWidth, clientHeight } = scrollContainerRef.current;
    setZoom(clampZoom(Math.min(clientWidth / viewWidth, clientHeight / viewHeight)));
  }, [viewWidth, viewHeight]);

  // Auto-fit when tree first loads
  useEffect(() => {
    if (isTreeInitialized) {
      setTimeout(() => zoomFit(), 50);
    }
  }, [isTreeInitialized, zoomFit]);

  // ESC cancels connect mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setConnectingFromId(null); setConnectPopup(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toSvgCoords = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const inv = svg.getScreenCTM()?.inverse();
    if (!inv) return null;
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }, []);

  const triggerDragConnect = useCallback((fromId: string, toId: string) => {
    const src = positionedNodes.find(n => n.id === fromId);
    const tgt = positionedNodes.find(n => n.id === toId);
    if (!src || !tgt) return;
    const diff = tgt.generation - src.generation;
    const opts = (diff > 0 && Number.isFinite(diff))
      ? ['Son', 'Daughter', 'Adopted Son', 'Adopted Daughter']
      : (diff < 0 && Number.isFinite(diff))
        ? ['Father', 'Mother']
        : diff === 0
          ? ['Spouse']
          : ['Son', 'Daughter', 'Father', 'Mother', 'Spouse', 'Adopted Son', 'Adopted Daughter'];
    const parentNodeId = diff > 0 ? src.id : diff < 0 ? tgt.id : null;
    const nameById = new Map(positionedNodes.map(n => [n.id, n.name]));
    const parentUnions = parentNodeId
      ? (state.unionRows ?? [])
          .filter(u => u.maleNodeId === parentNodeId || u.femaleNodeId === parentNodeId)
          .map(u => ({ id: u.id, label: `${nameById.get(u.maleNodeId) ?? '—'} + ${nameById.get(u.femaleNodeId) ?? '—'}` }))
      : [];
    setConnectingFromId(fromId);
    setConnectPopup({ targetId: toId, targetName: tgt.name, options: opts, parentUnions });
    setConnectRelation(opts[0]);
    setConnectUnionId(parentUnions.length === 1 ? parentUnions[0].id : '');
  }, [positionedNodes, state.unionRows]);

  const handleNodeDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.preventDefault(); // block text-selection / scroll; do NOT stopPropagation
    wasDraggingRef.current = false;
    dragPotentialRef.current = { id: nodeId, screenX: e.clientX, screenY: e.clientY };
  }, []);

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragPotentialRef.current && !dragFromRef.current) return;

    if (dragPotentialRef.current) {
      const dx = e.clientX - dragPotentialRef.current.screenX;
      const dy = e.clientY - dragPotentialRef.current.screenY;
      if (Math.sqrt(dx * dx + dy * dy) > 6) {
        const node = positionedNodes.find(n => n.id === dragPotentialRef.current!.id);
        if (node) {
          dragFromRef.current = { id: dragPotentialRef.current.id, x: node.x, y: node.y };
          dragPotentialRef.current = null;
          wasDraggingRef.current = true;
        }
      }
      return;
    }

    if (dragFromRef.current) {
      const coords = toSvgCoords(e);
      if (coords) setDragPreview({ fx: dragFromRef.current.x, fy: dragFromRef.current.y, tx: coords.x, ty: coords.y });
    }
  }, [positionedNodes, toSvgCoords]);

  const cancelDrag = useCallback(() => {
    dragPotentialRef.current = null;
    dragFromRef.current = null;
    setDragPreview(null);
  }, []);

  const handleSvgMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    dragPotentialRef.current = null;
    const from = dragFromRef.current;
    dragFromRef.current = null;
    setDragPreview(null);
    if (!from) return;
    const coords = toSvgCoords(e);
    if (coords) {
      const HIT_R = 34;
      const target = positionedNodes.find(n =>
        n.id !== from.id &&
        Math.sqrt((n.x - coords.x) ** 2 + (n.y - coords.y) ** 2) < HIT_R
      );
      if (target) triggerDragConnect(from.id, target.id);
    }
  }, [positionedNodes, toSvgCoords, triggerDragConnect]);

  const handleLinkSubmit = async () => {
    if (!connectPopup || !connectRelation || !connectingFromId) return;
    const vid = vanshaId || defaultVanshaFromEnv || getPersistedVanshaId();
    if (!vid) { toast({ title: "No vansha ID — open tree via /tree?vansha_id=...", variant: "destructive" }); return; }
    setConnectLinking(true);
    try {
      await linkPersons({ vansha_id: vid, person_id: connectingFromId, target_person_id: connectPopup.targetId, relation: connectRelation, union_id: connectUnionId || undefined });
      setConnectingFromId(null);
      setConnectPopup(null);
      setRetryToken(t => t + 1); // triggers the main loading effect to re-fetch the full tree
    } catch (err) {
      toast({ title: 'Link failed', description: err instanceof Error ? err.message : 'Could not connect.', variant: 'destructive' });
    } finally {
      setConnectLinking(false);
    }
  };

  const handleDeleteNode = async (nodeId: string, name: string) => {
    if (!confirm(`Delete "${name}" from the tree? This cannot be undone.`)) return;
    setDeletingNodeId(nodeId);
    try {
      await deletePerson(nodeId);
      setSelectedNodeId(null);
      setRetryToken(t => t + 1);
      toast({ title: `${name} removed from tree` });
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setDeletingNodeId(null);
    }
  };

  const handleDeleteLine = async (key: string, action: () => Promise<void>) => {
    if (!confirm('Delete this connection?')) return;
    setUnlinkingEdge(key);
    try {
      await action();
      setRetryToken(t => t + 1);
      toast({ title: 'Connection removed' });
    } catch (err) {
      toast({ title: 'Failed to remove connection', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setUnlinkingEdge(null);
    }
  };

  const completionPct = Math.round(Math.min(100, (membersUsed / plan.maxNodes) * 100));

  const nodeOwnerId   = (selectedNode as Record<string, unknown> | undefined)?.ownerId   as string | undefined;
  const nodeCreatedBy = (selectedNode as Record<string, unknown> | undefined)?.createdBy as string | undefined;
  const isSovereign   = !!appUser?.id && !!nodeOwnerId   && nodeOwnerId   === appUser.id;
  const isCreator     = !!appUser?.id && !!nodeCreatedBy && nodeCreatedBy === appUser.id;
  const canControl    = isSovereign || isCreator;
  const isUnclaimed   = !nodeOwnerId || nodeOwnerId === nodeCreatedBy;

  const sidebarW = isMobile ? 0 : isTablet ? 260 : 320;

  return (
    <AppShell>
      {/* Connect mode banner */}
      {connectingFromId && (
        <div style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 120, background: 'var(--ds-plum,#2e1346)', color: '#fff', padding: '8px 22px', borderRadius: 24, fontSize: 13, fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(28,13,46,0.35)' }}>
          Click a family member to connect · ESC to cancel
        </div>
      )}

      {/* Connect relation popup */}
      {connectPopup && (() => {
        const srcNode = positionedNodes.find(n => n.id === connectingFromId);
        return (
          <div onClick={() => setConnectPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(28,13,46,0.5)', zIndex: 200, display: 'grid', placeItems: 'center', padding: 24 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--ds-paper,#fff)', borderRadius: 16, padding: 28, width: 'min(400px,100%)', boxShadow: '0 24px 64px rgba(28,13,46,0.3)' }}>
              <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 18, color: 'var(--ds-plum,#2e1346)', marginBottom: 6 }}>Connect family members</div>
              <p style={{ fontSize: 13, color: 'var(--ds-ink-soft)', marginBottom: 16 }}>
                <strong>{srcNode?.name ?? ''}</strong> → <strong>{connectPopup.targetName}</strong>
              </p>
              <select value={connectRelation} onChange={e => setConnectRelation(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--ds-hairline,#e0ddd5)', fontSize: 13, marginBottom: 12, background: 'var(--ds-ivory,#faf8f2)' }}>
                {connectPopup.options.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {connectPopup.parentUnions.length > 1 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--ds-ink-soft)', marginBottom: 4 }}>Which family?</div>
                  <select value={connectUnionId} onChange={e => setConnectUnionId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--ds-hairline,#e0ddd5)', fontSize: 13, background: 'var(--ds-ivory,#faf8f2)' }}>
                    <option value="">Select family…</option>
                    {connectPopup.parentUnions.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setConnectPopup(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--ds-hairline,#e0ddd5)', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button onClick={() => void handleLinkSubmit()} disabled={connectLinking || (connectPopup.parentUnions.length > 1 && !connectUnionId)} style={{ padding: '8px 22px', borderRadius: 8, background: 'var(--ds-plum,#2e1346)', color: '#fff', border: 'none', cursor: (connectLinking || (connectPopup.parentUnions.length > 1 && !connectUnionId)) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: (connectLinking || (connectPopup.parentUnions.length > 1 && !connectUnionId)) ? 0.5 : 1 }}>
                  {connectLinking ? 'Linking…' : 'Confirm →'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Full-page canvas layout: tree left + sidebar right (bottom sheet on mobile) */}
      <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>

        {/* ── Tree canvas ──────────────────────────────────────────────── */}
        <div style={{
          flex: 1, position: 'relative',
          background: '#f7f5f0',
          overflow: 'hidden',
          boxShadow: isMobile ? 'none' : [
            'inset 0 0 0 2px #c8a44a',
            'inset 0 0 0 14px #2c1a08',
            'inset 0 0 0 17px #9a7b2a',
            'inset 0 0 0 21px #f0d060',
            'inset 0 0 0 24px #9a7b2a',
            'inset 0 0 0 33px #2c1a08',
            'inset 0 0 0 35px #c8a44a',
          ].join(', '),
        }}>
          {/* Scrollable inner — inset 35px so content never bleeds over frame */}
          <div ref={scrollContainerRef} style={{ position: 'absolute', inset: isMobile ? 0 : 35, overflow: 'auto' }}>
            {/* Tree canvas body */}
            <div style={{ paddingTop: isMobile ? 70 : 16, paddingBottom: isMobile ? 120 : 80, minHeight: '100%', position: 'relative', zIndex: 1 }}>
              {treeCanvasBody()}
            </div>
          </div>

          {/* Zoom controls */}
          {!isMobile && (
            <div style={{
              position: 'absolute', bottom: isMobile ? 16 : 50, right: isMobile ? 16 : 50,
              zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              {[
                { icon: <ZoomIn className="w-4 h-4" />, label: '+', onClick: zoomIn },
                { icon: <ZoomOut className="w-4 h-4" />, onClick: zoomOut },
                { icon: <Maximize2 className="w-4 h-4" />, onClick: zoomFit },
              ].map(({ icon, onClick }, i) => (
                <button
                  key={i}
                  onClick={onClick}
                  style={{
                    width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(184,134,11,0.35)',
                    background: 'rgba(252,250,244,0.92)', backdropFilter: 'blur(8px)',
                    display: 'grid', placeItems: 'center', cursor: 'pointer',
                    color: '#2e1346', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                  }}
                >
                  {icon}
                </button>
              ))}
              <div style={{ fontSize: 9, textAlign: 'center', color: 'rgba(74,33,104,0.5)', fontFamily: 'var(--font-mono,monospace)', marginTop: 2 }}>
                {Math.round(zoom * 100)}%
              </div>
            </div>
          )}
        </div>

        {/* ── Right sidebar / mobile bottom sheet ───────────────────────── */}
        <aside
          className="tree-side"
          style={isMobile ? {
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: 'var(--ds-surface, #fff)',
            borderRadius: '16px 16px 0 0',
            boxShadow: '0 -4px 32px rgba(28,13,46,0.18)',
            maxHeight: selectedNode ? '80vh' : '56px',
            overflow: 'hidden',
            transition: 'max-height 0.32s cubic-bezier(0.4,0,0.2,1)',
            overflowY: selectedNode ? 'auto' : 'hidden',
          } : {
            width: sidebarW, background: 'var(--ds-surface, #fff)',
            borderLeft: '1px solid var(--ds-border, rgba(74,33,104,0.1))',
            overflowY: 'auto', flexShrink: 0,
          }}
        >
          {/* Mobile drag handle */}
          {isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 0 6px', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(74,33,104,0.2)' }} />
            </div>
          )}
          {selectedNode ? (
            <div style={{ padding: isMobile ? '4px 16px 24px' : '16px 20px 24px' }}>
              {/* ── Profile header ── */}
              {(() => {
                const isSelf = selectedNode.relation?.toLowerCase() === 'self';
                // Owner sees their own node with full birth year; all other nodes show dd MMM only
                const isOwnerSelf = isSelf && isSovereign;
                const fmtDOB = (dateStr: string | undefined): string | undefined => {
                  if (!dateStr || dateStr.length < 10) return dateStr;
                  try {
                    const d = new Date(dateStr + 'T00:00:00');
                    if (isNaN(d.getTime())) return dateStr;
                    return d.toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short',
                      ...(isOwnerSelf ? { year: 'numeric' } : {}),
                    });
                  } catch { return dateStr; }
                };
                const parentUnion = (state.unionRows ?? []).find(u =>
                  u.id === selectedNode.parentUnionId ||
                  (u.id ?? '').replace(/-/g,'') === (selectedNode.parentUnionId ?? '').replace(/-/g,'')
                );
                const fatherNode = parentUnion
                  ? state.nodes.find(n => n.id === parentUnion.maleNodeId)
                  : state.nodes.find(n => n.id === selectedNode.fatherNodeId);
                const motherNode = parentUnion
                  ? state.nodes.find(n => n.id === parentUnion.femaleNodeId)
                  : state.nodes.find(n => n.id === selectedNode.motherNodeId);
                const myUnions = (state.unionRows ?? []).filter(u =>
                  u.maleNodeId === selectedNode.id || u.femaleNodeId === selectedNode.id
                );
                const spouseNodes = myUnions.map(u => {
                  const sid = u.maleNodeId === selectedNode.id ? u.femaleNodeId : u.maleNodeId;
                  return state.nodes.find(n => n.id === sid);
                }).filter(Boolean);
                const myUnionIds = new Set(myUnions.map(u => u.id));
                const childNodes = state.nodes.filter(n => n.parentUnionId && myUnionIds.has(n.parentUnionId));

                const row = (label: string, value: string | undefined) => value ? (
                  <div key={label} style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 4, padding: '4px 0', fontSize: 12, borderBottom: '1px solid rgba(74,33,104,0.06)' }}>
                    <span style={{ color: 'rgba(74,33,104,0.5)', fontSize: 11 }}>{label}</span>
                    <span style={{ color: '#1c0d2e', fontWeight: 500 }}>{value}</span>
                  </div>
                ) : null;

                const inviteLink = `${window.location.origin}/code?type=node&nodeId=${selectedNode.id}`;

                return (
                  <>
                    {/* Name + close */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#2e1346,#1a0a2e)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
                        {(selectedNode.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: '#1c0d2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedNode.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(74,33,104,0.5)', marginTop: 1 }}>{selectedNode.relation || ''}</div>
                      </div>
                      <button onClick={() => setSelectedNodeId(null)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(74,33,104,0.08)', color: 'rgba(74,33,104,0.6)', fontSize: 15, cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>✕</button>
                    </div>

                    {/* Profile fields */}
                    <div style={{ marginBottom: 14, borderRadius: 8, border: '1px solid rgba(74,33,104,0.1)', overflow: 'hidden', background: '#faf8f2' }}>
                      <div style={{ padding: '8px 12px 4px' }}>
                        {row('Date of Birth', fmtDOB(selectedNode.dateOfBirth))}
                        {row('Father', fatherNode?.name)}
                        {row('Mother', motherNode?.name)}
                        {spouseNodes.length > 0 && row('Spouse', spouseNodes.map(s => s!.name).join(', '))}
                        {childNodes.length > 0 && row('Children', childNodes.map(c => c.name).join(', '))}
                        {!selectedNode.dateOfBirth && !fatherNode && !motherNode && spouseNodes.length === 0 && childNodes.length === 0 && (
                          <div style={{ fontSize: 11, color: 'rgba(74,33,104,0.4)', padding: '6px 0 4px', fontStyle: 'italic' }}>No profile details yet</div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                      {/* Edit */}
                      <button
                        onClick={() => navigate(`/node/${selectedNode.id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(74,33,104,0.2)', background: 'rgba(74,33,104,0.04)', fontSize: 13, fontWeight: 600, color: '#2e1346', cursor: 'pointer' }}
                      >
                        <Pencil className="w-4 h-4" /> Edit profile
                      </button>

                      {/* Add Member — opens the full NodePage form with this node as anchor */}
                      <button
                        onClick={() => {
                          const vid = vanshaId || defaultVanshaFromEnv || getPersistedVanshaId();
                          const params = new URLSearchParams({ anchor_node_id: selectedNode.id });
                          if (vid) params.set('vansha_id', vid);
                          navigate(`/node?${params.toString()}`);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, border: 'none', background: '#2e1346', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: 16 }}>➕</span> Add member
                      </button>

                      {/* Delete (not self) */}
                      {!isSelf && (
                        <button
                          disabled={deletingNodeId === selectedNode.id}
                          onClick={() => handleDeleteNode(selectedNode.id, selectedNode.name)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.04)', fontSize: 13, fontWeight: 600, color: '#b91c1c', cursor: 'pointer', opacity: deletingNodeId === selectedNode.id ? 0.5 : 1 }}
                        >
                          <span style={{ fontSize: 15 }}>🗑</span>
                          {deletingNodeId === selectedNode.id ? 'Deleting…' : 'Delete member'}
                        </button>
                      )}
                    </div>

                    {/* Invite link */}
                    <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(74,33,104,0.12)', background: '#faf8f2' }}>
                      <div style={{ fontSize: 10, color: 'rgba(74,33,104,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Invite to join as {selectedNode.name}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ flex: 1, padding: '5px 8px', borderRadius: 6, background: '#fff', border: '1px solid rgba(74,33,104,0.15)', fontSize: 10, fontFamily: 'monospace', color: '#2e1346', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inviteLink}</div>
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(inviteLink);
                            setInviteCopied(true);
                            setTimeout(() => setInviteCopied(false), 2000);
                            toast({ title: 'Invite link copied!' });
                          }}
                          style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#2e1346', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                        >
                          {inviteCopied ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div style={{ padding: 20 }}>
              {/* Tree stats */}
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1c0d2e', marginBottom: 12 }}>
                {state.treeName || 'Vansha Tree'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(74,33,104,0.1)', background: '#faf8f2', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#2e1346' }}>{membersUsed}</div>
                  <div style={{ fontSize: 10, color: 'rgba(74,33,104,0.5)' }}>Members</div>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(74,33,104,0.1)', background: '#faf8f2', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#2e1346' }}>{generationsUsed}</div>
                  <div style={{ fontSize: 10, color: 'rgba(74,33,104,0.5)' }}>Generations</div>
                </div>
              </div>

              {/* Usage guide */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { icon: '👆', text: 'Tap any member to see their profile' },
                  { icon: '➕', text: 'Tap member → Add member to link a new relative' },
                  { icon: '✂️', text: 'Click any line in the tree to delete it' },
                  { icon: '🗑', text: 'Select a member → Delete member to remove them' },
                ].map(({ icon, text }) => (
                  <div key={text} style={{ display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 7, background: 'rgba(74,33,104,0.03)', border: '1px solid rgba(74,33,104,0.07)', fontSize: 12, color: '#1c0d2e', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  );
};

export default TreePage;
