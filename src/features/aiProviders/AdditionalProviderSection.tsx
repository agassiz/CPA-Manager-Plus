import { Fragment, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconExternalLink } from '@/components/ui/icons';
import { FloatingProviderSection } from '@/components/providers/FloatingProviderSection';
import { ModelTagList } from '@/components/providers/ModelTagList';
import { ProviderApiKeyEntries } from '@/components/providers/ProviderApiKeyEntries';
import { ProviderCardTitle } from '@/components/providers/ProviderCardTitle';
import { ProviderList } from '@/components/providers/ProviderList';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import type { ProviderRecentUsageMap } from '@/components/providers/utils';
import type { ProviderKeyConfig } from '@/types';
import { statusBarDataFromRecentRequests } from '@/utils/recentRequests';
import { PROVIDER_LOGOS } from '@/features/providers/brandLogos';
import { CLAUDE_API_AFFILIATE_URL } from '@/features/providers/claudeApi';
import { getKimiAffiliateUrl } from '@/features/providers/kimi';
import {
  getSponsorProviderDefinition,
  isMultiProtocolSponsorBrand,
} from '@/features/providers/sponsorDefinitions';
import type { ProviderBrand, ProviderResource } from '@/features/providers/types';
import {
  getAdditionalProviderCredentials,
  getAdditionalProviderStats,
  getAdditionalProviderStatusData,
} from './additionalProviderPresentation';
import styles from './AiProvidersPage.module.scss';

interface AdditionalProviderSectionProps {
  brand: ProviderBrand;
  resources: ProviderResource[];
  usageByProvider: ProviderRecentUsageMap;
  loading: boolean;
  actionsDisabled: boolean;
  resolvedTheme: string;
  onAdd: () => void;
  onEdit: (resource: ProviderResource) => void;
  onDelete: (resource: ProviderResource) => void;
  onToggle: (resource: ProviderResource, enabled: boolean) => void;
  renderSelection?: (resource: ProviderResource) => ReactNode;
}

export function AdditionalProviderSection({
  brand,
  resources,
  usageByProvider,
  loading,
  actionsDisabled,
  resolvedTheme,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
  renderSelection,
}: AdditionalProviderSectionProps) {
  const { t, i18n } = useTranslation();
  const logo = PROVIDER_LOGOS[brand];
  const logoSource = resolvedTheme === 'dark' && logo.darkSrc ? logo.darkSrc : logo.src;
  const compactLogo =
    brand === 'claudeApi' || brand === 'code0' || brand === 'fennoAI' || brand === 'qiniuCloud';
  const providerName = t(`providersPage.providerNames.${brand}`);
  const registrationUrl =
    brand === 'claudeApi'
      ? CLAUDE_API_AFFILIATE_URL
      : brand === 'kimi'
        ? getKimiAffiliateUrl(i18n.resolvedLanguage ?? i18n.language)
        : brand === 'code0' || brand === 'fennoAI' || brand === 'qiniuCloud'
          ? getSponsorProviderDefinition(brand).affiliateUrl
          : undefined;
  const statusByResource = useMemo(
    () =>
      new Map(
        resources.map((resource) => [
          resource.id,
          getAdditionalProviderStatusData(resource, usageByProvider),
        ])
      ),
    [resources, usageByProvider]
  );

  return (
    <FloatingProviderSection
      title={
        <span className={styles.cardTitle}>
          {compactLogo ? (
            <span className={styles.additionalProviderLogo}>
              <img src={logoSource} alt="" className={styles.additionalProviderLogoImage} />
            </span>
          ) : (
            <img src={logoSource} alt="" className={styles.cardTitleIcon} />
          )}
          {providerName}
        </span>
      }
      extra={
        <div className={styles.cardHeaderActions}>
          {registrationUrl ? (
            <a
              href={registrationUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
            >
              <span>
                <IconExternalLink size={14} />
                {t('providersPage.sponsor.registerLink')}
              </span>
            </a>
          ) : null}
          <Button size="sm" onClick={onAdd} disabled={actionsDisabled}>
            {t('ai_providers.add_provider')}
          </Button>
        </div>
      }
    >
      <ProviderList<ProviderResource>
        items={resources}
        loading={loading}
        keyField={(resource) => resource.id}
        emptyTitle={providerName}
        emptyDescription={t('providersPage.table.empty')}
        onEdit={onEdit}
        onDelete={onDelete}
        actionsDisabled={actionsDisabled}
        getRowDisabled={(resource) => resource.disabled}
        listClassName={styles.openaiProviderList}
        actionButtonClassName={styles.providerActionIconButton}
        renderPriority={(resource) => (
          <div className={styles.providerActionPriority}>
            <span className={styles.providerPriorityBadge}>
              <span className={styles.providerPriorityLabel}>{t('common.priority')}</span>
              <span className={styles.providerPriorityValue}>{resource.priority}</span>
            </span>
          </div>
        )}
        renderExtraActions={(resource) => (
          <ToggleSwitch
            label={t('ai_providers.config_toggle_label')}
            checked={!resource.disabled}
            disabled={actionsDisabled}
            onChange={(enabled) => onToggle(resource, enabled)}
          />
        )}
        renderContent={(resource) => {
          const stats = getAdditionalProviderStats(resource, usageByProvider);
          const credentials = getAdditionalProviderCredentials(resource, usageByProvider);
          const config = resource.raw as ProviderKeyConfig;
          const headerEntries = isMultiProtocolSponsorBrand(resource.brand)
            ? []
            : Object.entries(config.headers ?? {});

          return (
            <Fragment>
              <ProviderCardTitle
                title={resource.name ?? providerName}
                selection={renderSelection?.(resource)}
                disabled={resource.disabled}
                success={stats.success}
                failure={stats.failure}
              />
              {resource.prefix ? (
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>{t('common.prefix')}:</span>
                  <span className={styles.fieldValue}>{resource.prefix}</span>
                </div>
              ) : null}
              {resource.baseUrl ? (
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>{t('common.base_url')}:</span>
                  <span className={styles.fieldValue}>{resource.baseUrl}</span>
                </div>
              ) : null}
              {headerEntries.length > 0 ? (
                <div className={styles.headerBadgeList}>
                  {headerEntries.map(([key, value]) => (
                    <span key={key} className={styles.headerBadge}>
                      <strong>{key}:</strong> {value}
                    </span>
                  ))}
                </div>
              ) : null}
              {credentials.length > 0 ? (
                <ProviderApiKeyEntries
                  entries={credentials}
                  countLabel={t('ai_providers.openai_keys_count')}
                />
              ) : null}
              {resource.models.length > 0 ? (
                <ModelTagList
                  models={resource.models.map((name) => ({ name }))}
                  countLabel={t('providersPage.table.metrics.models')}
                />
              ) : null}
              {resource.flags.protocols?.length ? (
                <div className={styles.excludedModelsSection}>
                  <div className={styles.excludedModelsLabel}>
                    {t('providersPage.sponsor.groupedKeysTitle')}
                  </div>
                  <div className={styles.modelTagList}>
                    {resource.flags.protocols.map((protocol) => (
                      <span key={protocol} className={styles.modelTag}>
                        <span className={styles.modelName}>
                          {t(`providersPage.sponsor.protocols.${protocol}`)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <ProviderStatusBar
                statusData={
                  statusByResource.get(resource.id) ?? statusBarDataFromRecentRequests([])
                }
              />
            </Fragment>
          );
        }}
      />
    </FloatingProviderSection>
  );
}
