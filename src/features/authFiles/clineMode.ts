/**
 * Cline credentials share one endpoint for both billing modes; the mode only decides which
 * models the credential offers (ClinePass models are prefixed with `cline-pass/`).
 */
export const CLINE_MODES = ['billing', 'pass', 'all'] as const;
export type ClineMode = (typeof CLINE_MODES)[number];

/** Mode used by the server when the credential file has no `cline_mode` field. */
export const DEFAULT_CLINE_MODE: ClineMode = 'billing';

const isClineMode = (value: unknown): value is ClineMode =>
  typeof value === 'string' && (CLINE_MODES as readonly string[]).includes(value);

/**
 * Reads the mode from a credential file. An absent field is the default mode; an
 * unrecognised value is shown as the default too because the server falls back to it.
 */
export const readClineMode = (json: Record<string, unknown>): ClineMode => {
  const raw = json.cline_mode;
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
  return isClineMode(value) ? value : DEFAULT_CLINE_MODE;
};

export const applyClineMode = (
  json: Record<string, unknown>,
  mode: ClineMode
): Record<string, unknown> => {
  const next = { ...json };
  if (mode === DEFAULT_CLINE_MODE) {
    delete next.cline_mode;
  } else {
    next.cline_mode = mode;
  }
  return next;
};
