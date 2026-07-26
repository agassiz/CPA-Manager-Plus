import { useTranslation } from 'react-i18next';
import {
  IconAlertTriangle,
  IconCheckCircle2,
  IconEye,
  IconPencil,
  IconTrash2,
} from '@/components/ui/icons';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import {
  getOpenAIProviderRecentStatusData,
  getOpenAIProviderTotalStats,
  getProviderRecentStatusData,
  getProviderTotalStats,
  type ProviderRecentUsageMap,
} from '@/components/providers/utils';
import type { OpenAIProviderConfig } from '@/types';
import { PROVIDER_LOGOS } from '../brandLogos';
import { isMultiProtocolSponsorBrand } from '../sponsorDefinitions';
import type { ProviderResource } from '../types';
import styles from './ProviderResourceCards.module.scss';
import statusBarStyles from './providerStatusBar.module.scss';

interface ProviderResourceCardsProps {
  resources: ProviderResource[];
  selectedId?: string | null;
  disableMutations?: boolean;
  usageByProvider?: ProviderRecentUsageMap;
  onView: (resource: ProviderResource) => void;
  onEdit: (resource: ProviderResource) => void;
  onDelete: (resource: ProviderResource) => void;
  onToggleDisabled?: (resource: ProviderResource, disabled: boolean) => void;
}

const getUsageProvider = (resource: ProviderResource): string =>
  resource.brand === 'claudeApi' ? 'claude' : resource.brand;

const getStats = (resource: ProviderResource, usage?: ProviderRecentUsageMap) => {
  if (!usage || isMultiProtocolSponsorBrand(resource.brand)) return { success: 0, failure: 0 };
  if (resource.brand === 'openaiCompatibility') {
    return getOpenAIProviderTotalStats(resource.raw as OpenAIProviderConfig, usage);
  }
  return getProviderTotalStats(
    usage,
    getUsageProvider(resource),
    resource.apiKey ?? undefined,
    resource.baseUrl ?? undefined
  );
};

const getStatusData = (resource: ProviderResource, usage?: ProviderRecentUsageMap) => {
  if (!usage || isMultiProtocolSponsorBrand(resource.brand)) return null;
  if (resource.brand === 'openaiCompatibility') {
    return getOpenAIProviderRecentStatusData(resource.raw as OpenAIProviderConfig, usage);
  }
  return getProviderRecentStatusData(
    usage,
    getUsageProvider(resource),
    resource.apiKey ?? undefined,
    resource.baseUrl ?? undefined
  );
};

export function ProviderResourceCards({
  resources,
  selectedId,
  disableMutations,
  usageByProvider,
  onView,
  onEdit,
  onDelete,
  onToggleDisabled,
}: ProviderResourceCardsProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.grid}>
      {resources.map((resource) => {
        const logo = PROVIDER_LOGOS[resource.brand];
        const stats = getStats(resource, usageByProvider);
        const statusData = getStatusData(resource, usageByProvider);
        const isSponsor = isMultiProtocolSponsorBrand(resource.brand);
        const logoClass = [
          styles.logo,
          logo?.themeSurface ? styles.logoThemeSurface : '',
          logo?.darkSrc ? styles.logoThemeLight : '',
        ]
          .filter(Boolean)
          .join(' ');
        const darkLogoClass = [styles.logo, styles.logoThemeDark].filter(Boolean).join(' ');
        const modelPreview = resource.models.slice(0, 4);
        const modelOverflow = resource.models.length - modelPreview.length;

        return (
          <article
            key={resource.id}
            className={`${styles.card} ${resource.id === selectedId ? styles.selected : ''}`}
          >
            <div className={styles.cardHeader}>
              <div className={styles.identity}>
                {logo ? (
                  <>
                    <img src={logo.src} alt="" aria-hidden="true" className={logoClass} />
                    {logo.darkSrc ? (
                      <img
                        src={logo.darkSrc}
                        alt=""
                        aria-hidden="true"
                        className={darkLogoClass}
                      />
                    ) : null}
                  </>
                ) : null}
                <div className={styles.identityText}>
                  <h3>{resource.name ?? resource.identifier}</h3>
                  <span>{resource.apiKeyPreview ?? resource.identifier}</span>
                </div>
              </div>
              <span className={`${styles.status} ${resource.disabled ? styles.statusDisabled : styles.statusActive}`}>
                {resource.disabled ? <IconAlertTriangle size={14} /> : <IconCheckCircle2 size={14} />}
                {resource.disabled
                  ? t('providersPage.status.disabled')
                  : t('providersPage.status.active')}
              </span>
            </div>

            <dl className={styles.details}>
              <div>
                <dt>{t('providersPage.table.baseUrl')}</dt>
                <dd title={resource.baseUrl ?? undefined}>
                  {resource.baseUrl ?? t('providersPage.status.notSet')}
                </dd>
              </div>
              <div>
                <dt>{t('providersPage.table.prefix')}</dt>
                <dd>{resource.prefix ?? t('providersPage.status.none')}</dd>
              </div>
              <div>
                <dt>{t('providersPage.table.models')}</dt>
                <dd>
                  {isSponsor
                    ? (resource.flags.protocols ?? [])
                        .map((protocol) => t(`providersPage.sponsor.protocols.${protocol}`))
                        .join(' / ')
                    : resource.modelCount}
                </dd>
              </div>
              <div>
                <dt>{t('providersPage.table.metrics.headers')}</dt>
                <dd>{resource.headerCount}</dd>
              </div>
            </dl>

            {!isSponsor && resource.models.length > 0 ? (
              <div className={styles.models}>
                {modelPreview.map((model) => (
                  <span key={model}>{model}</span>
                ))}
                {modelOverflow > 0 ? <span>+{modelOverflow}</span> : null}
              </div>
            ) : null}

            {statusData ? (
              <div className={styles.health}>
                <div className={styles.stats}>
                  <span className={styles.success}>{t('stats.success')}: {stats.success}</span>
                  <span className={styles.failure}>{t('stats.failure')}: {stats.failure}</span>
                </div>
                <ProviderStatusBar statusData={statusData} styles={statusBarStyles} />
              </div>
            ) : null}

            <div className={styles.actions}>
              {onToggleDisabled ? (
                <ToggleSwitch
                  checked={!resource.disabled}
                  disabled={disableMutations}
                  onChange={(value) => onToggleDisabled(resource, !value)}
                  ariaLabel={
                    resource.disabled
                      ? t('providersPage.actions.enable')
                      : t('providersPage.actions.disable')
                  }
                />
              ) : null}
              <div className={styles.actionButtons}>
                <button type="button" onClick={() => onView(resource)} title={t('providersPage.actions.view')}>
                  <IconEye size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(resource)}
                  disabled={disableMutations}
                  title={t('providersPage.actions.edit')}
                >
                  <IconPencil size={16} />
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => onDelete(resource)}
                  disabled={disableMutations}
                  title={t('providersPage.actions.delete')}
                >
                  <IconTrash2 size={16} />
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
