import React, { useEffect, useMemo, useState, useRef } from 'react';
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
import { fetchMatrimonyProfile, fetchVanshaTree, fetchVanshaTreePage, getApiBaseUrl, getPersistedVanshaId } from '@/services/api';
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
import { AlertCircle, ChevronLeft, ChevronRight, Copy, Check, Link2, Loader2, Pencil, Share2, TreePine, UserPlus } from 'lucide-react';

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
  const { plan, membersUsed, generationsUsed } = usePlan();
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
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
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
        {/* Eco tribute banner */}
        <div style={{ margin: '0 16px 14px', padding: '14px 18px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(34,120,58,0.09), rgba(212,154,31,0.07))', border: '1px solid rgba(34,120,58,0.22)', display: 'flex', gap: 14, alignItems: 'flex-start', position: 'relative', zIndex: 2 }}>
          <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>🌳</span>
          <div>
            <div className="font-heading" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-plum,#2e1346)', marginBottom: 5, letterSpacing: '0.01em' }}>
              एक पेड़ — एक श्रद्धांजलि &nbsp;·&nbsp; Plant a tree for every soul in your Vansh
            </div>
            <div className="font-body" style={{ fontSize: 12, color: 'rgba(46,19,70,0.65)', lineHeight: 1.65 }}>
              A single tree gifts <strong>~100 kg of oxygen</strong> per year, captures <strong>22 kg of CO₂</strong>, shelters <strong>200+ species</strong>, and purifies groundwater for generations to come.
              Every tree planted in their name carries their <strong style={{ color: 'rgba(46,19,70,0.8)' }}>पुण्य</strong> forward — to their soul, and to all who carry their blood.
            </div>
          </div>
        </div>

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
        <div className="relative w-full" style={{ height: Math.max(320, viewHeight) }}>
          <div className="absolute inset-0 gradient-warm opacity-50" />
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            preserveAspectRatio="xMidYMid meet"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            style={{ WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties}
          >
            <defs>
              {/* Corner rosette symbol — reused at all 4 corners */}
              <symbol id="corner-rosette" viewBox="0 0 48 48">
                {/* Bracket arms */}
                <line x1="0" y1="2" x2="32" y2="2" stroke="#c8a44a" strokeWidth="2" strokeLinecap="round"/>
                <line x1="2" y1="0" x2="2" y2="32" stroke="#c8a44a" strokeWidth="2" strokeLinecap="round"/>
                {/* Curved flourish */}
                <path d="M 6 32 Q 12 12 32 6" stroke="#c8a44a" strokeWidth="1.2" fill="none" opacity="0.55" strokeLinecap="round"/>
                {/* Outer ring */}
                <circle cx="2" cy="2" r="9" fill="none" stroke="#c8a44a" strokeWidth="1.5" opacity="0.7"/>
                {/* Wood fill */}
                <circle cx="2" cy="2" r="7" fill="#2c1a08"/>
                {/* Brass fill */}
                <circle cx="2" cy="2" r="5" fill="#c8a44a"/>
                {/* Dark center */}
                <circle cx="2" cy="2" r="2.5" fill="#1a0a04"/>
                {/* Bright highlight */}
                <circle cx="1" cy="1" r="1" fill="#f0d060" opacity="0.85"/>
              </symbol>
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
            {/* Generation guide lines */}
            {Array.from(new Set(positionedNodes.map(n => n.y))).sort((a, b) => a - b).map((gy, i) => (
              <line key={`gen-${i}`} x1={20} y1={gy} x2={viewWidth - 20} y2={gy} stroke="rgba(74,33,104,0.08)" strokeDasharray="2 8" />
            ))}
            {/* Canopy bloom at top */}
            {positionedNodes.length > 0 && (
              <ellipse cx={viewWidth / 2} cy={Math.min(...positionedNodes.map(n => n.y)) - 10} rx={viewWidth * 0.38} ry={60} fill="var(--ds-gold,#d49a1f)" opacity={0.05} />
            )}
            {/* Decorative roots fanning from oldest generation */}
            {positionedNodes.length > 0 && (() => {
              const rootY = Math.max(...positionedNodes.map(n => n.y)) + 60;
              return (
                <g opacity="0.35">
                  <path d={`M${viewWidth*0.3},${rootY} Q${viewWidth*0.1},${rootY+60} ${viewWidth*0.05},${viewHeight-10}`} stroke="#6b4a2a" strokeWidth="2" fill="none"/>
                  <path d={`M${viewWidth*0.42},${rootY} Q${viewWidth*0.32},${rootY+60} ${viewWidth*0.22},${viewHeight-10}`} stroke="#6b4a2a" strokeWidth="2" fill="none"/>
                  <path d={`M${viewWidth*0.58},${rootY} Q${viewWidth*0.62},${rootY+60} ${viewWidth*0.72},${viewHeight-10}`} stroke="#6b4a2a" strokeWidth="2" fill="none"/>
                  <path d={`M${viewWidth*0.7},${rootY} Q${viewWidth*0.85},${rootY+60} ${viewWidth*0.9},${viewHeight-10}`} stroke="#6b4a2a" strokeWidth="2" fill="none"/>
                </g>
              );
            })()}
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
              const midY = (from.y + 20 + to.y) / 2;
              return (
                <path
                  key={`ln-${i}`}
                  d={`M${from.x},${from.y + 20} C${from.x},${midY} ${to.x},${midY} ${to.x},${to.y}`}
                  stroke={adopted ? stroke : "url(#branch-grad)"}
                  strokeWidth={adopted ? 2 : 2.5}
                  strokeOpacity={adopted ? 0.55 : 1}
                  strokeDasharray={adopted ? "5 4" : undefined}
                  fill="none"
                  strokeLinecap="round"
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
                  <g key={`trunk-${u.id}`}>
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
                <g key={`trunk-${u.id}`}>
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
                  personalLabel={getLabel(node.id)}
                  onHoverChange={(isHovering) => setHoveredNodeId(isHovering ? node.id : null)}
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

            {/* Corner rosettes — sit just inside the inset frame border (35px) */}
            {!isMobile && (<>
              {/* Top-left: normal */}
              <g transform={`translate(35,35)`}>
                <use href="#corner-rosette" width={48} height={48} />
              </g>
              {/* Top-right: flip horizontally around the corner point */}
              <g transform={`translate(${viewWidth - 35},35) scale(-1,1)`}>
                <use href="#corner-rosette" width={48} height={48} />
              </g>
              {/* Bottom-left: flip vertically */}
              <g transform={`translate(35,${viewHeight - 35}) scale(1,-1)`}>
                <use href="#corner-rosette" width={48} height={48} />
              </g>
              {/* Bottom-right: flip both axes */}
              <g transform={`translate(${viewWidth - 35},${viewHeight - 35}) scale(-1,-1)`}>
                <use href="#corner-rosette" width={48} height={48} />
              </g>
            </>)}

            {/* Tiled watermark — screenshot deterrence */}
            {Array.from({ length: Math.ceil(viewHeight / 120) }).map((_, row) =>
              Array.from({ length: Math.ceil(viewWidth / 200) }).map((_, col) => (
                <text
                  key={`wm-${row}-${col}`}
                  x={col * 200 + 20}
                  y={row * 120 + 60}
                  fontSize={10}
                  fontFamily="var(--font-mono, monospace)"
                  fill="rgba(74,33,104,0.07)"
                  transform={`rotate(-22, ${col * 200 + 20}, ${row * 120 + 60})`}
                  pointerEvents="none"
                  style={{ userSelect: 'none' } as React.CSSProperties}
                >
                  {state.treeName || 'Prakriti'} · prakriti.ecotech.co.in
                </text>
              ))
            )}
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

  const isMobile = useIsMobile();
  const isTablet = !isMobile && typeof window !== 'undefined' && window.innerWidth < 1024;
  const selectedNode = positionedNodes.find(n => n.id === selectedNodeId);
  const completionPct = Math.round(Math.min(100, (membersUsed / plan.maxNodes) * 100));

  const nodeOwnerId   = (selectedNode as Record<string, unknown> | undefined)?.ownerId   as string | undefined;
  const nodeCreatedBy = (selectedNode as Record<string, unknown> | undefined)?.createdBy as string | undefined;
  const isSovereign   = !!appUser?.id && !!nodeOwnerId   && nodeOwnerId   === appUser.id;
  const isCreator     = !!appUser?.id && !!nodeCreatedBy && nodeCreatedBy === appUser.id;
  const canControl    = isSovereign || isCreator;
  const isUnclaimed   = !nodeOwnerId || nodeOwnerId === nodeCreatedBy;

  const PUNYA_SEVAS = [
    { icon: '🌳', title: 'Plant a tree for every soul', sub: 'One tree = 100 kg O₂/yr · 200+ species sheltered', cta: 'Plant now · ₹199', color: '#1a6b32' },
    { icon: '\u{1F4A7}', title: 'Organise water distribution', sub: 'Earn punya by quenching thirst this summer', cta: 'Organise · ₹499', color: '#1a4a8a' },
    { icon: '\u{1F35B}', title: 'Organise anna-daan', sub: 'Feed 50 people — punya for every morsel', cta: 'Log seva · ₹299', color: '#8a3a00' },
    { icon: '\u{1F9F9}', title: 'Lead a swachchhata drive', sub: 'Clean your gali, earn your Prakriti score', cta: 'Register · free', color: '#5a2a8a' },
  ];
  const punySeva = PUNYA_SEVAS[membersUsed % PUNYA_SEVAS.length];

  const sidebarW = isMobile ? 0 : isTablet ? 260 : 320;

  return (
    <AppShell>
      {/* Full-page canvas layout: tree left + sidebar right (bottom sheet on mobile) */}
      <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>

        {/* ── Tree canvas ──────────────────────────────────────────────── */}
        <div style={{
          flex: 1, position: 'relative',
          background: 'linear-gradient(180deg, var(--ds-ivory, #faf8f2) 0%, #f5f0e8 100%)',
          overflow: 'auto',
          /* Royal frame: gold line → dark mahogany → brass molding → dark mahogany → gold line */
          boxShadow: isMobile ? 'none' : [
            'inset 0 0 0 2px #c8a44a',
            'inset 0 0 0 14px #2c1a08',
            'inset 0 0 0 17px #9a7b2a',
            'inset 0 0 0 21px #f0d060',
            'inset 0 0 0 24px #9a7b2a',
            'inset 0 0 0 33px #2c1a08',
            'inset 0 0 0 35px #c8a44a',
            'inset 0 3px 24px rgba(0,0,0,0.10)',
          ].join(', '),
        }}>

          {/* Dot-grid texture */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(74,33,104,0.06) 1px, transparent 0)', backgroundSize: '28px 28px', pointerEvents: 'none', zIndex: 0 }} />

          {/* Vansh watermark */}
          {isTreeInitialized && (
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 0, overflow: 'hidden' }}>
              <div style={{ transform: 'rotate(-18deg)', textAlign: 'center', userSelect: 'none' }}>
                <div className="font-heading" style={{ fontSize: 'clamp(60px,12vw,200px)', fontWeight: 700, lineHeight: 0.9, background: 'linear-gradient(135deg, rgba(46,19,70,0.07), rgba(212,154,31,0.09))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  {state.treeName || 'वंश'}
                </div>
                <div className="font-heading" style={{ fontSize: 'clamp(18px,3vw,48px)', color: 'rgba(74,33,104,0.10)', marginTop: -8, fontStyle: 'italic' }}>{state.treeName}</div>
              </div>
            </div>
          )}


          {/* Royal Vansh nameplate badge */}
          {isTreeInitialized && (() => {
            const selfNode = state.nodes.find(n => n.id === state.currentUserId);
            const gotra = (selfNode as Record<string, unknown>)?.gotra as string | undefined;
            const moolNiwas = (selfNode as Record<string, unknown>)?.moolNiwas as string | undefined;
            const ancestral = (selfNode as Record<string, unknown>)?.ancestralPlace as string | undefined;
            const row2 = gotra ? `${gotra} Gotra` : (moolNiwas || null);
            const row3 = ancestral || moolNiwas || null;
            return (
              <div style={{
                position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
                zIndex: 6, minWidth: 200, maxWidth: 280,
                background: 'linear-gradient(160deg, #6b1a1a 0%, #3d0a0a 60%, #2a0606 100%)',
                border: '2px solid #b8860b',
                borderRadius: 4,
                boxShadow: '0 0 0 1px rgba(184,134,11,0.25), 0 6px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(212,166,60,0.18)',
                padding: '12px 22px 14px',
                textAlign: 'center',
                userSelect: 'none',
              }}>
                {/* Top ornamental line */}
                <div style={{ position: 'absolute', top: 5, left: 10, right: 10, height: 1, background: 'linear-gradient(90deg, transparent, #b8860b 30%, #d4a628 50%, #b8860b 70%, transparent)' }} />
                {/* Row 1: Vansh name */}
                <div className="font-heading" style={{ fontSize: 15, fontWeight: 800, color: '#e8c060', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1.2, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                  {state.treeName || 'वंश'}
                </div>
                {/* Row 2: Gotra or Mool Niwas */}
                {row2 && (
                  <div style={{ fontSize: 10, color: '#c9a84c', letterSpacing: '0.14em', marginTop: 5, fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', opacity: 0.9 }}>
                    {row2}
                  </div>
                )}
                {/* Row 3: Ancestral place */}
                {row3 && row3 !== row2 && (
                  <div style={{ fontSize: 10, color: '#c9a84c', letterSpacing: '0.1em', marginTop: 3, fontFamily: 'var(--font-body, sans-serif)', opacity: 0.75 }}>
                    {row3}
                  </div>
                )}
                {/* Bottom ornamental line */}
                <div style={{ position: 'absolute', bottom: 5, left: 10, right: 10, height: 1, background: 'linear-gradient(90deg, transparent, #b8860b 30%, #d4a628 50%, #b8860b 70%, transparent)' }} />
              </div>
            );
          })()}

          {/* Tree canvas body */}
          <div style={{ paddingTop: isMobile ? 70 : 16, paddingBottom: isMobile ? 120 : 80, minHeight: '100%', position: 'relative', zIndex: 1 }}>
            {treeCanvasBody()}
          </div>

          {/* Punya-arjan seva strip */}
          {isTreeInitialized && (
            <div style={{ position: 'sticky', bottom: 12, margin: '0 12px', zIndex: 5 }}>
              <div style={{ padding: '13px 16px', borderRadius: 10, background: 'rgba(252,250,244,0.95)', backdropFilter: 'blur(12px)', border: `1px solid ${punySeva.color}30`, boxShadow: `0 2px 16px ${punySeva.color}18`, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{punySeva.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.14em', color: punySeva.color, fontFamily: 'var(--font-mono,monospace)', textTransform: 'uppercase', opacity: 0.7, marginBottom: 2 }}>पुण्य अर्जन · Seva opportunity</div>
                  <div className="font-heading" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-plum,#2e1346)', lineHeight: 1.2 }}>{punySeva.title}</div>
                  <div style={{ fontSize: 11, color: 'rgba(74,33,104,0.55)', marginTop: 2 }}>{punySeva.sub}</div>
                </div>
                <button
                  onClick={() => navigate('/eco-sewa')}
                  style={{ flexShrink: 0, padding: '7px 13px', borderRadius: 8, border: 'none', background: punySeva.color, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >{punySeva.cta}</button>
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
          {/* Mobile drag handle / collapsed strip */}
          {isMobile && (
            <div
              onClick={() => !selectedNode && setSelectedNodeId(null)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 0 6px', cursor: 'pointer', flexShrink: 0 }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(74,33,104,0.2)' }} />
            </div>
          )}
          {isMobile && !selectedNode && (
            <div style={{ padding: '4px 16px 12px', textAlign: 'center', fontSize: 12, color: 'rgba(74,33,104,0.5)' }}>
              Tap a member to see details
            </div>
          )}
          {selectedNode ? (
            <div style={{ padding: isMobile ? '4px 16px 20px' : 20 }}>
              {/* Member header */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,var(--ds-plum,#2e1346),#1a0a2e)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 22, fontFamily: 'var(--font-heading, serif)', fontWeight: 700, flexShrink: 0 }}>
                  {(selectedNode.name || '?').charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="font-heading" style={{ fontSize: 18, color: 'var(--ds-plum,#2e1346)', fontWeight: 700 }}>{selectedNode.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ds-muted,#6b6b8a)', marginTop: 2 }}>{selectedNode.relation}</div>
                  {selectedNode.verificationTier && selectedNode.verificationTier !== 'none' && (
                    <span className="ds-tag-gold" style={{ marginTop: 6, display: 'inline-block' }}>✓ {selectedNode.verificationTier}-verified</span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(74,33,104,0.08)', color: 'rgba(74,33,104,0.6)', fontSize: 16, cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}
                  aria-label="Close"
                >✕</button>
              </div>

              {/* Node sovereignty strip */}
              {isSovereign ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 7, background: 'rgba(34,120,58,0.07)', border: '1px solid rgba(34,120,58,0.2)', marginBottom: 14, fontSize: 11 }}>
                  <span style={{ fontSize: 14 }}>🔑</span>
                  <span style={{ color: '#1a6b32', fontWeight: 600 }}>You own this node</span>
                  <span style={{ color: 'rgba(34,120,58,0.55)', marginLeft: 2 }}>· full control</span>
                </div>
              ) : isCreator && isUnclaimed ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 7, background: 'rgba(74,33,104,0.05)', border: '1px solid rgba(74,33,104,0.14)', marginBottom: 14, fontSize: 11 }}>
                  <span style={{ fontSize: 14 }}>✍️</span>
                  <span style={{ color: 'var(--ds-plum,#2e1346)', fontWeight: 600 }}>Added by you</span>
                  <span style={{ color: 'rgba(74,33,104,0.45)', marginLeft: 2 }}>· control until claimed</span>
                </div>
              ) : !canControl && isUnclaimed ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 7, background: 'rgba(232,116,34,0.06)', border: '1px solid rgba(232,116,34,0.22)', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--ds-plum,#2e1346)' }}>
                    <span style={{ fontWeight: 600 }}>Unclaimed node</span>
                    <span style={{ color: 'rgba(74,33,104,0.5)', marginLeft: 4 }}>· Is this you?</span>
                  </div>
                  <button
                    onClick={() => navigate(`/node/${selectedNode.id}`)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#e87422', color: '#fff', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >Claim →</button>
                </div>
              ) : !canControl ? (
                <div style={{ padding: '7px 10px', borderRadius: 7, background: 'rgba(74,33,104,0.04)', border: '1px solid rgba(74,33,104,0.1)', marginBottom: 14, fontSize: 11, color: 'rgba(74,33,104,0.5)' }}>
                  🔒 Owned and managed by this person
                </div>
              ) : null}

              {/* Personal label editor */}
              <PersonalLabelEditor
                nodeId={selectedNode.id}
                currentLabel={getLabel(selectedNode.id)}
                onSave={(label) => setLabel(selectedNode.id, label)}
              />

              {/* Smriti upsell */}
              <div style={{ padding: 14, borderRadius: 8, background: 'linear-gradient(135deg, rgba(232,116,34,0.08), rgba(212,154,31,0.06))', border: '1px solid rgba(232,116,34,0.25)', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 22 }}>🎙️</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--ds-serif)', fontSize: 15, color: 'var(--ds-plum,#2e1346)', fontWeight: 600 }}>{selectedNode.name} · No Smriti yet.</div>
                    <div style={{ fontSize: 12, color: 'var(--ds-ink-soft)', marginTop: 4, lineHeight: 1.5 }}>Record their voice — recipes, blessings, stories — for grandkids not yet born.</div>
                    <button onClick={() => navigate('/legacy-box')} className="ds-btn ds-btn-sm" style={{ marginTop: 10, background: 'var(--ds-saffron,#e87422)', color: '#fff', fontWeight: 600 }}>Start recording · ₹9/min →</button>
                  </div>
                </div>
              </div>

              {/* Smriti library */}
              <div style={{ padding: '14px 0', borderBottom: '1px solid var(--ds-border,rgba(74,33,104,0.1))', marginBottom: 14 }}>
                <div className="ds-eyebrow" style={{ color: 'var(--ds-muted)', marginBottom: 10, fontSize: 9 }}>Smriti library</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px 0' }}>
                  <div style={{ fontSize: 22, opacity: 0.4 }}>🎙️</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-muted,#6b6b8a)' }}>Coming Soon</div>
                  <div style={{ fontSize: 11, color: 'rgba(74,33,104,0.4)', textAlign: 'center', lineHeight: 1.5 }}>Recordings will appear here once added.</div>
                </div>
              </div>

              {/* Vital details */}
              <div style={{ padding: '14px 0', borderTop: '1px solid var(--ds-border,rgba(74,33,104,0.1))', borderBottom: '1px solid var(--ds-border,rgba(74,33,104,0.1))', marginBottom: 14 }}>
                <div className="ds-eyebrow" style={{ color: 'var(--ds-muted)', marginBottom: 8, fontSize: 9 }}>Vital details</div>
                {[
                  ['Name', selectedNode.name],
                  ['Relation', selectedNode.relation],
                  selectedNode.dateOfBirth ? ['Date of birth', selectedNode.dateOfBirth] : null,
                  selectedNode.ancestralPlace ? ['Ancestral place', selectedNode.ancestralPlace] : null,
                  selectedNode.currentResidence ? ['Residence', selectedNode.currentResidence] : null,
                ].filter(Boolean).map(([k, v]) => (
                  <div key={k as string} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 6, padding: '5px 0', fontSize: 13 }}>
                    <span style={{ color: 'var(--ds-muted,#6b6b8a)' }}>{k}</span>
                    <span style={{ color: 'var(--ds-text,#1c0d2e)', fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Privacy — only node sovereign or creator can change */}
              {canControl && (
                <div style={{ padding: '12px 0', borderBottom: '1px solid var(--ds-border,rgba(74,33,104,0.1))', marginBottom: 14 }}>
                  <div className="ds-eyebrow" style={{ color: 'var(--ds-muted)', marginBottom: 8, fontSize: 9 }}>Privacy</div>
                  <select className="ds-input w-full" defaultValue="Tree (all generations)">
                    <option>Private (only you)</option>
                    <option>Parents only</option>
                    <option>Grandparents and above</option>
                    <option>Tree (all generations)</option>
                    <option>Public</option>
                  </select>
                </div>
              )}

              {/* Sachet actions */}
              <div style={{ marginBottom: 14 }}>
                <div className="ds-eyebrow" style={{ color: 'var(--ds-muted)', marginBottom: 10, fontSize: 9 }}>Node actions</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {[
                    { icon: '📜', label: 'Generate vanshavali', price: '₹149', path: '/upgrade' },
                    { icon: '🪷', label: 'Log a ceremony', price: '₹19', path: '/margdarshak-kyc' },
                    { icon: '✏️', label: 'Edit member', price: 'free', path: `/node/${selectedNode.id}` },
                  ].map(({ icon, label, price, path }) => (
                    <button
                      key={label}
                      onClick={() => navigate(path)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--ds-border,rgba(74,33,104,0.12))', background: 'var(--ds-ivory,#faf8f2)', cursor: 'pointer', fontSize: 13 }}
                    >
                      <span>{icon} {label}</span>
                      <span className="font-heading" style={{ fontWeight: 700, color: 'var(--ds-gold,#d49a1f)' }}>{price}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 20 }}>
              <div className="ds-eyebrow" style={{ color: 'var(--ds-muted)', marginBottom: 12, fontSize: 9 }}>Tree overview</div>
              <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
                <div className="ds-card" style={{ padding: '14px' }}>
                  <div className="ds-eyebrow" style={{ color: 'var(--ds-muted)', fontSize: 9 }}>Members</div>
                  <div className="font-heading" style={{ fontSize: 22, fontWeight: 700, color: 'var(--ds-text)' }}>{membersUsed} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ds-muted)' }}>/ {plan.maxNodes}</span></div>
                  <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: 'var(--ds-border)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, membersUsed / plan.maxNodes * 100)}%`, height: '100%', background: 'linear-gradient(90deg,var(--ds-plum),var(--ds-gold))' }} />
                  </div>
                </div>
                <div className="ds-card" style={{ padding: '14px' }}>
                  <div className="ds-eyebrow" style={{ color: 'var(--ds-muted)', fontSize: 9 }}>Generations</div>
                  <div className="font-heading" style={{ fontSize: 22, fontWeight: 700, color: 'var(--ds-text)' }}>{generationsUsed} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ds-muted)' }}>/ {plan.generationCap}</span></div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--ds-muted)', textAlign: 'center', padding: '20px 0' }}>
                Tap any member in the tree to see their details and actions here.
              </div>

              {isTreeInitialized && (
                <div style={{ marginTop: 8 }}>
                  <InvitePanel
                    selectedNodeId={selectedNodeId}
                    nodeName={state.nodes.find(n => n.id === selectedNodeId)?.name}
                    treeName={state.treeName}
                  />
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  );
};

export default TreePage;
