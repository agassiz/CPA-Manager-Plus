export const THINKING_REASONING_LEVELS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export interface ThinkingLevelMappingRow {
  from: string;
  to: string;
}

export interface ParsedThinkingConfig {
  config: Record<string, unknown>;
  rows: ThinkingLevelMappingRow[];
  error: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeLevel = (value: string): string => value.trim().toLowerCase();

export const parseThinkingConfig = (value: string | undefined): ParsedThinkingConfig => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return { config: {}, rows: [], error: null };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) {
      return { config: {}, rows: [], error: 'Thinking config must be a JSON object' };
    }
    const mapping = parsed.level_mapping;
    const rows = isRecord(mapping)
      ? Object.entries(mapping)
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
          .map(([from, to]) => ({ from, to }))
      : [];
    return { config: parsed, rows, error: null };
  } catch {
    return { config: {}, rows: [], error: 'Thinking config must be valid JSON' };
  }
};

export const hasDuplicateMappingSources = (rows: ThinkingLevelMappingRow[]): boolean => {
  const sources = new Set<string>();
  return rows.some((row) => {
    const from = normalizeLevel(row.from);
    if (!from) return false;
    if (sources.has(from)) return true;
    sources.add(from);
    return false;
  });
};

export const serializeThinkingLevelMapping = (
  config: Record<string, unknown>,
  rows: ThinkingLevelMappingRow[]
): string => {
  const mapping: Record<string, string> = {};
  rows.forEach((row) => {
    const from = normalizeLevel(row.from);
    const to = normalizeLevel(row.to);
    if (from && to) mapping[from] = to;
  });

  const next = { ...config };
  if (Object.keys(mapping).length) {
    next.level_mapping = mapping;
  } else {
    delete next.level_mapping;
  }
  return Object.keys(next).length ? JSON.stringify(next, null, 2) : '';
};
