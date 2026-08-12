import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Navigate, useLocation, useRoutes, type Location } from 'react-router-dom';
import { DashboardPage } from '@/pages/DashboardPage';
import { AiProvidersPage } from '@/pages/AiProvidersPage';
import { AiProvidersClaudeEditLayout } from '@/pages/AiProvidersClaudeEditLayout';
import { AiProvidersClaudeEditPage } from '@/pages/AiProvidersClaudeEditPage';
import { AiProvidersClaudeModelsPage } from '@/pages/AiProvidersClaudeModelsPage';
import { AiProvidersCodexEditPage } from '@/pages/AiProvidersCodexEditPage';
import { AiProvidersGeminiEditPage } from '@/pages/AiProvidersGeminiEditPage';
import { AiProvidersOpenAIEditLayout } from '@/pages/AiProvidersOpenAIEditLayout';
import { AiProvidersOpenAIEditPage } from '@/pages/AiProvidersOpenAIEditPage';
import { AiProvidersOpenAIModelsPage } from '@/pages/AiProvidersOpenAIModelsPage';
import { AiProvidersVertexEditPage } from '@/pages/AiProvidersVertexEditPage';
import { AiProvidersEditorModal } from '@/features/aiProviders/AiProvidersEditorModal';
import { AuthFilesPage } from '@/pages/AuthFilesPage';
import { AuthFilesOAuthExcludedEditPage } from '@/pages/AuthFilesOAuthExcludedEditPage';
import { AuthFilesOAuthModelAliasEditPage } from '@/pages/AuthFilesOAuthModelAliasEditPage';
import { OAuthPage } from '@/pages/OAuthPage';
import { QuotaPage } from '@/pages/QuotaPage';
import { PluginResourcePage } from '@/features/plugins/PluginResourcePage';
import { PluginsPage } from '@/features/plugins/PluginsPage';
import { PluginStorePage } from '@/features/plugins/PluginStorePage';
import { MonitoringCenterPage } from '@/pages/MonitoringCenterPage';
import { UsageAnalyticsPage } from '@/pages/UsageAnalyticsPage';
import { ModelPricesPage } from '@/pages/ModelPricesPage';
import { CodexInspectionPage } from '@/pages/CodexInspectionPage';
import { ConfigPage } from '@/pages/ConfigPage';
import { LogsPage } from '@/pages/LogsPage';
import { SystemPage } from '@/pages/SystemPage';
import { SecurityAuditPage } from '@/pages/SecurityAuditPage';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { usePanelFeatureAvailability } from '@/hooks/usePanelFeatureAvailability';
import { isLogsRouteAvailable } from '@/features/logs/logFeatureAvailability';
import { useAuthStore, useConfigStore } from '@/stores';

type FeatureKey = 'requestMonitoring' | 'modelPrices';

function FeatureGate({
  feature,
  children,
  fallback,
}: {
  feature: FeatureKey;
  children: ReactElement;
  fallback?: ReactElement | null;
}) {
  const availability = usePanelFeatureAvailability();
  const enabled =
    feature === 'requestMonitoring'
      ? availability.requestMonitoringAvailable
      : availability.modelPricesAvailable;

  if (availability.checking) {
    return fallback ?? <LoadingSpinner />;
  }

  if (!enabled) {
    return <Navigate to="/config" replace />;
  }

  return children;
}

function LogsGate({ children }: { children: ReactElement }) {
  const location = useLocation();
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const requestedRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (config || requestedRef.current) return;
    requestedRef.current = true;
    fetchConfig().catch(() => setFailed(true));
  }, [config, fetchConfig]);

  if (!config && !failed) {
    return <LoadingSpinner />;
  }

  if (!isLogsRouteAvailable(config, location.search)) {
    return <Navigate to="/config" replace />;
  }

  return children;
}

const createMainRoutes = (supportsPlugin: boolean) => [
  { path: '/', element: <DashboardPage /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/settings', element: <Navigate to="/config" replace /> },
  { path: '/api-keys', element: <Navigate to="/config" replace /> },
  {
    path: '/ai-providers/gemini/new',
    element: (
      <AiProvidersEditorModal>
        <AiProvidersGeminiEditPage />
      </AiProvidersEditorModal>
    ),
  },
  {
    path: '/ai-providers/gemini/:index',
    element: (
      <AiProvidersEditorModal>
        <AiProvidersGeminiEditPage />
      </AiProvidersEditorModal>
    ),
  },
  {
    path: '/ai-providers/codex/new',
    element: (
      <AiProvidersEditorModal>
        <AiProvidersCodexEditPage />
      </AiProvidersEditorModal>
    ),
  },
  {
    path: '/ai-providers/codex/:index',
    element: (
      <AiProvidersEditorModal>
        <AiProvidersCodexEditPage />
      </AiProvidersEditorModal>
    ),
  },
  {
    path: '/ai-providers/claude/new',
    element: (
      <AiProvidersEditorModal>
        <AiProvidersClaudeEditLayout />
      </AiProvidersEditorModal>
    ),
    children: [
      { index: true, element: <AiProvidersClaudeEditPage /> },
      { path: 'models', element: <AiProvidersClaudeModelsPage /> },
    ],
  },
  {
    path: '/ai-providers/claude/:index',
    element: (
      <AiProvidersEditorModal>
        <AiProvidersClaudeEditLayout />
      </AiProvidersEditorModal>
    ),
    children: [
      { index: true, element: <AiProvidersClaudeEditPage /> },
      { path: 'models', element: <AiProvidersClaudeModelsPage /> },
    ],
  },
  {
    path: '/ai-providers/vertex/new',
    element: (
      <AiProvidersEditorModal>
        <AiProvidersVertexEditPage />
      </AiProvidersEditorModal>
    ),
  },
  {
    path: '/ai-providers/vertex/:index',
    element: (
      <AiProvidersEditorModal>
        <AiProvidersVertexEditPage />
      </AiProvidersEditorModal>
    ),
  },
  {
    path: '/ai-providers/openai/new',
    element: (
      <AiProvidersEditorModal>
        <AiProvidersOpenAIEditLayout />
      </AiProvidersEditorModal>
    ),
    children: [
      { index: true, element: <AiProvidersOpenAIEditPage /> },
      { path: 'models', element: <AiProvidersOpenAIModelsPage /> },
    ],
  },
  {
    path: '/ai-providers/openai/:index',
    element: (
      <AiProvidersEditorModal>
        <AiProvidersOpenAIEditLayout />
      </AiProvidersEditorModal>
    ),
    children: [
      { index: true, element: <AiProvidersOpenAIEditPage /> },
      { path: 'models', element: <AiProvidersOpenAIModelsPage /> },
    ],
  },
  { path: '/ai-providers', element: <AiProvidersPage /> },
  { path: '/ai-providers/*', element: <AiProvidersPage /> },
  { path: '/auth-files', element: <AuthFilesPage /> },
  { path: '/auth-files/oauth-excluded', element: <AuthFilesOAuthExcludedEditPage /> },
  { path: '/auth-files/oauth-model-alias', element: <AuthFilesOAuthModelAliasEditPage /> },
  { path: '/oauth', element: <OAuthPage /> },
  { path: '/quota', element: <QuotaPage /> },
  ...(supportsPlugin
    ? [
        { path: '/plugin-pages/:pluginId/:menuIndex', element: <PluginResourcePage /> },
        { path: '/plugins', element: <PluginsPage /> },
        { path: '/plugin-store', element: <PluginStorePage /> },
        { path: '/plugins/*', element: <Navigate to="/plugins" replace /> },
      ]
    : [
        { path: '/plugin-pages/*', element: <Navigate to="/" replace /> },
        { path: '/plugins/*', element: <Navigate to="/" replace /> },
        { path: '/plugin-store', element: <Navigate to="/" replace /> },
      ]),
  { path: '/codex-inspection', element: <CodexInspectionPage /> },
  { path: '/codex-inspection/server', element: <Navigate to="/codex-inspection" replace /> },
  {
    path: '/model-prices',
    element: (
      <FeatureGate feature="modelPrices">
        <ModelPricesPage />
      </FeatureGate>
    ),
  },
  {
    path: '/monitoring',
    element: (
      <FeatureGate feature="requestMonitoring">
        <MonitoringCenterPage />
      </FeatureGate>
    ),
  },
  {
    path: '/usage-analytics',
    element: (
      <FeatureGate feature="requestMonitoring">
        <UsageAnalyticsPage />
      </FeatureGate>
    ),
  },
  {
    path: '/monitoring/model-prices',
    element: (
      <FeatureGate feature="modelPrices">
        <Navigate to="/model-prices" replace />
      </FeatureGate>
    ),
  },
  { path: '/monitoring/codex-inspection', element: <Navigate to="/codex-inspection" replace /> },
  {
    path: '/monitoring/codex-inspection/server',
    element: <Navigate to="/codex-inspection" replace />,
  },
  { path: '/config', element: <ConfigPage /> },
  { path: '/security-audit', element: <SecurityAuditPage /> },
  {
    path: '/logs',
    element: (
      <LogsGate>
        <LogsPage />
      </LogsGate>
    ),
  },
  { path: '/system', element: <SystemPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
];

export function MainRoutes({ location }: { location?: Location }) {
  const supportsPlugin = useAuthStore((state) => state.supportsPlugin);
  return useRoutes(createMainRoutes(supportsPlugin), location);
}
