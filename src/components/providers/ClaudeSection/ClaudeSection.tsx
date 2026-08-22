import { Fragment, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import iconClaude from '@/assets/icons/claude.svg';
import type { ProviderKeyConfig } from '@/types';
import { statusBarDataFromRecentRequests } from '@/utils/recentRequests';
import styles from '@/features/aiProviders/AiProvidersPage.module.scss';
import { ProviderList } from '../ProviderList';
import { ProviderStatusBar } from '../ProviderStatusBar';
import { ModelTagList } from '../ModelTagList';
import { ProviderCardTitle } from '../ProviderCardTitle';
import { ProviderApiKeyEntries } from '../ProviderApiKeyEntries';
import { FloatingProviderSection } from '../FloatingProviderSection';
import {
  getProviderConfigKey,
  getProviderRecentBuckets,
  getProviderTotalStats,
  hasDisableAllModelsRule,
  type ProviderRecentUsageMap,
} from '../utils';

interface ClaudeSectionProps {
  configs: ProviderKeyConfig[];
  usageByProvider: ProviderRecentUsageMap;
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggle: (index: number, enabled: boolean) => void;
  renderSelection?: (config: ProviderKeyConfig, index: number) => ReactNode;
}

export function ClaudeSection({
  configs,
  usageByProvider,
  loading,
  disableControls,
  isSwitching,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
  renderSelection,
}: ClaudeSectionProps) {
  const { t } = useTranslation();
  const actionsDisabled = disableControls || loading || isSwitching;
  const toggleDisabled = disableControls || loading || isSwitching;

  const statusBarCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof statusBarDataFromRecentRequests>>();

    configs.forEach((config, index) => {
      if (!config.apiKey) return;
      const configKey = getProviderConfigKey(config, index);
      cache.set(
        configKey,
        statusBarDataFromRecentRequests(
          getProviderRecentBuckets(usageByProvider, 'claude', config.apiKey, config.baseUrl)
        )
      );
    });

    return cache;
  }, [configs, usageByProvider]);

  return (
    <>
      <FloatingProviderSection
        title={
          <span className={styles.cardTitle}>
            <img src={iconClaude} alt="" className={styles.cardTitleIcon} />
            {t('ai_providers.claude_title')}
          </span>
        }
        extra={
          <Button size="sm" onClick={onAdd} disabled={actionsDisabled}>
            {t('ai_providers.claude_add_button')}
          </Button>
        }
      >
        <ProviderList<ProviderKeyConfig>
          items={configs}
          loading={loading}
          keyField={(item, index) => getProviderConfigKey(item, index)}
          emptyTitle={t('ai_providers.claude_empty_title')}
          emptyDescription={t('ai_providers.claude_empty_desc')}
          onEdit={(_, index) => onEdit(index)}
          onDelete={(_, index) => onDelete(index)}
          actionsDisabled={actionsDisabled}
          getRowDisabled={(item) => hasDisableAllModelsRule(item.excludedModels)}
          listClassName={styles.openaiProviderList}
          actionButtonClassName={styles.providerActionIconButton}
          renderPriority={(item) =>
            item.priority !== undefined ? (
              <div className={styles.providerActionPriority}>
                <span className={styles.providerPriorityBadge}>
                  <span className={styles.providerPriorityLabel}>{t('common.priority')}</span>
                  <span className={styles.providerPriorityValue}>{item.priority}</span>
                </span>
              </div>
            ) : null
          }
          renderExtraActions={(item, index) => (
            <ToggleSwitch
              label={t('ai_providers.config_toggle_label')}
              checked={!hasDisableAllModelsRule(item.excludedModels)}
              disabled={toggleDisabled}
              onChange={(value) => void onToggle(index, value)}
            />
          )}
          renderContent={(item, index) => {
            const stats = getProviderTotalStats(
              usageByProvider,
              'claude',
              item.apiKey,
              item.baseUrl
            );
            const headerEntries = Object.entries(item.headers || {});
            const configDisabled = hasDisableAllModelsRule(item.excludedModels);
            const excludedModels = item.excludedModels ?? [];
            const statusData =
              statusBarCache.get(getProviderConfigKey(item, index)) ||
              statusBarDataFromRecentRequests([]);

            return (
              <Fragment>
                <ProviderCardTitle
                  title={item.name || t('ai_providers.claude_item_title')}
                  selection={renderSelection?.(item, index)}
                  disabled={configDisabled}
                  success={stats.success}
                  failure={stats.failure}
                />
                {item.prefix && (
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>{t('common.prefix')}:</span>
                    <span className={styles.fieldValue}>{item.prefix}</span>
                  </div>
                )}
                {item.baseUrl && (
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>{t('common.base_url')}:</span>
                    <span className={styles.fieldValue}>{item.baseUrl}</span>
                  </div>
                )}
                {item.cloak && (
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>{t('ai_providers.claude_cloak_mode_label')}:</span>
                    <span className={styles.fieldValue}>
                      {(() => {
                        const raw = (item.cloak?.mode ?? '').trim().toLowerCase();
                        const key = raw === 'always' || raw === 'never' ? raw : 'auto';
                        return t(`ai_providers.claude_cloak_mode_${key}`);
                      })()}
                    </span>
                  </div>
                )}
                {item.cloak?.strictMode ? (
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>{t('ai_providers.claude_cloak_strict_label')}:</span>
                    <span className={styles.fieldValue}>{t('common.yes')}</span>
                  </div>
                ) : null}
                {item.cloak?.sensitiveWords?.length ? (
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>
                      {t('ai_providers.claude_cloak_sensitive_words_count')}:
                    </span>
                    <span className={styles.fieldValue}>{item.cloak.sensitiveWords.length}</span>
                  </div>
                ) : null}
                {headerEntries.length > 0 && (
                  <div className={styles.headerBadgeList}>
                    {headerEntries.map(([key, value]) => (
                      <span key={key} className={styles.headerBadge}>
                        <strong>{key}:</strong> {value}
                      </span>
                    ))}
                  </div>
                )}
                <ProviderApiKeyEntries
                  entries={[
                    {
                      apiKey: item.apiKey,
                      proxyUrl: item.proxyUrl,
                      success: stats.success,
                      failure: stats.failure,
                    },
                  ]}
                  countLabel={t('ai_providers.openai_keys_count')}
                />
                {item.models?.length ? (
                  <ModelTagList
                    models={item.models}
                    countLabel={t('ai_providers.claude_models_count')}
                  />
                ) : null}
                {excludedModels.length ? (
                  <div className={styles.excludedModelsSection}>
                    <div className={styles.excludedModelsLabel}>
                      {t('ai_providers.excluded_models_count', { count: excludedModels.length })}
                    </div>
                    <div className={styles.modelTagList}>
                      {excludedModels.map((model) => (
                        <span key={model} className={`${styles.modelTag} ${styles.excludedModelTag}`}>
                          <span className={styles.modelName}>{model}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <ProviderStatusBar statusData={statusData} />
              </Fragment>
            );
          }}
        />
      </FloatingProviderSection>
    </>
  );
}
