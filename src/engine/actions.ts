import {
  TreeState,
  TreeNode,
  ChangeLogEntry,
  Dispute,
  PendingAction,
  ActivityLogEntry,
  ActionType,
  generateId,
} from './types';

export function handlePersonalEdit(
  state: TreeState,
  nodeId: string,
  field: string,
  newValue: string
): Partial<TreeState> {
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node) return {};

  const oldValue = (node as any)[field] || '';
  const updatedNodes = state.nodes.map(n =>
    n.id === nodeId ? { ...n, [field]: newValue } : n
  );

  const logEntry: ChangeLogEntry = {
    id: generateId(),
    nodeId,
    field,
    oldValue,
    newValue,
    changedBy: state.currentUserId,
    timestamp: Date.now(),
    reason: 'personal_edit',
  };

  const activity: ActivityLogEntry = {
    id: generateId(),
    time: Date.now(),
    textKey: 'activityEditedField',
    params: { field, nodeName: node.name, newValue },
  };

  return {
    nodes: updatedNodes,
    changeLog: [...state.changeLog, logEntry],
    activityLog: [activity, ...state.activityLog],
  };
}

export function handleFactualCorrection(
  state: TreeState,
  nodeId: string,
  field: string,
  proposedValue: string
): Partial<TreeState> {
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node) return {};

  const oldValue = (node as any)[field] || '';

  const pending: PendingAction = {
    id: generateId(),
    type: 'factual_correction',
    nodeId,
    field,
    proposedValue,
    oldValue,
    submittedBy: state.currentUserId,
    approvals: [],
    objections: [],
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    status: 'pending',
  };

  const activity: ActivityLogEntry = {
    id: generateId(),
    time: Date.now(),
    textKey: 'activitySubmittedCorrection',
    params: { field, nodeName: node.name },
  };

  return {
    pendingActions: [...state.pendingActions, pending],
    activityLog: [activity, ...state.activityLog],
  };
}

export function handleContestedFact(
  state: TreeState,
  nodeId: string,
  field: string,
  alternateValue: string
): Partial<TreeState> {
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node) return {};

  const currentValue = (node as any)[field] || '';

  // Check if dispute already exists
  const existing = state.disputes.find(
    d => d.nodeId === nodeId && d.field === field && d.status === 'active'
  );
  if (existing) {
    // Update versionB
    const updatedDisputes = state.disputes.map(d =>
      d.id === existing.id ? { ...d, versionB: alternateValue } : d
    );
    return { disputes: updatedDisputes };
  }

  const dispute: Dispute = {
    id: generateId(),
    nodeId,
    field,
    versionA: currentValue,
    versionB: alternateValue,
    raisedBy: state.currentUserId,
    status: 'active',
    evidence: [],
    createdAt: Date.now(),
  };

  // Freeze the node field
  const updatedNodes = state.nodes.map(n =>
    n.id === nodeId ? { ...n, status: 'frozen' as const } : n
  );

  const activity: ActivityLogEntry = {
    id: generateId(),
    time: Date.now(),
    textKey: 'activityDisputeRaised',
    params: { field, nodeName: node.name },
  };

  return {
    nodes: updatedNodes,
    disputes: [...state.disputes, dispute],
    activityLog: [activity, ...state.activityLog],
  };
}

export function handleMissingMember(
  state: TreeState,
  newNode: Omit<TreeNode, 'id' | 'createdAt' | 'createdBy' | 'verificationTier' | 'borderStyle' | 'status'>,
  parentNodeId: string,
  edgeRelation: string
): Partial<TreeState> {
  const node: TreeNode = {
    ...newNode,
    id: generateId(),
    createdAt: Date.now(),
    createdBy: state.currentUserId,
    verificationTier: 'self-declared',
    borderStyle: newNode.ownerId === state.currentUserId ? 'solid' : 'dotted',
    status: 'active',
  };

  const edge = {
    from: parentNodeId,
    to: node.id,
    relation: edgeRelation,
  };

  const logEntry: ChangeLogEntry = {
    id: generateId(),
    nodeId: node.id,
    field: 'created',
    oldValue: '',
    newValue: node.name,
    changedBy: state.currentUserId,
    timestamp: Date.now(),
    reason: 'missing_member',
  };

  const activity: ActivityLogEntry = {
    id: generateId(),
    time: Date.now(),
    textKey: 'activityAddedMember',
    params: { memberName: node.name, relation: edgeRelation },
  };

  return {
    nodes: [...state.nodes, node],
    edges: [...state.edges, edge],
    changeLog: [...state.changeLog, logEntry],
    activityLog: [activity, ...state.activityLog],
  };
}

export function handleManipulation(
  state: TreeState,
  nodeId: string,
  field: string,
  attemptedValue: string
): Partial<TreeState> {
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node) return {};

  // Freeze the node, auto-revert (don't apply)
  const updatedNodes = state.nodes.map(n =>
    n.id === nodeId ? { ...n, status: 'frozen' as const } : n
  );

  const currentValue = (node as any)[field] || '';

  // Create fork
  const dispute: Dispute = {
    id: generateId(),
    nodeId,
    field,
    versionA: currentValue,
    versionB: attemptedValue,
    raisedBy: 'system',
    status: 'active',
    evidence: ['Auto-flagged: suspicious activity detected'],
    createdAt: Date.now(),
  };

  const activity: ActivityLogEntry = {
    id: generateId(),
    time: Date.now(),
    textKey: 'activityManipulationBlocked',
    params: { field, nodeName: node.name },
  };

  return {
    nodes: updatedNodes,
    disputes: [...state.disputes, dispute],
    activityLog: [activity, ...state.activityLog],
  };
}

export function approvePendingAction(
  state: TreeState,
  actionId: string
): Partial<TreeState> {
  const action = state.pendingActions.find(a => a.id === actionId);
  if (!action || action.status !== 'pending') return {};

  // For verify-request: promote verificationTier to expert-verified
  const applyValue =
    action.type === 'verify-request' ? 'expert-verified' : action.proposedValue;

  // Apply the change
  const updatedNodes = state.nodes.map(n =>
    n.id === action.nodeId ? { ...n, [action.field]: applyValue } : n
  );

  const updatedActions = state.pendingActions.map(a =>
    a.id === actionId ? { ...a, status: 'approved' as const } : a
  );

  const logEntry: ChangeLogEntry = {
    id: generateId(),
    nodeId: action.nodeId,
    field: action.field,
    oldValue: action.oldValue,
    newValue: applyValue,
    changedBy: action.submittedBy,
    timestamp: Date.now(),
    reason: action.type === 'verify-request' ? 'pandit_verified' : 'factual_correction_approved',
  };

  const activity: ActivityLogEntry = {
    id: generateId(),
    time: Date.now(),
    textKey: action.type === 'verify-request' ? 'activityVerificationApproved' : 'activityCorrectionApproved',
    params: { field: action.field },
  };

  return {
    nodes: updatedNodes,
    pendingActions: updatedActions,
    changeLog: [...state.changeLog, logEntry],
    activityLog: [activity, ...state.activityLog],
  };
}

export function objectPendingAction(
  state: TreeState,
  actionId: string
): Partial<TreeState> {
  const action = state.pendingActions.find(a => a.id === actionId);
  if (!action || action.status !== 'pending') return {};

  // Create a fork
  const dispute: Dispute = {
    id: generateId(),
    nodeId: action.nodeId,
    field: action.field,
    versionA: action.oldValue,
    versionB: action.proposedValue,
    raisedBy: state.currentUserId,
    status: 'active',
    evidence: [],
    createdAt: Date.now(),
  };

  const updatedActions = state.pendingActions.map(a =>
    a.id === actionId ? { ...a, status: 'forked' as const } : a
  );

  const activity: ActivityLogEntry = {
    id: generateId(),
    time: Date.now(),
    textKey: 'activityCorrectionObjected',
    params: { field: action.field },
  };

  return {
    pendingActions: updatedActions,
    disputes: [...state.disputes, dispute],
    activityLog: [activity, ...state.activityLog],
  };
}
