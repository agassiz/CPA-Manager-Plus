import { DEFAULT_API_PORT, MANAGEMENT_API_PREFIX } from './constants';

export const DEFAULT_DOCKER_CPA_BASE_URL = 'http://host.docker.internal:8317';
export const DEFAULT_LOCAL_CPA_BASE_URL = 'http://127.0.0.1:8317';

export const normalizeApiBase = (input: string): string => {
  let base = (input || '').trim();
  if (!base) return '';
  base = base.replace(/\/?v[08]\/management\/?$/i, '');
  base = base.replace(/\/+$/i, '');
  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`;
  }
  return base;
};

export const computeApiUrl = (base: string): string => {
  const normalized = normalizeApiBase(base);
  if (!normalized) return '';
  return `${normalized}${MANAGEMENT_API_PREFIX}`;
};

export const resolveRuntimeApiBase = (
  apiBase: string,
  locationLike?: Pick<Location, 'protocol' | 'hostname' | 'port'>
): string => {
  const normalized = normalizeApiBase(apiBase);
  if (!normalized) return normalized;

  try {
    const locationValue = locationLike ?? window.location;
    const locationPort = locationValue.port || '';
    if (!isLocalhost(locationValue.hostname) || !locationPort) return normalized;
    if (locationPort === String(DEFAULT_API_PORT)) return normalized;

    const currentOrigin = normalizeApiBase(
      `${locationValue.protocol}//${locationValue.hostname}:${locationPort}`
    );
    if (normalized === currentOrigin) {
      return normalizeApiBase(DEFAULT_LOCAL_CPA_BASE_URL);
    }
  } catch {
    return normalized;
  }

  return normalized;
};

const readEnvDefaultCPAConnectionBase = (): string => {
  try {
    return import.meta.env.VITE_DEFAULT_CPA_BASE_URL || '';
  } catch {
    return '';
  }
};

export const resolveDefaultCPAConnectionBase = (options?: {
  hostedByUsageService?: boolean;
  currentBase?: string;
  envDefault?: string;
}): string => {
  const envDefault = normalizeApiBase(
    options?.envDefault === undefined ? readEnvDefaultCPAConnectionBase() : options.envDefault
  );
  if (envDefault) return envDefault;

  if (options?.hostedByUsageService) {
    return DEFAULT_DOCKER_CPA_BASE_URL;
  }

  return normalizeApiBase(options?.currentBase || '');
};

export const detectApiBaseFromLocation = (): string => {
  try {
    const { protocol, hostname, port } = window.location;
    if (isLocalhost(hostname) && port && port !== String(DEFAULT_API_PORT)) {
      return normalizeApiBase(DEFAULT_LOCAL_CPA_BASE_URL);
    }
    const normalizedPort = port ? `:${port}` : '';
    return normalizeApiBase(`${protocol}//${hostname}${normalizedPort}`);
  } catch (error) {
    console.warn('Failed to detect api base from location, fallback to default', error);
    return normalizeApiBase(DEFAULT_LOCAL_CPA_BASE_URL);
  }
};

export const isLocalhost = (hostname: string): boolean => {
  const value = (hostname || '').toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '[::1]';
};
