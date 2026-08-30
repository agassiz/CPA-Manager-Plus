import type { SecurityAuditConfig, SecurityAuditEngine } from '@/services/api/securityAudit';

/**
 * hydrateEngineBlocks seeds a block the operator has never configured from the
 * backend's own engine defaults. The backend normalizes only the selected block,
 * so the other one arrives with zero values; seeding happens once when the
 * configuration is loaded, never while browsing between engine forms. Enabled
 * flags are left untouched.
 */
export function hydrateEngineBlocks(config: SecurityAuditConfig): SecurityAuditConfig {
  const defaults = config['engine-defaults'];
  if (!defaults) return config;
  const next = { ...config };
  if (next.guard.model.trim() === '') {
    next.guard = { ...defaults.guard, enabled: next.guard.enabled };
  }
  if (next.moderations.model.trim() === '') {
    next.moderations = { ...defaults.moderations, enabled: next.moderations.enabled };
  }
  return next;
}

/**
 * setEngineEnabled applies the single-active-engine rule. Enabling one audit
 * model disables the other and makes it the selected engine; disabling one only
 * clears its own flag, which leaves the audit running on regex rules alone.
 * Every other setting of both blocks is preserved.
 */
export function setEngineEnabled(
  config: SecurityAuditConfig,
  engine: SecurityAuditEngine,
  enabled: boolean
): SecurityAuditConfig {
  if (!enabled) {
    return engine === 'openai_moderations'
      ? { ...config, moderations: { ...config.moderations, enabled: false } }
      : { ...config, guard: { ...config.guard, enabled: false } };
  }
  if (engine === 'openai_moderations') {
    return {
      ...config,
      engine,
      guard: { ...config.guard, enabled: false },
      moderations: { ...config.moderations, enabled: true },
    };
  }
  return {
    ...config,
    engine,
    guard: { ...config.guard, enabled: true },
    moderations: { ...config.moderations, enabled: false },
  };
}
