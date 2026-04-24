import type { PlanId } from '@/config/packages.config';

function parseBool(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/**
 * Temporary beta toggle:
 * - true => every user gets full access (default plan + entitlements)
 * - false => normal package gating
 */
export const BETA_ALL_ACCESS = parseBool(import.meta.env.VITE_BETA_ALL_ACCESS, false);

/** Plan used for new sessions in beta mode. */
export const BETA_DEFAULT_PLAN: PlanId = 'vansh';
