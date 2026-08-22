import { useEffect, useMemo, useState } from 'react';
import { usageServiceApi } from '@/services/api/usageService';
import { useAuthStore } from '@/stores';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';

export type PanelFeatureUnavailableReason =
  | 'checking'
  | 'service_not_configured'
  | 'service_unavailable'
  | 'monitoring_disabled';

export interface PanelFeatureAvailability {
  checking: boolean;
  panelBase: string;
  serviceBase: string;
  serviceAvailable: boolean;
  requestMonitoringAvailable: boolean;
  modelPricesAvailable: boolean;
  reason: PanelFeatureUnavailableReason | '';
}

export function buildNativeRequestMonitoringAvailability({
  apiBase,
  panelBase,
  checking = false,
}: {
  apiBase: string;
  panelBase: string;
  checking?: boolean;
}): PanelFeatureAvailability {
  const serviceBase = normalizeApiBase(apiBase);
  return {
    checking,
    panelBase: normalizeApiBase(panelBase),
    serviceBase,
    serviceAvailable: Boolean(serviceBase),
    requestMonitoringAvailable: true,
    modelPricesAvailable: true,
    reason: '',
  };
}

export function buildUnavailableAvailability({
  apiBase,
  panelBase,
  checking = false,
  reason,
}: {
  apiBase: string;
  panelBase: string;
  checking?: boolean;
  reason: PanelFeatureUnavailableReason;
}): PanelFeatureAvailability {
  return {
    checking,
    panelBase: normalizeApiBase(panelBase),
    serviceBase: normalizeApiBase(apiBase),
    serviceAvailable: false,
    requestMonitoringAvailable: false,
    modelPricesAvailable: false,
    reason,
  };
}

type PanelFeatureAvailabilityRequestInput = {
  apiBase: string;
  managementKey: string;
  panelBase: string;
};

type PanelFeatureAvailabilityRequest = {
  key: string;
  promise: Promise<PanelFeatureAvailability>;
};

const initialAvailability: PanelFeatureAvailability = {
  checking: true,
  panelBase: '',
  serviceBase: '',
  serviceAvailable: false,
  requestMonitoringAvailable: false,
  modelPricesAvailable: false,
  reason: 'checking',
};

let cachedAvailabilityKey = '';
let cachedAvailability: PanelFeatureAvailability | null = null;
let cachedAvailabilityExpiresAtMs = 0;
let inFlightAvailabilityRequest: PanelFeatureAvailabilityRequest | null = null;
let latestAvailabilityRequestKey = '';

// 能力探测失败时只做短期缓存，避免一次瞬时故障长期隐藏监控入口。
const TRANSIENT_AVAILABILITY_TTL_MS = 15 * 1000;
const PROBE_RETRY_DELAYS_MS = [300, 900];

const readCachedAvailability = (key: string): PanelFeatureAvailability | null => {
  if (cachedAvailabilityKey !== key || !cachedAvailability) return null;
  if (cachedAvailabilityExpiresAtMs <= Date.now()) return null;
  return cachedAvailability;
};

const readProbeErrorStatus = (error: unknown): number | undefined => {
  if (error === null || typeof error !== 'object') return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
};

type ProbeFailureKind = 'capability_missing' | 'auth' | 'transient';

// 只有服务端确实缺少该管理端点才算能力缺失。鉴权失败不重试（服务端会按失败次数封禁 IP），
// 超时、限流和 5xx 视为瞬时故障可以重试。
const classifyProbeFailure = (error: unknown): ProbeFailureKind => {
  const status = readProbeErrorStatus(error);
  if (status === 404 || status === 405 || status === 501) return 'capability_missing';
  if (status === 401 || status === 403) return 'auth';
  return 'transient';
};

const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

type PanelFeatureAvailabilityProbeResult = {
  availability: PanelFeatureAvailability;
  cacheable: boolean;
};

const buildAvailabilityRequestKey = ({
  apiBase,
  managementKey,
  panelBase,
}: PanelFeatureAvailabilityRequestInput): string =>
  [normalizeApiBase(panelBase), normalizeApiBase(apiBase), managementKey].join('\u001f');

export async function detectPanelFeatureAvailability(
  { apiBase, managementKey, panelBase }: PanelFeatureAvailabilityRequestInput,
  retryDelaysMs: number[] = PROBE_RETRY_DELAYS_MS
): Promise<PanelFeatureAvailabilityProbeResult> {
  const normalizedApiBase = normalizeApiBase(apiBase);
  const normalizedPanelBase = normalizeApiBase(panelBase);
  if (!managementKey || !normalizedApiBase) {
    return {
      availability: buildUnavailableAvailability({
        apiBase: normalizedApiBase,
        panelBase: normalizedPanelBase,
        reason: 'service_not_configured',
      }),
      cacheable: true,
    };
  }

  for (let attempt = 0; ; attempt += 1) {
    try {
      await usageServiceApi.getUsage(normalizedApiBase, managementKey);
      return {
        availability: buildNativeRequestMonitoringAvailability({
          apiBase: normalizedApiBase,
          panelBase: normalizedPanelBase,
        }),
        cacheable: true,
      };
    } catch (error) {
      const failureKind = classifyProbeFailure(error);
      if (failureKind === 'capability_missing') {
        return {
          availability: buildUnavailableAvailability({
            apiBase: normalizedApiBase,
            panelBase: normalizedPanelBase,
            reason: 'service_unavailable',
          }),
          cacheable: true,
        };
      }
      if (failureKind === 'auth' || attempt >= retryDelaysMs.length) {
        // 瞬时故障不隐藏入口：页面自身会展示错误，探测结果稍后重试。
        return {
          availability: buildNativeRequestMonitoringAvailability({
            apiBase: normalizedApiBase,
            panelBase: normalizedPanelBase,
          }),
          cacheable: false,
        };
      }
      await waitMs(retryDelaysMs[attempt]);
    }
  }
}

function requestPanelFeatureAvailability(
  input: PanelFeatureAvailabilityRequestInput
): { key: string; promise: Promise<PanelFeatureAvailability> } {
  const key = buildAvailabilityRequestKey(input);
  const cached = readCachedAvailability(key);
  if (cached) {
    return { key, promise: Promise.resolve(cached) };
  }
  if (inFlightAvailabilityRequest?.key === key) {
    return inFlightAvailabilityRequest;
  }

  latestAvailabilityRequestKey = key;
  const promise = detectPanelFeatureAvailability(input).then(({ availability, cacheable }) => {
    if (latestAvailabilityRequestKey === key) {
      cachedAvailabilityKey = key;
      cachedAvailability = availability;
      cachedAvailabilityExpiresAtMs = cacheable
        ? Number.POSITIVE_INFINITY
        : Date.now() + TRANSIENT_AVAILABILITY_TTL_MS;
    }
    return availability;
  });
  inFlightAvailabilityRequest = { key, promise };
  promise.finally(() => {
    if (inFlightAvailabilityRequest?.key === key) {
      inFlightAvailabilityRequest = null;
    }
  });
  return inFlightAvailabilityRequest;
}

export function usePanelFeatureAvailability(): PanelFeatureAvailability {
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const panelBase = useMemo(() => detectApiBaseFromLocation(), []);
  const requestInput = useMemo(
    () => ({
      apiBase,
      managementKey,
      panelBase,
    }),
    [apiBase, managementKey, panelBase]
  );
  const requestKey = useMemo(() => buildAvailabilityRequestKey(requestInput), [requestInput]);
  const [state, setState] = useState<PanelFeatureAvailability>(
    () => readCachedAvailability(requestKey) ?? initialAvailability
  );

  useEffect(() => {
    let cancelled = false;
    const hasCachedAvailability = readCachedAvailability(requestKey) !== null;
    if (!hasCachedAvailability) {
      queueMicrotask(() => {
        if (cancelled) return;
        setState((current) => ({
          ...current,
          checking: true,
          panelBase: normalizeApiBase(panelBase),
          serviceBase: normalizeApiBase(apiBase),
          reason: 'checking',
        }));
      });
    }

    const request = requestPanelFeatureAvailability(requestInput);
    request.promise.then((availability) => {
      if (cancelled || request.key !== requestKey) return;
      setState(availability);
    });

    return () => {
      cancelled = true;
    };
  }, [apiBase, panelBase, requestInput, requestKey]);

  return state;
}
