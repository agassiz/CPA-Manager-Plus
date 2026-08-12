import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MonitoringAnalyticsEventRow } from '@/services/api/usageService';
import type { AuthFileItem } from '@/types/authFile';
import type { CredentialInfo } from '@/types/sourceInfo';
import { buildSourceInfoMap } from '@/utils/sourceResolver';
import { collectUsageDetailsWithEndpoint, normalizeAuthIndex } from '@/utils/usage';
import { readString } from '../model/base';
import { buildApiKeyDisplayMap } from '../model/apiKeys';
import { buildMonitoringAuthMetaMap } from '../model/authMeta';
import { getRangeBounds, shouldUseHourlyTimeline } from '../model/range';
import {
  buildChannelRows,
  buildFailureRows,
  buildFailureSourceRows,
  buildHourlyDistribution,
  buildModelRows,
  buildModelShareRows,
  buildStatusChips,
  buildTaskBuckets,
  buildTimeline,
} from '../model/chartBuilders';
import {
  buildAnalyticsFilters,
  buildAccountRowsFromAnalytics,
  buildApiKeyRowsFromAnalytics,
  buildChannelRowsFromAnalytics,
  buildFailureRowsFromAnalytics,
  buildFailureSourceRowsFromAnalytics,
  buildFilterOptionsFromAnalytics,
  buildHourlyDistributionFromAnalytics,
  buildModelRowsFromAnalytics,
  buildModelShareRowsFromAnalytics,
  buildSummaryFromAnalytics,
  buildTaskBucketsFromAnalytics,
  buildTimelineFromAnalytics,
  buildUsageDetailsFromAnalyticsEvents,
} from '../model/analyticsAdapters';
import { buildEventRows } from '../model/eventRows';
import {
  buildAccountRows,
  buildApiKeyRows,
  buildMonitoringSummary,
  buildRangeFilteredRows,
  buildScopeFilteredRows,
  shouldIncludeInStats,
} from '../model/rowBuilders';
import type {
  MonitoringAuthMeta,
  MonitoringChannelMeta,
  MonitoringFilterOptions,
  MonitoringMetadata,
  UseMonitoringDataParams,
  UseMonitoringDataReturn,
} from '../model/types';
import { loadMonitoringMetaPayload } from '../services/monitoringMetaService';
import { useMonitoringAnalytics } from './useMonitoringAnalytics';

export type {
  MonitoringAccountModelSpendRow,
  MonitoringAccountRow,
  MonitoringApiKeyModelSpendRow,
  MonitoringApiKeyRow,
  MonitoringChannelMeta,
  MonitoringChannelRow,
  MonitoringCustomTimeRange,
  MonitoringEventRow,
  MonitoringFailureRow,
  MonitoringFailureSourceRow,
  MonitoringKpi,
  MonitoringMetadata,
  MonitoringModelRow,
  MonitoringModelShareRow,
  MonitoringRealtimeRow,
  MonitoringScopeFilters,
  MonitoringStatusChip,
  MonitoringStatusTone,
  MonitoringSummary,
  MonitoringTaskBucketRow,
  MonitoringTimeRange,
  MonitoringTimelinePoint,
  UseMonitoringDataParams,
  UseMonitoringDataReturn,
} from '../model/types';
export { buildApiKeyDisplayMap } from '../model/apiKeys';
export { buildMonitoringAuthMetaMap } from '../model/authMeta';
export { getRangeBounds } from '../model/range';
export {
  buildAccountRows,
  buildApiKeyRows,
  buildMonitoringSummary,
  buildRangeFilteredRows,
  buildScopeFilteredRows,
  buildRealtimeMonitorRows,
} from '../model/rowBuilders';

const MONITORING_EVENTS_PAGE_LIMIT = 500;
const MONITORING_PRESENTATION_CACHE_LIMIT = 24;
const EMPTY_MONITORING_ANALYTICS_EVENT_ROWS: MonitoringAnalyticsEventRow[] = [];

export type MonitoringPresentationSnapshot = Pick<
  UseMonitoringDataReturn,
  | 'summary'
  | 'timeline'
  | 'timelineGranularity'
  | 'hourlyDistribution'
  | 'modelShareRows'
  | 'channelRows'
  | 'modelRows'
  | 'failureSourceRows'
  | 'taskBuckets'
  | 'recentFailures'
  | 'accountRows'
  | 'apiKeyRows'
  | 'filterOptions'
  | 'filteredRows'
  | 'eventsTotalCount'
  | 'lastRefreshedAt'
>;

export interface MonitoringPresentationSnapshotResolution {
  snapshot: MonitoringPresentationSnapshot;
  hasPresentationSnapshot: boolean;
  usingSnapshotFallback: boolean;
}

interface MonitoringPresentationSnapshotStore {
  cachedSnapshots: Map<string, MonitoringPresentationSnapshot>;
  lastStableSnapshot: MonitoringPresentationSnapshot | null;
}

export const buildMonitoringEventsScopeKey = (
  timeRange: UseMonitoringDataParams['timeRange'],
  analyticsBounds: { startMs: number; endMs: number } | null,
  searchQuery: string,
  searchApiKeyHash: string | undefined,
  filters: unknown,
  granularity: string,
  dataScope?: UseMonitoringDataParams['dataScope']
) =>
  JSON.stringify({
    range: timeRange,
    bounds:
      timeRange === 'custom'
        ? analyticsBounds
        : analyticsBounds
          ? { startMs: analyticsBounds.startMs }
          : null,
    searchQuery,
    searchApiKeyHash,
    filters,
    granularity,
    dataScope,
  });

const uniqueOptionValues = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right)
  );

export const resolveMonitoringPresentationSnapshot = ({
  computedSnapshot,
  scopeKey,
  dataStale,
  cachedSnapshots,
  lastStableSnapshot,
}: {
  computedSnapshot: MonitoringPresentationSnapshot;
  scopeKey: string;
  dataStale: boolean;
  cachedSnapshots: ReadonlyMap<string, MonitoringPresentationSnapshot>;
  lastStableSnapshot: MonitoringPresentationSnapshot | null;
}): MonitoringPresentationSnapshotResolution => {
  if (!dataStale) {
    return {
      snapshot: computedSnapshot,
      hasPresentationSnapshot: true,
      usingSnapshotFallback: false,
    };
  }

  const snapshot = cachedSnapshots.get(scopeKey) ?? lastStableSnapshot;
  return {
    snapshot: snapshot ?? computedSnapshot,
    hasPresentationSnapshot: Boolean(snapshot),
    usingSnapshotFallback: Boolean(snapshot),
  };
};

export function useMonitoringData({
  usage,
  config,
  modelPrices,
  apiKeyAliases,
  timeRange,
  customTimeRange,
  searchQuery,
  searchApiKeyHash,
  scopeFilters,
  dataScope = 'accounts',
  eventsPage = 1,
  eventsPageSize = MONITORING_EVENTS_PAGE_LIMIT,
}: UseMonitoringDataParams): UseMonitoringDataReturn {
  const [authFiles, setAuthFiles] = useState<AuthFileItem[]>([]);
  const [channels, setChannels] = useState<MonitoringChannelMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analyticsNowMs, setAnalyticsNowMs] = useState(() => Date.now());
  const [presentationSnapshotStore, setPresentationSnapshotStore] =
    useState<MonitoringPresentationSnapshotStore>(() => ({
      cachedSnapshots: new Map(),
      lastStableSnapshot: null,
    }));

  const analyticsBounds = useMemo(() => {
    const bounds = getRangeBounds(timeRange, analyticsNowMs, customTimeRange);
    if (!bounds) return null;
    return {
      startMs: Number.isFinite(bounds.startMs) && bounds.startMs > 0 ? bounds.startMs : 1,
      endMs: Math.max(bounds.endMs, 1),
    };
  }, [analyticsNowMs, customTimeRange, timeRange]);

  const refreshMeta = useCallback(
    async (showLoading: boolean = true) => {
      if (showLoading) {
        setLoading(true);
        setError('');
      }

      const payload = await loadMonitoringMetaPayload(config);
      setAuthFiles(payload.authFiles);
      setChannels(payload.channels);
      setError(payload.error);
      setLoading(false);
      setAnalyticsNowMs(Date.now());
    },
    [config]
  );

  useEffect(() => {
    let cancelled = false;

    loadMonitoringMetaPayload(config).then((payload) => {
      if (cancelled) return;
      setAuthFiles(payload.authFiles);
      setChannels(payload.channels);
      setError(payload.error);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [config]);

  const authMetaMap = useMemo(() => buildMonitoringAuthMetaMap(authFiles), [authFiles]);

  const uniqueAuthMeta = useMemo(() => {
    const map = new Map<string, MonitoringAuthMeta>();
    authMetaMap.forEach((item) => {
      map.set(item.authIndex, item);
    });
    return Array.from(map.values());
  }, [authMetaMap]);

  const authFileMap = useMemo(() => {
    const map = new Map<string, CredentialInfo>();
    authFiles.forEach((entry) => {
      const authIndex = normalizeAuthIndex(entry['auth_index'] ?? entry.authIndex);
      if (!authIndex) return;
      map.set(authIndex, {
        name:
          readString(entry.account_name ?? entry.accountName ?? entry.display_name ?? entry.displayName) ||
          readString(entry.label) ||
          readString(entry.email) ||
          readString(entry.account) ||
          readString(entry.name) ||
          authIndex,
        type: readString(entry.provider) || readString(entry.type),
      });
    });
    return map;
  }, [authFiles]);

  const sourceInfoMap = useMemo(
    () =>
      buildSourceInfoMap({
        geminiApiKeys: config?.geminiApiKeys || [],
        claudeApiKeys: config?.claudeApiKeys || [],
        codexApiKeys: config?.codexApiKeys || [],
        vertexApiKeys: config?.vertexApiKeys || [],
        openaiCompatibility: config?.openaiCompatibility || [],
      }),
    [config]
  );

  const channelByAuthIndex = useMemo(() => {
    const map = new Map<string, MonitoringChannelMeta>();
    channels.forEach((channel) => {
      channel.authIndices.forEach((authIndex) => {
        map.set(authIndex, channel);
      });
    });
    return map;
  }, [channels]);

  const apiKeyDisplayMap = useMemo(() => {
    return buildApiKeyDisplayMap(config?.apiKeys || [], apiKeyAliases || []);
  }, [apiKeyAliases, config?.apiKeys]);

  const analyticsFilters = useMemo(
    () => buildAnalyticsFilters(scopeFilters, authMetaMap, channels),
    [authMetaMap, channels, scopeFilters]
  );

  const analyticsGranularity = useMemo(
    () => (shouldUseHourlyTimeline(timeRange, customTimeRange) ? 'hour' : 'day'),
    [customTimeRange, timeRange]
  );

  const modelPricesScopeKey = useMemo(
    () =>
      JSON.stringify(
        Object.entries(modelPrices)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([model, price]) => [
            model,
            price.prompt,
            price.completion,
            price.cache,
            price.cacheRead,
            price.cacheCreation,
          ])
      ),
    [modelPrices]
  );

  const eventsScopeKey = useMemo(
    () =>
      [
        buildMonitoringEventsScopeKey(
          timeRange,
          analyticsBounds,
          searchQuery,
          searchApiKeyHash,
          analyticsFilters,
          analyticsGranularity,
          dataScope
        ),
        modelPricesScopeKey,
      ].join('\u001f'),
    [
      analyticsBounds,
      analyticsFilters,
      analyticsGranularity,
      dataScope,
      modelPricesScopeKey,
      searchApiKeyHash,
      searchQuery,
      timeRange,
    ]
  );

  const analytics = useMonitoringAnalytics({
    fromMs: analyticsBounds?.startMs,
    toMs: analyticsBounds?.endMs,
    nowMs: analyticsNowMs,
    dataScopeKey: eventsScopeKey,
    searchQuery,
    searchApiKeyHash,
    filters: analyticsFilters,
    include: {
      summary: true,
      timeline: true,
      hourly_distribution: true,
      model_share: true,
      channel_share: true,
      model_stats: true,
      failure_sources: true,
      account_stats: dataScope === 'accounts',
      api_key_stats: dataScope === 'apiKeys',
      filter_options: true,
      recent_failures: dataScope === 'realtime' ? 8 : undefined,
      events_page:
        dataScope === 'realtime'
          ? {
              limit: eventsPageSize,
              offset: Math.max(0, (Math.max(1, eventsPage) - 1) * Math.max(1, eventsPageSize)),
              page: Math.max(1, eventsPage),
            }
          : undefined,
      granularity: analyticsGranularity,
    },
    throttleMs: 1_000,
  });
  const analyticsData = analytics.data;
  const currentAnalyticsData = analytics.dataStale ? null : analyticsData;
  const displayEventItems = analyticsData?.events?.items ?? EMPTY_MONITORING_ANALYTICS_EVENT_ROWS;
  const displayEventsTotalCount =
    currentAnalyticsData?.events?.total_count ?? displayEventItems.length;

  const allRows = useMemo(() => {
    const details = analyticsData
      ? buildUsageDetailsFromAnalyticsEvents(displayEventItems)
      : collectUsageDetailsWithEndpoint(usage);
    return buildEventRows(
      details,
      authMetaMap,
      authFileMap,
      sourceInfoMap,
      channelByAuthIndex,
      modelPrices,
      apiKeyDisplayMap
    ).sort((left, right) => right.timestampMs - left.timestampMs);
  }, [
    apiKeyDisplayMap,
    authFileMap,
    authMetaMap,
    channelByAuthIndex,
    analyticsData,
    displayEventItems,
    modelPrices,
    sourceInfoMap,
    usage,
  ]);

  const rangeFilteredRows = useMemo(
    () =>
      buildRangeFilteredRows(allRows, timeRange, customTimeRange, searchQuery, searchApiKeyHash),
    [allRows, customTimeRange, searchApiKeyHash, searchQuery, timeRange]
  );
  const filteredRows = useMemo(
    () => buildScopeFilteredRows(rangeFilteredRows, scopeFilters),
    [rangeFilteredRows, scopeFilters]
  );
  const statsRows = useMemo(() => filteredRows.filter(shouldIncludeInStats), [filteredRows]);

  const summary = useMemo(
    () =>
      currentAnalyticsData?.summary
        ? buildSummaryFromAnalytics(currentAnalyticsData.summary)
        : buildMonitoringSummary(statsRows),
    [currentAnalyticsData, statsRows]
  );
  const timelineData = useMemo(
    () =>
      currentAnalyticsData?.timeline
        ? {
            granularity:
              currentAnalyticsData.granularity === 'hour' ? ('hour' as const) : ('day' as const),
            points: buildTimelineFromAnalytics(
              currentAnalyticsData.timeline,
              currentAnalyticsData.granularity
            ),
          }
        : buildTimeline(statsRows, timeRange, customTimeRange),
    [currentAnalyticsData, customTimeRange, statsRows, timeRange]
  );
  const hourlyDistribution = useMemo(
    () =>
      currentAnalyticsData?.hourly_distribution
        ? buildHourlyDistributionFromAnalytics(currentAnalyticsData.hourly_distribution)
        : buildHourlyDistribution(statsRows),
    [currentAnalyticsData, statsRows]
  );
  const modelShareRows = useMemo(
    () =>
      currentAnalyticsData?.model_share
        ? buildModelShareRowsFromAnalytics(
            currentAnalyticsData.model_share,
            currentAnalyticsData.model_stats
          )
        : buildModelShareRows(statsRows),
    [currentAnalyticsData, statsRows]
  );
  const channelRows = useMemo(
    () =>
      currentAnalyticsData?.channel_share
        ? buildChannelRowsFromAnalytics(
            currentAnalyticsData.channel_share,
            authMetaMap,
            authFileMap,
            sourceInfoMap,
            channelByAuthIndex
          )
        : buildChannelRows(statsRows),
    [currentAnalyticsData, authFileMap, authMetaMap, channelByAuthIndex, sourceInfoMap, statsRows]
  );
  const modelRows = useMemo(
    () =>
      currentAnalyticsData?.model_stats
        ? buildModelRowsFromAnalytics(currentAnalyticsData.model_stats)
        : buildModelRows(statsRows),
    [currentAnalyticsData, statsRows]
  );
  const failureSourceRows = useMemo(
    () =>
      currentAnalyticsData?.failure_sources
        ? buildFailureSourceRowsFromAnalytics(
            currentAnalyticsData.failure_sources,
            authMetaMap,
            authFileMap,
            sourceInfoMap,
            channelByAuthIndex
          )
        : buildFailureSourceRows(statsRows),
    [currentAnalyticsData, authFileMap, authMetaMap, channelByAuthIndex, sourceInfoMap, statsRows]
  );
  const taskBuckets = useMemo(
    () =>
      currentAnalyticsData?.task_buckets
        ? buildTaskBucketsFromAnalytics(
            currentAnalyticsData.task_buckets,
            authMetaMap,
            authFileMap,
            sourceInfoMap,
            channelByAuthIndex
          )
        : buildTaskBuckets(statsRows),
    [currentAnalyticsData, authFileMap, authMetaMap, channelByAuthIndex, sourceInfoMap, statsRows]
  );
  const recentFailures = useMemo(
    () =>
      currentAnalyticsData?.recent_failures
        ? buildFailureRowsFromAnalytics(
            currentAnalyticsData.recent_failures,
            authMetaMap,
            authFileMap,
            sourceInfoMap,
            channelByAuthIndex
          )
        : buildFailureRows(statsRows),
    [currentAnalyticsData, authFileMap, authMetaMap, channelByAuthIndex, sourceInfoMap, statsRows]
  );
  const accountRows = useMemo(
    () =>
      currentAnalyticsData?.account_stats
        ? buildAccountRowsFromAnalytics(
            currentAnalyticsData.account_stats,
            authMetaMap,
            authFileMap,
            sourceInfoMap,
            channelByAuthIndex
          )
        : buildAccountRows(filteredRows),
    [currentAnalyticsData, authFileMap, authMetaMap, channelByAuthIndex, filteredRows, sourceInfoMap]
  );
  const apiKeyRows = useMemo(
    () =>
      currentAnalyticsData?.api_key_stats
        ? buildApiKeyRowsFromAnalytics(
            currentAnalyticsData.api_key_stats,
            authMetaMap,
            authFileMap,
            sourceInfoMap,
            channelByAuthIndex,
            apiKeyDisplayMap
          )
        : buildApiKeyRows(filteredRows),
    [
      apiKeyDisplayMap,
      currentAnalyticsData,
      authFileMap,
      authMetaMap,
      channelByAuthIndex,
      filteredRows,
      sourceInfoMap,
    ]
  );
  const fallbackFilterOptions = useMemo<MonitoringFilterOptions>(
    () => ({
      accountRows: buildAccountRows(rangeFilteredRows),
      apiKeyRows: buildApiKeyRows(rangeFilteredRows),
      providers: uniqueOptionValues(rangeFilteredRows.map((row) => row.provider)),
      models: uniqueOptionValues(rangeFilteredRows.map((row) => row.model)),
      channels: uniqueOptionValues(rangeFilteredRows.map((row) => row.channel)),
    }),
    [rangeFilteredRows]
  );
  const analyticsFilterOptions = currentAnalyticsData?.filter_options;
  const filterOptions = useMemo(
    () =>
      analyticsFilterOptions
        ? buildFilterOptionsFromAnalytics(
            analyticsFilterOptions,
            authMetaMap,
            authFileMap,
            sourceInfoMap,
            channelByAuthIndex,
            apiKeyDisplayMap
          )
        : fallbackFilterOptions,
    [
      apiKeyDisplayMap,
      authFileMap,
      authMetaMap,
      channelByAuthIndex,
      analyticsFilterOptions,
      fallbackFilterOptions,
      sourceInfoMap,
    ]
  );

  const computedPresentationSnapshot = useMemo<MonitoringPresentationSnapshot>(
    () => ({
      summary,
      timeline: timelineData.points,
      timelineGranularity: timelineData.granularity,
      hourlyDistribution,
      modelShareRows,
      channelRows,
      modelRows,
      failureSourceRows,
      taskBuckets,
      recentFailures,
      accountRows,
      apiKeyRows,
      filterOptions,
      filteredRows,
      eventsTotalCount: displayEventsTotalCount,
      lastRefreshedAt: analytics.lastRefreshedAt,
    }),
    [
      analytics.lastRefreshedAt,
      accountRows,
      apiKeyRows,
      channelRows,
      displayEventsTotalCount,
      failureSourceRows,
      filterOptions,
      filteredRows,
      hourlyDistribution,
      modelRows,
      modelShareRows,
      recentFailures,
      summary,
      taskBuckets,
      timelineData.granularity,
      timelineData.points,
    ]
  );

  useEffect(() => {
    if (analytics.dataStale) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPresentationSnapshotStore((previous) => {
        if (
          previous.lastStableSnapshot === computedPresentationSnapshot &&
          previous.cachedSnapshots.get(eventsScopeKey) === computedPresentationSnapshot
        ) {
          return previous;
        }

        const cachedSnapshots = new Map(previous.cachedSnapshots);
        cachedSnapshots.set(eventsScopeKey, computedPresentationSnapshot);
        while (cachedSnapshots.size > MONITORING_PRESENTATION_CACHE_LIMIT) {
          const oldestKey = cachedSnapshots.keys().next().value;
          if (oldestKey === undefined) break;
          cachedSnapshots.delete(oldestKey);
        }
        return {
          cachedSnapshots,
          lastStableSnapshot: computedPresentationSnapshot,
        };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [analytics.dataStale, computedPresentationSnapshot, eventsScopeKey]);

  const presentationResolution = useMemo(
    () =>
      resolveMonitoringPresentationSnapshot({
        computedSnapshot: computedPresentationSnapshot,
        scopeKey: eventsScopeKey,
        dataStale: analytics.dataStale,
        cachedSnapshots: presentationSnapshotStore.cachedSnapshots,
        lastStableSnapshot: presentationSnapshotStore.lastStableSnapshot,
      }),
    [
      analytics.dataStale,
      computedPresentationSnapshot,
      eventsScopeKey,
      presentationSnapshotStore.cachedSnapshots,
      presentationSnapshotStore.lastStableSnapshot,
    ]
  );
  const presentationSnapshot = presentationResolution.snapshot;

  const metadata = useMemo<MonitoringMetadata>(() => {
    const planTypes = Array.from(
      new Set(uniqueAuthMeta.map((item) => item.planType).filter((item) => item && item !== '-'))
    ).sort();

    return {
      totalAuthFiles: authFiles.length,
      activeAuthFiles: uniqueAuthMeta.filter(
        (item) => !item.disabled && !item.unavailable && item.status === 'active'
      ).length,
      unavailableAuthFiles: uniqueAuthMeta.filter((item) => item.unavailable).length,
      runtimeOnlyAuthFiles: uniqueAuthMeta.filter((item) => item.runtimeOnly).length,
      totalChannels: channels.length,
      enabledChannels: channels.filter((item) => !item.disabled).length,
      configuredModels: Array.from(new Set(channels.flatMap((item) => item.modelNames))).length,
      planTypes,
    };
  }, [authFiles.length, channels, uniqueAuthMeta]);

  const statusChips = useMemo(() => buildStatusChips(metadata), [metadata]);

  return {
    loading: loading || analytics.loading,
    error: [error, analytics.error].filter(Boolean).join('；'),
    authFiles,
    channels,
    summary: presentationSnapshot.summary,
    metadata,
    statusChips,
    timeline: presentationSnapshot.timeline,
    timelineGranularity: presentationSnapshot.timelineGranularity,
    hourlyDistribution: presentationSnapshot.hourlyDistribution,
    modelShareRows: presentationSnapshot.modelShareRows,
    channelRows: presentationSnapshot.channelRows,
    modelRows: presentationSnapshot.modelRows,
    failureSourceRows: presentationSnapshot.failureSourceRows,
    taskBuckets: presentationSnapshot.taskBuckets,
    recentFailures: presentationSnapshot.recentFailures,
    accountRows: presentationSnapshot.accountRows,
    apiKeyRows: presentationSnapshot.apiKeyRows,
    filterOptions: presentationSnapshot.filterOptions,
    filteredRows: presentationSnapshot.filteredRows,
    eventsTotalCount: presentationSnapshot.eventsTotalCount,
    lastRefreshedAt: presentationSnapshot.lastRefreshedAt,
    isTransitioningScope: analytics.dataStale,
    hasPresentationSnapshot: presentationResolution.hasPresentationSnapshot,
    refreshMeta,
  };
}
