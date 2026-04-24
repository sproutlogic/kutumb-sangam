import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import {
  TreeState,
  TreeNode,
  TreeEdge,
  UnionRow,
  SelfIdentityProfile,
  Dispute,
  PendingAction,
  ActivityLogEntry,
  ChangeLogEntry,
  MatrimonyProfile,
  NodePrivacyLevel,
  generateId,
} from '@/engine/types';
import { migrateLegacyVisibility, normalizeNodePrivacy } from '@/engine/privacy';
import { classifyAction, shouldAutoApply } from '@/engine/DecisionEngine';
import {
  handlePersonalEdit,
  handleFactualCorrection,
  handleContestedFact,
  handleManipulation,
  approvePendingAction,
  objectPendingAction,
} from '@/engine/actions';
import { computeTrustScore, computeTreeDepth } from '@/engine/scoring';

const STORAGE_KEY = 'kutumb_tree_state';

const initialState: TreeState = {
  nodes: [],
  edges: [],
  unionRows: [],
  changeLog: [],
  disputes: [],
  pendingActions: [],
  activityLog: [],
  currentUserId: '',
  treeName: '',
  matrimonyProfile: null,
};

type TreeAction =
  | {
      type: 'INIT_TREE';
      payload: {
        selfNode: TreeNode;
        treeName: string;
        familyNodes: TreeNode[];
        edges: TreeEdge[];
        unionRows?: UnionRow[];
      };
    }
  | { type: 'ADD_NODE'; payload: { node: TreeNode; edge: TreeEdge } }
  | { type: 'EDIT_NODE'; payload: Partial<TreeState> }
  | { type: 'MERGE'; payload: Partial<TreeState> }
  | { type: 'LOAD'; payload: TreeState }
  | { type: 'RESET' };

function reducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case 'LOAD':
      return {
        ...action.payload,
        nodes: action.payload.nodes.map(normalizeNodePrivacy),
      };
    case 'RESET':
      return initialState;
    case 'INIT_TREE': {
      const { selfNode, treeName, familyNodes, edges, unionRows: payloadUnions } = action.payload;
      const allNodes = [selfNode, ...familyNodes];
      const logEntries: ChangeLogEntry[] = allNodes.map(n => ({
        id: generateId(),
        nodeId: n.id,
        field: 'created',
        oldValue: '',
        newValue: n.name,
        changedBy: selfNode.id,
        timestamp: Date.now(),
        reason: 'onboarding',
      }));
      const activity: ActivityLogEntry = {
        id: generateId(),
        time: Date.now(),
        textKey: 'activityTreeCreated',
        params: { treeName },
      };
      return {
        ...state,
        nodes: allNodes,
        edges,
        unionRows: Array.isArray(payloadUnions) ? payloadUnions : [],
        changeLog: logEntries,
        activityLog: [activity],
        currentUserId: selfNode.id,
        treeName,
        disputes: [],
        pendingActions: [],
      };
    }
    case 'ADD_NODE': {
      const { node, edge } = action.payload;
      const logEntry: ChangeLogEntry = {
        id: generateId(),
        nodeId: node.id,
        field: 'created',
        oldValue: '',
        newValue: node.name,
        changedBy: state.currentUserId,
        timestamp: Date.now(),
        reason: 'added_member',
      };
      const activity: ActivityLogEntry = {
        id: generateId(),
        time: Date.now(),
        textKey: 'activityAddedMember',
        params: { memberName: node.name, relation: edge.relation },
      };
      return {
        ...state,
        nodes: [...state.nodes, node],
        edges: [...state.edges, edge],
        changeLog: [...state.changeLog, logEntry],
        activityLog: [activity, ...state.activityLog],
      };
    }
    case 'EDIT_NODE':
    case 'MERGE':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

interface TreeContextType {
  state: TreeState;
  initTree: (
    identity: SelfIdentityProfile,
    treeName: string,
    gotra: string,
    fatherName: string,
    motherName: string,
    spouseName: string,
  ) => void;
  addNode: (
    name: string,
    relation: string,
    gender: 'male' | 'female' | 'other',
    anchorOrParentId: string,
    opts?: {
      branch?: string;
      gotra?: string;
      moolNiwas?: string;
      generation?: number;
      /** Spouse link from anchor to new node (local tree only). */
      link?: 'child' | 'spouse';
      givenName?: string;
      surname?: string;
      dateOfBirth?: string;
      ancestralPlace?: string;
      currentResidence?: string;
    },
  ) => void;
  editNode: (nodeId: string, field: string, newValue: string) => { actionType: string; applied: boolean };
  raiseDispute: (nodeId: string, field: string, alternateValue: string) => void;
  resolveDispute: (disputeId: string, chosenVersion: 'a' | 'b') => void;
  approvePending: (actionId: string) => void;
  objectPending: (actionId: string) => void;
  setNodeVisibility: (nodeId: string, visibility: string) => void;
  setNodePrivacy: (nodeId: string, level: NodePrivacyLevel, privacyNodeIds?: string[]) => void;
  pushActivity: (textKey: string, params: Record<string, string>) => void;
  /** Submit a Pandit verification request for a node (creates a pending action). */
  requestVerification: (nodeId: string) => void;
  setMatrimonyProfile: (profile: MatrimonyProfile) => void;
  trustScore: number;
  treeDepth: number;
  isTreeInitialized: boolean;
  resetTree: () => void;
  /** Replace entire tree state (e.g. after loading from the FastAPI vansha API). */
  loadTreeState: (next: TreeState) => void;
  /** Link two existing members as spouses (local tree only; adds spouse edge + union row). */
  linkSpousePair: (anchorId: string, spouseId: string) => { ok: boolean; message?: string };
}

const TreeContext = createContext<TreeContextType | undefined>(undefined);

export const TreeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState, () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const p = JSON.parse(saved) as Partial<TreeState>;
        return {
          ...initialState,
          ...p,
          nodes: Array.isArray(p.nodes) ? p.nodes.map(normalizeNodePrivacy) : initialState.nodes,
          edges: Array.isArray(p.edges) ? p.edges : initialState.edges,
          unionRows: Array.isArray(p.unionRows) ? p.unionRows : [],
          changeLog: Array.isArray(p.changeLog) ? p.changeLog : initialState.changeLog,
          disputes: Array.isArray(p.disputes) ? p.disputes : initialState.disputes,
          pendingActions: Array.isArray(p.pendingActions) ? p.pendingActions : initialState.pendingActions,
          activityLog: Array.isArray(p.activityLog) ? p.activityLog : initialState.activityLog,
        };
      }
    } catch {}
    return initialState;
  });

  // Persist to localStorage
  useEffect(() => {
    if (state.currentUserId) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state]);

  const initTree = useCallback((
    identity: SelfIdentityProfile,
    treeName: string, gotra: string,
    fatherName: string, motherName: string, spouseName: string
  ) => {
    const selfId = generateId();
    const displayName = [identity.givenName, identity.surname].filter(Boolean).join(' ').trim();
    let selfNode: TreeNode = {
      id: selfId,
      name: displayName,
      givenName: identity.givenName,
      surname: identity.surname,
      dateOfBirth: identity.dateOfBirth,
      ancestralPlace: identity.ancestralPlace,
      currentResidence: identity.currentResidence,
      relation: 'self',
      gender: 'male',
      branch: 'main',
      gotra,
      moolNiwas: identity.ancestralPlace,
      ownerId: selfId,
      createdBy: selfId,
      createdAt: Date.now(),
      verificationTier: 'self-declared',
      borderStyle: 'solid',
      status: 'active',
      generation: 0,
      visibility: 'public',
    };

    const familyNodes: TreeNode[] = [];
    const edges: TreeEdge[] = [];
    let unionRowsOut: UnionRow[] = [];

    const hasFather = fatherName.trim().length > 0;
    const hasMother = motherName.trim().length > 0;

    /** Both parents: one marital union + trunk from +; no per-parent edges to children (matches API / Vanshavali). */
    if (hasFather && hasMother) {
      const fId = generateId();
      const mId = generateId();
      const parentalUnionId = generateId();
      familyNodes.push({
        id: fId,
        name: fatherName.trim(),
        relation: 'father',
        gender: 'male',
        branch: 'main',
        gotra,
        moolNiwas: identity.ancestralPlace,
        ownerId: fId,
        createdBy: selfId,
        createdAt: Date.now(),
        verificationTier: 'self-declared',
        borderStyle: 'dotted',
        status: 'active',
        generation: -1,
        visibility: 'public',
      });
      familyNodes.push({
        id: mId,
        name: motherName.trim(),
        relation: 'mother',
        gender: 'female',
        branch: 'main',
        gotra: '',
        moolNiwas: '',
        ownerId: mId,
        createdBy: selfId,
        createdAt: Date.now(),
        verificationTier: 'self-declared',
        borderStyle: 'dotted',
        status: 'active',
        generation: -1,
        visibility: 'public',
      });
      edges.push({ from: fId, to: mId, relation: 'spouse' });
      unionRowsOut.push({
        id: parentalUnionId,
        maleNodeId: fId,
        femaleNodeId: mId,
        relativeGenIndex: -1,
      });
      selfNode = {
        ...selfNode,
        parentUnionId: parentalUnionId,
        fatherNodeId: fId,
        motherNodeId: mId,
      };
    } else {
      if (hasFather) {
        const fId = generateId();
        familyNodes.push({
          id: fId,
          name: fatherName.trim(),
          relation: 'father',
          gender: 'male',
          branch: 'main',
          gotra,
          moolNiwas: identity.ancestralPlace,
          ownerId: fId,
          createdBy: selfId,
          createdAt: Date.now(),
          verificationTier: 'self-declared',
          borderStyle: 'dotted',
          status: 'active',
          generation: -1,
          visibility: 'public',
        });
        edges.push({ from: selfId, to: fId, relation: 'father' });
      }

      if (hasMother) {
        const mId = generateId();
        familyNodes.push({
          id: mId,
          name: motherName.trim(),
          relation: 'mother',
          gender: 'female',
          branch: 'main',
          gotra: '',
          moolNiwas: '',
          ownerId: mId,
          createdBy: selfId,
          createdAt: Date.now(),
          verificationTier: 'self-declared',
          borderStyle: 'dotted',
          status: 'active',
          generation: -1,
          visibility: 'public',
        });
        edges.push({ from: selfId, to: mId, relation: 'mother' });
      }
    }

    if (spouseName.trim()) {
      const sId = generateId();
      const maritalUnionId = generateId();
      familyNodes.push({
        id: sId, name: spouseName, relation: 'spouse', gender: 'female',
        branch: 'main', gotra, moolNiwas: '', ownerId: sId,
        createdBy: selfId, createdAt: Date.now(),
        verificationTier: 'self-declared', borderStyle: 'dotted', status: 'active', generation: 0, visibility: 'public',
      });
      edges.push({ from: selfId, to: sId, relation: 'spouse' });
      unionRowsOut.push({
        id: maritalUnionId,
        maleNodeId: selfId,
        femaleNodeId: sId,
        relativeGenIndex: 0,
      });
    }

    dispatch({
      type: 'INIT_TREE',
      payload: { selfNode, treeName, familyNodes, edges, unionRows: unionRowsOut },
    });
  }, []);

  const addNode = useCallback((
    name: string, relation: string, gender: 'male' | 'female' | 'other',
    anchorOrParentId: string, opts?: { branch?: string; gotra?: string; moolNiwas?: string; generation?: number; link?: 'child' | 'spouse' }
  ) => {
    const nodeId = generateId();
    const anchorNode = state.nodes.find(n => n.id === anchorOrParentId);
    const anchorGen = anchorNode?.generation ?? 0;
    const rel = relation.toLowerCase();
    const isParentRel = ['father', 'mother', 'grandfather', 'grandmother'].includes(rel);
    const isChildRel = ['son', 'daughter', 'adopted son', 'adopted daughter'].includes(rel);
    let generation = opts?.generation;
    if (generation === undefined) {
      if (isParentRel) generation = anchorGen - 1;
      else if (isChildRel) generation = anchorGen + 1;
      else generation = anchorGen;
    }

    let lineageFromAnchor: Partial<TreeNode> = {};
    if (anchorNode && isChildRel) {
      const unions = state.unionRows ?? [];
      /** Prefer a marital union the anchor belongs to (progeny, or child of a couple). */
      const marital = unions.find(
        (u) => u.maleNodeId === anchorNode.id || u.femaleNodeId === anchorNode.id,
      );
      if (marital) {
        lineageFromAnchor = {
          parentUnionId: marital.id,
          fatherNodeId: marital.maleNodeId,
          motherNodeId: marital.femaleNodeId,
        };
      } else if (anchorNode.parentUnionId) {
        /** Sibling-style: same birth union as anchor (anchor is not a spouse in unionRows). */
        lineageFromAnchor = {
          parentUnionId: anchorNode.parentUnionId,
          fatherNodeId: anchorNode.fatherNodeId ?? null,
          motherNodeId: anchorNode.motherNodeId ?? null,
        };
      }
    }

    const node: TreeNode = {
      id: nodeId,
      name,
      givenName: opts?.givenName,
      surname: opts?.surname,
      dateOfBirth: opts?.dateOfBirth,
      ancestralPlace: opts?.ancestralPlace,
      currentResidence: opts?.currentResidence,
      relation,
      gender,
      branch: opts?.branch || 'main',
      gotra: opts?.gotra || '',
      moolNiwas: opts?.moolNiwas || '',
      ownerId: nodeId,
      createdBy: state.currentUserId,
      createdAt: Date.now(),
      verificationTier: 'self-declared',
      borderStyle: 'dotted',
      status: 'active',
      generation,
      visibility: 'public',
      ...lineageFromAnchor,
    };

    let edge: TreeEdge;
    if (opts?.link === 'spouse') {
      edge = { from: anchorOrParentId, to: nodeId, relation: 'spouse' };
    } else {
      edge = { from: anchorOrParentId, to: nodeId, relation };
    }
    dispatch({ type: 'ADD_NODE', payload: { node, edge } });
  }, [state.nodes, state.unionRows, state.currentUserId]);

  const editNodeFn = useCallback((nodeId: string, field: string, newValue: string) => {
    const targetNode = state.nodes.find(n => n.id === nodeId);
    if (!targetNode) return { actionType: 'unknown', applied: false };

    // Count recent changes by this user
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const recentCount = state.changeLog.filter(
      c => c.changedBy === state.currentUserId && c.timestamp > tenMinAgo
    ).length;

    const actionType = classifyAction({
      currentUserId: state.currentUserId,
      targetNode,
      field,
      newValue,
      disputes: state.disputes,
      recentChangeCount: recentCount,
    });

    let updates: Partial<TreeState> = {};

    switch (actionType) {
      case 'personal_edit':
        updates = handlePersonalEdit(state, nodeId, field, newValue);
        break;
      case 'factual_correction':
        updates = handleFactualCorrection(state, nodeId, field, newValue);
        break;
      case 'contested_fact':
        updates = handleContestedFact(state, nodeId, field, newValue);
        break;
      case 'manipulation':
        updates = handleManipulation(state, nodeId, field, newValue);
        break;
      default:
        updates = handlePersonalEdit(state, nodeId, field, newValue);
    }

    dispatch({ type: 'MERGE', payload: updates });
    return { actionType, applied: shouldAutoApply(actionType) };
  }, [state]);

  const raiseDisputeFn = useCallback((nodeId: string, field: string, alternateValue: string) => {
    const updates = handleContestedFact(state, nodeId, field, alternateValue);
    dispatch({ type: 'MERGE', payload: updates });
  }, [state]);

  const resolveDisputeFn = useCallback((disputeId: string, chosenVersion: 'a' | 'b') => {
    const dispute = state.disputes.find(d => d.id === disputeId);
    if (!dispute) return;

    const chosenValue = chosenVersion === 'a' ? dispute.versionA : dispute.versionB;
    const updatedNodes = state.nodes.map(n =>
      n.id === dispute.nodeId ? { ...n, [dispute.field]: chosenValue, status: 'active' as const } : n
    );
    const updatedDisputes = state.disputes.map(d =>
      d.id === disputeId ? { ...d, status: 'resolved' as const } : d
    );

    const activity: ActivityLogEntry = {
      id: generateId(),
      time: Date.now(),
      textKey: 'activityDisputeResolved',
      params: { field: dispute.field },
    };

    dispatch({
      type: 'MERGE',
      payload: {
        nodes: updatedNodes,
        disputes: updatedDisputes,
        activityLog: [activity, ...state.activityLog],
      },
    });
  }, [state]);

  const approvePendingFn = useCallback((actionId: string) => {
    const updates = approvePendingAction(state, actionId);
    dispatch({ type: 'MERGE', payload: updates });
  }, [state]);

  const objectPendingFn = useCallback((actionId: string) => {
    const updates = objectPendingAction(state, actionId);
    dispatch({ type: 'MERGE', payload: updates });
  }, [state]);

  const resetTree = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    dispatch({ type: 'RESET' });
  }, []);

  const loadTreeState = useCallback((next: TreeState) => {
    dispatch({
      type: 'LOAD',
      payload: {
        ...next,
        nodes: next.nodes.map(normalizeNodePrivacy),
      },
    });
  }, []);

  const linkSpousePair = useCallback(
    (anchorId: string, spouseId: string): { ok: boolean; message?: string } => {
      if (anchorId === spouseId) return { ok: false, message: "Choose two different people." };
      const a = state.nodes.find((n) => n.id === anchorId);
      const b = state.nodes.find((n) => n.id === spouseId);
      if (!a || !b) return { ok: false, message: "Member not found in this tree." };
      const ga = a.gender;
      const gb = b.gender;
      if ((ga !== "male" || gb !== "female") && (ga !== "female" || gb !== "male")) {
        return {
          ok: false,
          message: "Marriage link requires one male and one female (set gender on both profiles).",
        };
      }
      const maleId = ga === "male" ? a.id : b.id;
      const femaleId = ga === "male" ? b.id : a.id;
      const hasSpouseEdge = state.edges.some(
        (e) =>
          (e.relation === "spouse" || e.relation.toLowerCase() === "spouse") &&
          ((e.from === maleId && e.to === femaleId) || (e.from === femaleId && e.to === maleId)),
      );
      if (hasSpouseEdge) return { ok: true };

      const unionId = generateId();
      const gen = a.generation;
      const edge: TreeEdge = { from: maleId, to: femaleId, relation: "spouse" };
      const unionRow: UnionRow = {
        id: unionId,
        maleNodeId: maleId,
        femaleNodeId: femaleId,
        relativeGenIndex: gen,
      };
      const activity: ActivityLogEntry = {
        id: generateId(),
        time: Date.now(),
        textKey: "activityLinkedSpouses",
        params: { a: a.name, b: b.name },
      };
      dispatch({
        type: "MERGE",
        payload: {
          edges: [...state.edges, edge],
          unionRows: [...(state.unionRows ?? []), unionRow],
          activityLog: [activity, ...state.activityLog],
        },
      });
      return { ok: true };
    },
    [state.nodes, state.edges, state.unionRows, state.activityLog],
  );

  const pushActivity = useCallback((textKey: string, params: Record<string, string>) => {
    const entry: ActivityLogEntry = {
      id: generateId(),
      time: Date.now(),
      textKey,
      params,
    };
    dispatch({ type: 'MERGE', payload: { activityLog: [entry, ...state.activityLog] } });
  }, [state.activityLog]);

  const setNodePrivacy = useCallback(
    (nodeId: string, level: NodePrivacyLevel, privacyNodeIds?: string[]) => {
      const updatedNodes = state.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              visibility: level,
              privacyNodeIds:
                level === 'custom_five_nodes' ? (privacyNodeIds ?? n.privacyNodeIds)?.slice(0, 5) : undefined,
            }
          : n,
      );
      const activity: ActivityLogEntry = {
        id: generateId(),
        time: Date.now(),
        textKey: 'activityVisibilityChanged',
        params: { visibility: level },
      };
      dispatch({
        type: 'MERGE',
        payload: { nodes: updatedNodes, activityLog: [activity, ...state.activityLog] },
      });
    },
    [state.nodes, state.activityLog],
  );

  const setNodeVisibility = useCallback(
    (nodeId: string, visibility: string) => {
      setNodePrivacy(nodeId, migrateLegacyVisibility(visibility));
    },
    [setNodePrivacy],
  );

  const requestVerification = useCallback((nodeId: string) => {
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Prevent duplicate pending requests
    const alreadyPending = state.pendingActions.some(
      a => a.nodeId === nodeId && a.type === 'verify-request' && a.status === 'pending'
    );
    if (alreadyPending) return;

    const pending: PendingAction = {
      id: generateId(),
      type: 'verify-request',
      nodeId,
      field: 'verificationTier',
      proposedValue: 'expert-verified',
      oldValue: node.verificationTier ?? 'self-declared',
      submittedBy: state.currentUserId,
      approvals: [],
      objections: [],
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      status: 'pending',
    };

    const activity: ActivityLogEntry = {
      id: generateId(),
      time: Date.now(),
      textKey: 'activityVerificationRequested',
      params: { nodeName: node.name },
    };

    dispatch({
      type: 'MERGE',
      payload: {
        pendingActions: [...state.pendingActions, pending],
        activityLog: [activity, ...state.activityLog],
      },
    });
  }, [state]);

  const setMatrimonyProfile = useCallback((profile: MatrimonyProfile) => {
    dispatch({ type: 'MERGE', payload: { matrimonyProfile: profile } });
  }, []);

  const trustScore = computeTrustScore(state.nodes);
  const treeDepth = computeTreeDepth(state.nodes);

  const value: TreeContextType = {
    state,
    initTree,
    addNode,
    editNode: editNodeFn,
    raiseDispute: raiseDisputeFn,
    resolveDispute: resolveDisputeFn,
    approvePending: approvePendingFn,
    objectPending: objectPendingFn,
    setNodeVisibility,
    setNodePrivacy,
    pushActivity,
    requestVerification,
    setMatrimonyProfile,
    trustScore,
    treeDepth,
    isTreeInitialized: state.nodes.length > 0,
    resetTree,
    loadTreeState,
    linkSpousePair,
  };

  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>;
};

export const useTree = () => {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error('useTree must be used within TreeProvider');
  return ctx;
};
