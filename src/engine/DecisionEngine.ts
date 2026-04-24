import { ActionType, TreeNode, Dispute } from './types';

interface ClassifyInput {
  currentUserId: string;
  targetNode: TreeNode;
  field: string;
  newValue: string;
  disputes: Dispute[];
  recentChangeCount?: number; // changes by this user in last 10 minutes
}

/**
 * Core Decision Engine classifier.
 * Routes every user action through the correct sovereignty model.
 *
 * Priority order:
 * 1. Manipulation detection (rapid changes / overwriting verified data)
 * 2. Contested fact (existing dispute on this field)
 * 3. Personal edit (you own the node)
 * 4. Factual correction (ancestral / someone else's node)
 * 5. Missing member (adding a new claim)
 */
export function classifyAction(input: ClassifyInput): ActionType {
  const { currentUserId, targetNode, field, disputes, recentChangeCount = 0 } = input;

  // 1. Manipulation detection
  if (recentChangeCount >= 5) {
    return 'manipulation';
  }
  if (
    targetNode.verificationTier === 'expert-verified' &&
    targetNode.ownerId !== currentUserId
  ) {
    return 'manipulation';
  }

  // 2. Check for existing dispute on this field
  const existingDispute = disputes.find(
    d => d.nodeId === targetNode.id && d.field === field && d.status === 'active'
  );
  if (existingDispute) {
    return 'contested_fact';
  }

  // 3. Sovereign: you own this node
  if (targetNode.ownerId === currentUserId) {
    return 'personal_edit';
  }

  // 4. Factual correction on someone else's node
  return 'factual_correction';
}

/**
 * Determines if an action should be applied immediately or go through review.
 */
export function shouldAutoApply(actionType: ActionType): boolean {
  return actionType === 'personal_edit';
}
