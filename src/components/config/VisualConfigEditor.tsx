import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Input } from '@/components/ui/Input';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconActivity,
  IconCode,
  IconKey,
  IconRoute,
  IconScrollText,
  IconServer,
  IconSidebarQuota,
  type IconProps,
} from '@/components/ui/icons';
import { ConfigSection } from '@/components/config/ConfigSection';
import { useRegisterConfigSidebarNavigation } from '@/features/config/configSidebarNavigation';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type {
  CodexIdentityMode,
  PayloadFilterRule,
  PayloadParamValidationErrorCode,
  PayloadRule,
  VisualConfigFieldPath,
  VisualConfigValidationErrorCode,
  VisualConfigValidationErrors,
  VisualConfigValues,
} from '@/types/visualConfig';
import { CODEX_IDENTITY_MODES } from '@/types/visualConfig';
import {
  ApiKeysCardEditor,
  CodexContextWindowOverridesEditor,
  PayloadFilterRulesEditor,
  PayloadRulesEditor,
  UsageModelsEditor,
} from './VisualConfigEditorBlocks';
import styles from './VisualConfigEditor.module.scss';
import { useThemeStore } from '@/stores';
import iconAugment from '@/assets/icons/augment.svg';
import iconAugmentDark from '@/assets/icons/augment-dark.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconCodex from '@/assets/icons/codex.svg';
import iconGemini from '@/assets/icons/gemini.svg';
import iconKiro from '@/assets/icons/kiro.svg';

type VisualSectionId =
  | 'server'
  | 'auth'
  | 'system'
  | 'network'
  | 'streaming'
  | 'quota'
  | 'payload'
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'augment'
  | 'kiro';

type VisualSectionGroup = 'general' | 'request' | 'provider';

type VisualSection = {
  id: VisualSectionId;
  group: VisualSectionGroup;
  title: string;
  description: string;
  icon: ComponentType<IconProps>;
  errorCount: number;
};

interface VisualConfigEditorProps {
  values: VisualConfigValues;
  validationErrors?: VisualConfigValidationErrors;
  hasPayloadValidationErrors?: boolean;
  codexLicensedFeaturesAllowed?: boolean;
  disabled?: boolean;
  onChange: (values: Partial<VisualConfigValues>) => void;
  onAccessRulesSaved: () => Promise<void>;
}

function getValidationMessage(
  t: ReturnType<typeof useTranslation>['t'],
  errorCode?: VisualConfigValidationErrorCode | PayloadParamValidationErrorCode
) {
  if (!errorCode) return undefined;
  return t(`config_management.visual.validation.${errorCode}`);
}

type ToggleRowProps = {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
};

function ToggleRow({ title, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleCopy}>
        <div className={styles.toggleTitle}>{title}</div>
        {description ? <div className={styles.toggleDescription}>{description}</div> : null}
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} ariaLabel={title} />
    </div>
  );
}

function SectionGrid({ children }: { children: ReactNode }) {
  return <div className={styles.sectionGrid}>{children}</div>;
}

function SectionStack({ children }: { children: ReactNode }) {
  return <div className={styles.sectionStack}>{children}</div>;
}

// Brand logos shared with the OAuth page, wrapped so they fit the IconProps-based section icons.
function createBrandIcon(src: string | { light: string; dark: string }): ComponentType<IconProps> {
  return function BrandIcon({ size = 20 }: IconProps) {
    const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
    const themedSrc = typeof src === 'string' ? src : src[resolvedTheme];
    return <img src={themedSrc} width={size} height={size} alt="" aria-hidden="true" />;
  };
}

const IconBrandAugment = createBrandIcon({ light: iconAugment, dark: iconAugmentDark });
const IconBrandClaude = createBrandIcon(iconClaude);
const IconBrandCodex = createBrandIcon(iconCodex);
const IconBrandGemini = createBrandIcon(iconGemini);
const IconBrandKiro = createBrandIcon(iconKiro);

function ToggleList({ children }: { children: ReactNode }) {
  return <div className={styles.toggleList}>{children}</div>;
}

function SectionSubsection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.subsection}>
      <div className={styles.subsectionHeader}>
        <h3 className={styles.subsectionTitle}>{title}</h3>
        {description ? <p className={styles.subsectionDescription}>{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function FieldShell({
  label,
  labelAdornment,
  labelId,
  htmlFor,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  label: string;
  labelAdornment?: ReactNode;
  labelId?: string;
  htmlFor?: string;
  hint?: string;
  hintId?: string;
  error?: string;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.fieldShell}>
      <label id={labelId} htmlFor={htmlFor} className={styles.fieldLabel}>
        <span className={styles.fieldLabelText}>{label}</span>
        {labelAdornment}
      </label>
      {children}
      {error ? (
        <div id={errorId} className="error-box">
          {error}
        </div>
      ) : null}
      {hint ? (
        <div id={hintId} className={styles.fieldHint}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function VisualConfigEditor({
  values,
  validationErrors,
  hasPayloadValidationErrors = false,
  codexLicensedFeaturesAllowed = false,
  disabled = false,
  onChange,
  onAccessRulesSaved,
}: VisualConfigEditorProps) {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.isCurrentLayer : true;
  const isMobile = useMediaQuery('(max-width: 768px)');
  const shouldRenderCompactSectionNav = isMobile;
  const routingStrategyLabelId = useId();
  const routingStrategyHintId = `${routingStrategyLabelId}-hint`;
  const disableImageGenerationLabelId = useId();
  const disableImageGenerationHintId = `${disableImageGenerationLabelId}-hint`;
  const kiroCooldownStrategyLabelId = useId();
  const kiroCooldownStrategyHintId = `${kiroCooldownStrategyLabelId}-hint`;
  const codexIdentityModeLabelId = useId();
  const codexIdentityModeHintId = `${codexIdentityModeLabelId}-hint`;
  const keepaliveInputId = useId();
  const keepaliveHintId = `${keepaliveInputId}-hint`;
  const keepaliveErrorId = `${keepaliveInputId}-error`;
  const nonstreamKeepaliveInputId = useId();
  const nonstreamKeepaliveHintId = `${nonstreamKeepaliveInputId}-hint`;
  const nonstreamKeepaliveErrorId = `${nonstreamKeepaliveInputId}-error`;
  const [activeSectionId, setActiveSectionId] = useState<VisualSectionId>('server');
  const sectionRefs = useRef<Partial<Record<VisualSectionId, HTMLElement | null>>>({});
  const jumpLockRef = useRef<{ id: VisualSectionId; timer: number | null } | null>(null);
  const mobileNavScrollerRef = useRef<HTMLDivElement | null>(null);
  const mobileNavButtonRefs = useRef<Partial<Record<VisualSectionId, HTMLButtonElement | null>>>(
    {}
  );

  const isKeepaliveDisabled =
    values.streaming.keepaliveSeconds === '' || values.streaming.keepaliveSeconds === '0';
  const isNonstreamKeepaliveDisabled =
    values.streaming.nonstreamKeepaliveInterval === '' ||
    values.streaming.nonstreamKeepaliveInterval === '0';

  const portError = getValidationMessage(t, validationErrors?.port);
  const logsMaxSizeError = getValidationMessage(t, validationErrors?.logsMaxTotalSizeMb);
  const errorLogsMaxFilesError = getValidationMessage(t, validationErrors?.errorLogsMaxFiles);
  const maxRequestBodyMbError = getValidationMessage(t, validationErrors?.maxRequestBodyMb);
  const requestRetryError = getValidationMessage(t, validationErrors?.requestRetry);
  const maxRetryCredentialsError = getValidationMessage(t, validationErrors?.maxRetryCredentials);
  const maxRetryIntervalError = getValidationMessage(t, validationErrors?.maxRetryInterval);
  const authAutoRefreshWorkersError = getValidationMessage(
    t,
    validationErrors?.authAutoRefreshWorkers
  );
  const kiroPerAccountRpmLimitError = getValidationMessage(
    t,
    validationErrors?.kiroPerAccountRpmLimit
  );
  const kiroFreeRpmLimitError = getValidationMessage(t, validationErrors?.kiroFreeRpmLimit);
  const kiroProRpmLimitError = getValidationMessage(t, validationErrors?.kiroProRpmLimit);
  const kiroBaseCooldownSecondsError = getValidationMessage(
    t,
    validationErrors?.kiroBaseCooldownSeconds
  );
  const kiroMaxCooldownSecondsError = getValidationMessage(
    t,
    validationErrors?.kiroMaxCooldownSeconds
  );
  const kiroConsecutiveErrorCooldownThresholdError = getValidationMessage(
    t,
    validationErrors?.kiroConsecutiveErrorCooldownThreshold
  );
  const kiroConsecutiveErrorDisableThresholdError = getValidationMessage(
    t,
    validationErrors?.kiroConsecutiveErrorDisableThreshold
  );
  const keepaliveError = getValidationMessage(t, validationErrors?.['streaming.keepaliveSeconds']);
  const bootstrapRetriesError = getValidationMessage(
    t,
    validationErrors?.['streaming.bootstrapRetries']
  );
  const nonstreamKeepaliveError = getValidationMessage(
    t,
    validationErrors?.['streaming.nonstreamKeepaliveInterval']
  );
  const codexContextWindowOverridesError = getValidationMessage(
    t,
    validationErrors?.codexModelContextWindowOverrides
  );

  const handleApiKeysTextChange = useCallback(
    (apiKeysText: string) => onChange({ apiKeysText }),
    [onChange]
  );
  const handlePayloadDefaultRulesChange = useCallback(
    (payloadDefaultRules: PayloadRule[]) => onChange({ payloadDefaultRules }),
    [onChange]
  );
  const handlePayloadDefaultRawRulesChange = useCallback(
    (payloadDefaultRawRules: PayloadRule[]) => onChange({ payloadDefaultRawRules }),
    [onChange]
  );
  const handlePayloadOverrideRulesChange = useCallback(
    (payloadOverrideRules: PayloadRule[]) => onChange({ payloadOverrideRules }),
    [onChange]
  );
  const handlePayloadOverrideRawRulesChange = useCallback(
    (payloadOverrideRawRules: PayloadRule[]) => onChange({ payloadOverrideRawRules }),
    [onChange]
  );
  const handlePayloadFilterRulesChange = useCallback(
    (payloadFilterRules: PayloadFilterRule[]) => onChange({ payloadFilterRules }),
    [onChange]
  );
  const handleUsageModelsChange = useCallback(
    (usageModels: VisualConfigValues['usageModels']) => onChange({ usageModels }),
    [onChange]
  );
  const handleCodexContextWindowOverridesChange = useCallback(
    (codexModelContextWindowOverrides: VisualConfigValues['codexModelContextWindowOverrides']) =>
      onChange({ codexModelContextWindowOverrides }),
    [onChange]
  );

  const countErrors = useCallback(
    (fields: VisualConfigFieldPath[]) =>
      fields.reduce((total, field) => total + (validationErrors?.[field] ? 1 : 0), 0),
    [validationErrors]
  );

  const sections = useMemo<VisualSection[]>(
    () => [
      {
        id: 'server',
        group: 'general',
        title: t('config_management.visual.sections.server.title'),
        description: t('config_management.visual.sections.server.description'),
        icon: IconServer,
        errorCount: countErrors(['port']),
      },
      {
        id: 'auth',
        group: 'general',
        title: t('config_management.visual.sections.auth.title'),
        description: t('config_management.visual.sections.auth.description'),
        icon: IconKey,
        errorCount: countErrors(['authAutoRefreshWorkers']),
      },
      {
        id: 'system',
        group: 'general',
        title: t('config_management.visual.sections.system.title'),
        description: t('config_management.visual.sections.system.description'),
        icon: IconScrollText,
        errorCount: countErrors(['logsMaxTotalSizeMb', 'errorLogsMaxFiles']),
      },
      {
        id: 'network',
        group: 'request',
        title: t('config_management.visual.sections.network.title'),
        description: t('config_management.visual.sections.network.description'),
        icon: IconRoute,
        errorCount: countErrors([
          'requestRetry',
          'maxRetryCredentials',
          'maxRetryInterval',
          'maxRequestBodyMb',
        ]),
      },
      {
        id: 'streaming',
        group: 'request',
        title: t('config_management.visual.sections.streaming.title'),
        description: t('config_management.visual.sections.streaming.description'),
        icon: IconActivity,
        errorCount: countErrors([
          'streaming.keepaliveSeconds',
          'streaming.bootstrapRetries',
          'streaming.nonstreamKeepaliveInterval',
        ]),
      },
      {
        id: 'quota',
        group: 'request',
        title: t('config_management.visual.sections.quota.title'),
        description: t('config_management.visual.sections.quota.description'),
        icon: IconSidebarQuota,
        errorCount: 0,
      },
      {
        id: 'payload',
        group: 'request',
        title: t('config_management.visual.sections.payload.title'),
        description: t('config_management.visual.sections.payload.description'),
        icon: IconCode,
        errorCount: hasPayloadValidationErrors ? 1 : 0,
      },
      {
        id: 'claude',
        group: 'provider',
        title: t('config_management.visual.sections.claude.title'),
        description: t('config_management.visual.sections.claude.description'),
        icon: IconBrandClaude,
        errorCount: 0,
      },
      {
        id: 'codex',
        group: 'provider',
        title: t('config_management.visual.sections.codex.title'),
        description: t('config_management.visual.sections.codex.description'),
        icon: IconBrandCodex,
        errorCount: countErrors(['codexModelContextWindowOverrides']),
      },
      {
        id: 'gemini',
        group: 'provider',
        title: t('config_management.visual.sections.gemini.title'),
        description: t('config_management.visual.sections.gemini.description'),
        icon: IconBrandGemini,
        errorCount: 0,
      },
      {
        id: 'augment',
        group: 'provider',
        title: t('config_management.visual.sections.augment.title'),
        description: t('config_management.visual.sections.augment.description'),
        icon: IconBrandAugment,
        errorCount: 0,
      },
      {
        id: 'kiro',
        group: 'provider',
        title: t('config_management.visual.sections.kiro.title'),
        description: t('config_management.visual.sections.kiro.description'),
        icon: IconBrandKiro,
        errorCount: countErrors([
          'kiroPerAccountRpmLimit',
          'kiroFreeRpmLimit',
          'kiroProRpmLimit',
          'kiroBaseCooldownSeconds',
          'kiroMaxCooldownSeconds',
          'kiroConsecutiveErrorCooldownThreshold',
          'kiroConsecutiveErrorDisableThreshold',
        ]),
      },
    ],
    [countErrors, hasPayloadValidationErrors, t]
  );

  useEffect(() => {
    if (!isCurrentLayer) return undefined;

    const releaseJumpLock = () => {
      const lock = jumpLockRef.current;
      if (!lock) return;
      if (lock.timer !== null) window.clearTimeout(lock.timer);
      jumpLockRef.current = null;
    };

    // After a click-initiated smooth scroll settles, keep the clicked section highlighted even
    // when a short trailing section cannot be scrolled to the activation line.
    const settleJumpLock = (delay: number) => {
      const lock = jumpLockRef.current;
      if (!lock) return;
      if (lock.timer !== null) window.clearTimeout(lock.timer);
      lock.timer = window.setTimeout(() => {
        const target = lock.id;
        jumpLockRef.current = null;
        setActiveSectionId(target);
      }, delay);
    };

    // The active section is the last one whose top has crossed the activation line. Ratio-based
    // IntersectionObserver thresholds never fire for tall sections (e.g. Codex), so a shorter
    // neighbour (Claude) used to win after a jump.
    let frame = 0;
    const updateActiveFromScroll = () => {
      frame = 0;
      if (jumpLockRef.current) {
        settleJumpLock(150);
        return;
      }
      const line = window.innerHeight * 0.3;
      let current: VisualSectionId = sections[0]?.id ?? 'server';
      for (const section of sections) {
        const element = sectionRefs.current[section.id];
        if (element && element.getBoundingClientRect().top <= line) current = section.id;
      }
      setActiveSectionId(current);
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(updateActiveFromScroll);
    };

    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    // Manual input takes over from a pending jump.
    for (const type of ['wheel', 'touchstart', 'keydown'] as const) {
      window.addEventListener(type, releaseJumpLock, { passive: true });
    }
    onScroll();

    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      for (const type of ['wheel', 'touchstart', 'keydown'] as const) {
        window.removeEventListener(type, releaseJumpLock);
      }
      if (frame !== 0) window.cancelAnimationFrame(frame);
      releaseJumpLock();
    };
  }, [isCurrentLayer, sections]);

  useEffect(() => {
    if (!isCurrentLayer || !shouldRenderCompactSectionNav) return;
    const scroller = mobileNavScrollerRef.current;
    const button = mobileNavButtonRefs.current[activeSectionId];
    if (!scroller || !button) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const centeredLeft =
      scroller.scrollLeft +
      (buttonRect.left - scrollerRect.left) -
      (scroller.clientWidth - buttonRect.width) / 2;
    const maxScrollLeft = Math.max(scroller.scrollWidth - scroller.clientWidth, 0);
    const targetLeft = Math.min(Math.max(centeredLeft, 0), maxScrollLeft);

    scroller.scrollTo({
      left: targetLeft,
      behavior: 'smooth',
    });
  }, [activeSectionId, isCurrentLayer, shouldRenderCompactSectionNav]);

  const handleSectionJump = useCallback((sectionId: VisualSectionId) => {
    setActiveSectionId(sectionId);
    if (jumpLockRef.current?.timer != null) window.clearTimeout(jumpLockRef.current.timer);
    // Scroll events keep postponing the release; this timer covers a jump that does not scroll.
    jumpLockRef.current = {
      id: sectionId,
      timer: window.setTimeout(() => {
        jumpLockRef.current = null;
      }, 400),
    };
    sectionRefs.current[sectionId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const configSidebarNavigation = useMemo(
    () => ({
      activeId: activeSectionId,
      items: sections.map((section) => {
        const Icon = section.icon;
        return {
          id: section.id,
          title: section.title,
          description: section.description,
          group: t(`config_management.visual.groups.${section.group}`),
          icon: <Icon size={14} />,
          errorCount: section.errorCount,
          onSelect: () => handleSectionJump(section.id),
        };
      }),
    }),
    [activeSectionId, handleSectionJump, sections, t]
  );
  const hasSidebarNavigationHost = useRegisterConfigSidebarNavigation(configSidebarNavigation);
  const shouldRenderSideSectionNav = !isMobile && !hasSidebarNavigationHost;

  const navContent = (
    <div className={styles.navList}>
      {sections.map((section, index) => {
        const Icon = section.icon;
        const showGroupHeading = section.group !== sections[index - 1]?.group;

        return (
          <Fragment key={section.id}>
            {showGroupHeading ? (
              <div className={styles.navGroupHeading}>
                {t(`config_management.visual.groups.${section.group}`)}
              </div>
            ) : null}
            <button
              type="button"
              className={`${styles.navButton} ${
                activeSectionId === section.id ? styles.navButtonActive : ''
              }`}
              onClick={() => handleSectionJump(section.id)}
            >
              <span className={styles.navIcon}>
                <Icon size={14} />
              </span>
              <span className={styles.navMain}>
                <span className={styles.navHeadingRow}>
                  <span className={styles.navLabelWrap}>
                    <span className={styles.navLabel}>{section.title}</span>
                  </span>
                  {section.errorCount > 0 ? (
                    <span className={styles.navBadge} aria-hidden="true">
                      {section.errorCount}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );

  return (
    <div className={styles.visualEditor}>
      <div
        className={`${styles.workspace} ${
          hasSidebarNavigationHost ? styles.workspaceAggregated : ''
        }`}
      >
        {shouldRenderCompactSectionNav ? (
          <div className={styles.mobileSectionNav}>
            <div
              ref={mobileNavScrollerRef}
              className={styles.mobileSectionNavScroller}
              aria-label={t('config_management.visual.quick_jump', { defaultValue: '快速跳转' })}
            >
              {sections.map((section) => {
                const Icon = section.icon;

                return (
                  <button
                    key={section.id}
                    ref={(node) => {
                      mobileNavButtonRefs.current[section.id] = node;
                    }}
                    type="button"
                    className={`${styles.mobileSectionNavButton} ${
                      activeSectionId === section.id ? styles.mobileSectionNavButtonActive : ''
                    }`}
                    onClick={() => handleSectionJump(section.id)}
                  >
                    <span className={styles.mobileSectionNavIcon}>
                      <Icon size={13} />
                    </span>
                    <span className={styles.mobileSectionNavLabel}>{section.title}</span>
                    {section.errorCount > 0 ? (
                      <span className={styles.mobileSectionNavBadge} aria-hidden="true">
                        {section.errorCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {shouldRenderSideSectionNav ? (
          <aside
            className={styles.sidebar}
            aria-label={t('config_management.visual.quick_jump', { defaultValue: '快速跳转' })}
          >
            <div className={styles.sidebarRail}>{navContent}</div>
          </aside>
        ) : null}

        <div className={styles.sections}>
          <ConfigSection
            id="server"
            ref={(node) => {
              sectionRefs.current.server = node;
            }}
            icon={<IconServer size={16} />}
            title={t('config_management.visual.sections.server.title')}
            description={t('config_management.visual.sections.server.description')}
          >
            <SectionStack>
              <SectionGrid>
                <Input
                  label={t('config_management.visual.sections.server.host')}
                  placeholder="0.0.0.0"
                  value={values.host}
                  onChange={(e) => onChange({ host: e.target.value })}
                  disabled={disabled}
                />
                <Input
                  label={t('config_management.visual.sections.server.port')}
                  type="number"
                  placeholder="8317"
                  value={values.port}
                  onChange={(e) => onChange({ port: e.target.value })}
                  disabled={disabled}
                  error={portError}
                />
              </SectionGrid>
              <SectionSubsection
                title={t('config_management.visual.sections.tls.title')}
                description={t('config_management.visual.sections.tls.description')}
              >
                <SectionStack>
                  <ToggleList>
                    <ToggleRow
                      title={t('config_management.visual.sections.tls.enable')}
                      description={t('config_management.visual.sections.tls.enable_desc')}
                      checked={values.tlsEnable}
                      disabled={disabled}
                      onChange={(tlsEnable) => onChange({ tlsEnable })}
                    />
                  </ToggleList>
                  {values.tlsEnable ? (
                    <SectionGrid>
                      <Input
                        label={t('config_management.visual.sections.tls.cert')}
                        placeholder="/path/to/cert.pem"
                        value={values.tlsCert}
                        onChange={(e) => onChange({ tlsCert: e.target.value })}
                        disabled={disabled}
                      />
                      <Input
                        label={t('config_management.visual.sections.tls.key')}
                        placeholder="/path/to/key.pem"
                        value={values.tlsKey}
                        onChange={(e) => onChange({ tlsKey: e.target.value })}
                        disabled={disabled}
                      />
                    </SectionGrid>
                  ) : null}
                </SectionStack>
              </SectionSubsection>
              <SectionSubsection
                title={t('config_management.visual.sections.remote.title')}
                description={t('config_management.visual.sections.remote.description')}
              >
                <SectionStack>
                  <ToggleList>
                    <ToggleRow
                      title={t('config_management.visual.sections.remote.allow_remote')}
                      description={t('config_management.visual.sections.remote.allow_remote_desc')}
                      checked={values.rmAllowRemote}
                      disabled={disabled}
                      onChange={(rmAllowRemote) => onChange({ rmAllowRemote })}
                    />
                    <ToggleRow
                      title={t('config_management.visual.sections.remote.disable_panel')}
                      description={t('config_management.visual.sections.remote.disable_panel_desc')}
                      checked={values.rmDisableControlPanel}
                      disabled={disabled}
                      onChange={(rmDisableControlPanel) => onChange({ rmDisableControlPanel })}
                    />
                    <ToggleRow
                      title={t(
                        'config_management.visual.sections.remote.disable_auto_update_panel'
                      )}
                      description={t(
                        'config_management.visual.sections.remote.disable_auto_update_panel_desc'
                      )}
                      checked={values.rmDisableAutoUpdatePanel}
                      disabled={disabled}
                      onChange={(rmDisableAutoUpdatePanel) =>
                        onChange({ rmDisableAutoUpdatePanel })
                      }
                    />
                  </ToggleList>
                  <SectionGrid>
                    <Input
                      label={t('config_management.visual.sections.remote.secret_key')}
                      type="password"
                      placeholder={t(
                        'config_management.visual.sections.remote.secret_key_placeholder'
                      )}
                      value={values.rmSecretKey}
                      onChange={(e) => onChange({ rmSecretKey: e.target.value })}
                      disabled={disabled}
                    />
                    <Input
                      label={t('config_management.visual.sections.remote.panel_repo')}
                      placeholder="https://github.com/agassiz/CPA-Manager-Plus"
                      value={values.rmPanelRepo}
                      onChange={(e) => onChange({ rmPanelRepo: e.target.value })}
                      disabled={disabled}
                    />
                  </SectionGrid>
                </SectionStack>
              </SectionSubsection>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="auth"
            ref={(node) => {
              sectionRefs.current.auth = node;
            }}
            icon={<IconKey size={16} />}
            title={t('config_management.visual.sections.auth.title')}
            description={t('config_management.visual.sections.auth.description')}
          >
            <SectionStack>
              <SectionGrid>
                <Input
                  label={t('config_management.visual.sections.auth.auth_dir')}
                  placeholder="~/.cli-proxy-api"
                  value={values.authDir}
                  onChange={(e) => onChange({ authDir: e.target.value })}
                  disabled={disabled}
                  hint={t('config_management.visual.sections.auth.auth_dir_hint')}
                />
                <Input
                  label={t('config_management.visual.sections.network.auth_auto_refresh_workers')}
                  type="number"
                  placeholder="16"
                  value={values.authAutoRefreshWorkers}
                  onChange={(e) => onChange({ authAutoRefreshWorkers: e.target.value })}
                  disabled={disabled}
                  hint={t(
                    'config_management.visual.sections.network.auth_auto_refresh_workers_hint'
                  )}
                  error={authAutoRefreshWorkersError}
                />
              </SectionGrid>
              <div className={styles.subsection}>
                <ApiKeysCardEditor
                  value={values.apiKeysText}
                  accessRules={values.apiKeyAccessRules}
                  disabled={disabled}
                  onChange={handleApiKeysTextChange}
                  onAccessRulesSaved={onAccessRulesSaved}
                />
              </div>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="system"
            ref={(node) => {
              sectionRefs.current.system = node;
            }}
            icon={<IconScrollText size={16} />}
            title={t('config_management.visual.sections.system.title')}
            description={t('config_management.visual.sections.system.description')}
          >
            <SectionStack>
              <ToggleList>
                <ToggleRow
                  title={t('config_management.visual.sections.system.debug')}
                  description={t('config_management.visual.sections.system.debug_desc')}
                  checked={values.debug}
                  disabled={disabled}
                  onChange={(debug) => onChange({ debug })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.system.commercial_mode')}
                  description={t('config_management.visual.sections.system.commercial_mode_desc')}
                  checked={values.commercialMode}
                  disabled={disabled}
                  onChange={(commercialMode) => onChange({ commercialMode })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.system.plugins_enabled')}
                  description={t('config_management.visual.sections.system.plugins_enabled_desc')}
                  checked={values.pluginsEnabled}
                  disabled={disabled}
                  onChange={(pluginsEnabled) => onChange({ pluginsEnabled })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.system.logging_to_file')}
                  description={t('config_management.visual.sections.system.logging_to_file_desc')}
                  checked={values.loggingToFile}
                  disabled={disabled}
                  onChange={(loggingToFile) => onChange({ loggingToFile })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.system.request_log')}
                  description={t('config_management.visual.sections.system.request_log_desc')}
                  checked={values.requestLog}
                  disabled={disabled}
                  onChange={(requestLog) => onChange({ requestLog })}
                />
              </ToggleList>
              <SectionGrid>
                <Input
                  label={t('config_management.visual.sections.system.logs_max_size')}
                  type="number"
                  placeholder="0"
                  value={values.logsMaxTotalSizeMb}
                  onChange={(e) => onChange({ logsMaxTotalSizeMb: e.target.value })}
                  disabled={disabled}
                  error={logsMaxSizeError}
                />
                <Input
                  label={t('config_management.visual.sections.system.error_logs_max_files')}
                  type="number"
                  placeholder="5"
                  value={values.errorLogsMaxFiles}
                  onChange={(e) => onChange({ errorLogsMaxFiles: e.target.value })}
                  disabled={disabled}
                  error={errorLogsMaxFilesError}
                />
              </SectionGrid>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="network"
            ref={(node) => {
              sectionRefs.current.network = node;
            }}
            icon={<IconRoute size={16} />}
            title={t('config_management.visual.sections.network.title')}
            description={t('config_management.visual.sections.network.description')}
          >
            <SectionStack>
              <SectionGrid>
                <Input
                  label={t('config_management.visual.sections.network.proxy_url')}
                  placeholder="socks5://user:pass@127.0.0.1:1080/"
                  value={values.proxyUrl}
                  onChange={(e) => onChange({ proxyUrl: e.target.value })}
                  disabled={disabled}
                />
                <Input
                  label={t('config_management.visual.sections.system.max_request_body_mb')}
                  type="number"
                  placeholder="16"
                  value={values.maxRequestBodyMb}
                  onChange={(e) => onChange({ maxRequestBodyMb: e.target.value })}
                  disabled={disabled}
                  hint={t('config_management.visual.sections.system.max_request_body_mb_hint')}
                  error={maxRequestBodyMbError}
                />
                <Input
                  label={t('config_management.visual.sections.network.request_retry')}
                  type="number"
                  placeholder="3"
                  value={values.requestRetry}
                  onChange={(e) => onChange({ requestRetry: e.target.value })}
                  disabled={disabled}
                  error={requestRetryError}
                />
                <Input
                  label={t('config_management.visual.sections.network.max_retry_credentials')}
                  type="number"
                  placeholder="0"
                  value={values.maxRetryCredentials}
                  onChange={(e) => onChange({ maxRetryCredentials: e.target.value })}
                  disabled={disabled}
                  hint={t('config_management.visual.sections.network.max_retry_credentials_hint')}
                  error={maxRetryCredentialsError}
                />
                <Input
                  label={t('config_management.visual.sections.network.max_retry_interval')}
                  type="number"
                  placeholder="30"
                  value={values.maxRetryInterval}
                  onChange={(e) => onChange({ maxRetryInterval: e.target.value })}
                  disabled={disabled}
                  error={maxRetryIntervalError}
                />
                <FieldShell
                  label={t('config_management.visual.sections.network.disable_image_generation')}
                  labelId={disableImageGenerationLabelId}
                  hint={t(
                    'config_management.visual.sections.network.disable_image_generation_hint'
                  )}
                  hintId={disableImageGenerationHintId}
                >
                  <Select
                    value={values.disableImageGeneration}
                    options={[
                      {
                        value: 'false',
                        label: t(
                          'config_management.visual.sections.network.disable_image_generation_false'
                        ),
                      },
                      {
                        value: 'true',
                        label: t(
                          'config_management.visual.sections.network.disable_image_generation_true'
                        ),
                      },
                      {
                        value: 'chat',
                        label: t(
                          'config_management.visual.sections.network.disable_image_generation_chat'
                        ),
                      },
                    ]}
                    id={`${disableImageGenerationLabelId}-select`}
                    disabled={disabled}
                    ariaLabelledBy={disableImageGenerationLabelId}
                    ariaDescribedBy={disableImageGenerationHintId}
                    onChange={(nextValue) =>
                      onChange({
                        disableImageGeneration:
                          nextValue as VisualConfigValues['disableImageGeneration'],
                      })
                    }
                  />
                </FieldShell>
                <FieldShell
                  label={t('config_management.visual.sections.network.routing_strategy')}
                  labelId={routingStrategyLabelId}
                  hint={t('config_management.visual.sections.network.routing_strategy_hint')}
                  hintId={routingStrategyHintId}
                >
                  <Select
                    value={values.routingStrategy}
                    options={[
                      {
                        value: 'round-robin',
                        label: t('config_management.visual.sections.network.strategy_round_robin'),
                      },
                      {
                        value: 'fill-first',
                        label: t('config_management.visual.sections.network.strategy_fill_first'),
                      },
                    ]}
                    id={`${routingStrategyLabelId}-select`}
                    disabled={disabled}
                    ariaLabelledBy={routingStrategyLabelId}
                    ariaDescribedBy={routingStrategyHintId}
                    onChange={(nextValue) =>
                      onChange({
                        routingStrategy: nextValue as VisualConfigValues['routingStrategy'],
                      })
                    }
                  />
                </FieldShell>
                <Input
                  label={t('config_management.visual.sections.network.session_affinity_ttl')}
                  placeholder="1h"
                  value={values.routingSessionAffinityTTL}
                  onChange={(e) => onChange({ routingSessionAffinityTTL: e.target.value })}
                  disabled={disabled}
                />
                <Input
                  label={t('config_management.visual.sections.network.image_fallback_model')}
                  value={values.imageFallbackModel}
                  placeholder="gpt-5.6-luna"
                  disabled={disabled}
                  hint={t('config_management.visual.sections.network.image_fallback_model_hint')}
                  onChange={(event) => onChange({ imageFallbackModel: event.target.value })}
                />
              </SectionGrid>
              <ToggleList>
                <ToggleRow
                  title={t('config_management.visual.sections.network.force_model_prefix')}
                  description={t(
                    'config_management.visual.sections.network.force_model_prefix_desc'
                  )}
                  checked={values.forceModelPrefix}
                  disabled={disabled}
                  onChange={(forceModelPrefix) => onChange({ forceModelPrefix })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.network.sort_model_list')}
                  description={t('config_management.visual.sections.network.sort_model_list_desc')}
                  checked={values.sortModelList}
                  disabled={disabled}
                  onChange={(sortModelList) => onChange({ sortModelList })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.network.session_affinity')}
                  checked={values.routingSessionAffinity}
                  disabled={disabled}
                  onChange={(routingSessionAffinity) => onChange({ routingSessionAffinity })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.network.passthrough_headers')}
                  description={t(
                    'config_management.visual.sections.network.passthrough_headers_desc'
                  )}
                  checked={values.passthroughHeaders}
                  disabled={disabled}
                  onChange={(passthroughHeaders) => onChange({ passthroughHeaders })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.network.hide_upstream_error_details')}
                  description={t(
                    'config_management.visual.sections.network.hide_upstream_error_details_desc'
                  )}
                  checked={values.hideUpstreamErrorDetails}
                  disabled={disabled}
                  onChange={(hideUpstreamErrorDetails) => onChange({ hideUpstreamErrorDetails })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.network.disable_cooling')}
                  description={t('config_management.visual.sections.network.disable_cooling_desc')}
                  checked={values.disableCooling}
                  disabled={disabled}
                  onChange={(disableCooling) => onChange({ disableCooling })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.network.disable_auto_disable')}
                  description={t(
                    'config_management.visual.sections.network.disable_auto_disable_desc'
                  )}
                  checked={values.disableAutoDisable}
                  disabled={disabled}
                  onChange={(disableAutoDisable) => onChange({ disableAutoDisable })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.network.ws_auth')}
                  description={t('config_management.visual.sections.network.ws_auth_desc')}
                  checked={values.wsAuth}
                  disabled={disabled}
                  onChange={(wsAuth) => onChange({ wsAuth })}
                />
              </ToggleList>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="streaming"
            ref={(node) => {
              sectionRefs.current.streaming = node;
            }}
            icon={<IconActivity size={16} />}
            title={t('config_management.visual.sections.streaming.title')}
            description={t('config_management.visual.sections.streaming.description')}
          >
            <SectionStack>
              <SectionGrid>
                <FieldShell
                  label={t('config_management.visual.sections.streaming.keepalive_seconds')}
                  htmlFor={keepaliveInputId}
                  hint={t('config_management.visual.sections.streaming.keepalive_hint')}
                  hintId={keepaliveHintId}
                  error={keepaliveError}
                  errorId={keepaliveErrorId}
                >
                  <div className={styles.fieldControl}>
                    <input
                      id={keepaliveInputId}
                      className="input"
                      type="number"
                      placeholder="0"
                      value={values.streaming.keepaliveSeconds}
                      onChange={(e) =>
                        onChange({
                          streaming: {
                            ...values.streaming,
                            keepaliveSeconds: e.target.value,
                          },
                        })
                      }
                      disabled={disabled}
                    />
                    {isKeepaliveDisabled ? (
                      <span className={styles.inlinePill}>
                        {t('config_management.visual.sections.streaming.disabled')}
                      </span>
                    ) : null}
                  </div>
                </FieldShell>

                <Input
                  label={t('config_management.visual.sections.streaming.bootstrap_retries')}
                  type="number"
                  placeholder="1"
                  value={values.streaming.bootstrapRetries}
                  onChange={(e) =>
                    onChange({
                      streaming: {
                        ...values.streaming,
                        bootstrapRetries: e.target.value,
                      },
                    })
                  }
                  disabled={disabled}
                  hint={t('config_management.visual.sections.streaming.bootstrap_hint')}
                  error={bootstrapRetriesError}
                />
              </SectionGrid>

              <SectionGrid>
                <FieldShell
                  label={t('config_management.visual.sections.streaming.nonstream_keepalive')}
                  htmlFor={nonstreamKeepaliveInputId}
                  hint={t('config_management.visual.sections.streaming.nonstream_keepalive_hint')}
                  hintId={nonstreamKeepaliveHintId}
                  error={nonstreamKeepaliveError}
                  errorId={nonstreamKeepaliveErrorId}
                >
                  <div className={styles.fieldControl}>
                    <input
                      id={nonstreamKeepaliveInputId}
                      className="input"
                      type="number"
                      placeholder="0"
                      value={values.streaming.nonstreamKeepaliveInterval}
                      onChange={(e) =>
                        onChange({
                          streaming: {
                            ...values.streaming,
                            nonstreamKeepaliveInterval: e.target.value,
                          },
                        })
                      }
                      disabled={disabled}
                    />
                    {isNonstreamKeepaliveDisabled ? (
                      <span className={styles.inlinePill}>
                        {t('config_management.visual.sections.streaming.disabled')}
                      </span>
                    ) : null}
                  </div>
                </FieldShell>
              </SectionGrid>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="quota"
            ref={(node) => {
              sectionRefs.current.quota = node;
            }}
            icon={<IconSidebarQuota size={16} />}
            title={t('config_management.visual.sections.quota.title')}
            description={t('config_management.visual.sections.quota.description')}
          >
            <ToggleList>
              <ToggleRow
                title={t('config_management.visual.sections.quota.switch_project')}
                description={t('config_management.visual.sections.quota.switch_project_desc')}
                checked={values.quotaSwitchProject}
                disabled={disabled}
                onChange={(quotaSwitchProject) => onChange({ quotaSwitchProject })}
              />
              <ToggleRow
                title={t('config_management.visual.sections.quota.switch_preview_model')}
                description={t('config_management.visual.sections.quota.switch_preview_model_desc')}
                checked={values.quotaSwitchPreviewModel}
                disabled={disabled}
                onChange={(quotaSwitchPreviewModel) => onChange({ quotaSwitchPreviewModel })}
              />
              <ToggleRow
                title={t('config_management.visual.sections.quota.antigravity_credits')}
                description={t('config_management.visual.sections.quota.antigravity_credits_desc')}
                checked={values.quotaAntigravityCredits}
                disabled={disabled}
                onChange={(quotaAntigravityCredits) => onChange({ quotaAntigravityCredits })}
              />
            </ToggleList>
          </ConfigSection>

          <ConfigSection
            id="payload"
            ref={(node) => {
              sectionRefs.current.payload = node;
            }}
            icon={<IconCode size={16} />}
            title={t('config_management.visual.sections.payload.title')}
            description={t('config_management.visual.sections.payload.description')}
          >
            <SectionStack>
              <SectionSubsection
                title={t('config_management.visual.sections.payload.default_rules')}
                description={t('config_management.visual.sections.payload.default_rules_desc')}
              >
                <PayloadRulesEditor
                  value={values.payloadDefaultRules}
                  disabled={disabled}
                  onChange={handlePayloadDefaultRulesChange}
                />
              </SectionSubsection>

              <SectionSubsection
                title={t('config_management.visual.sections.payload.default_raw_rules')}
                description={t('config_management.visual.sections.payload.default_raw_rules_desc')}
              >
                <PayloadRulesEditor
                  value={values.payloadDefaultRawRules}
                  disabled={disabled}
                  rawJsonValues
                  onChange={handlePayloadDefaultRawRulesChange}
                />
              </SectionSubsection>

              <SectionSubsection
                title={t('config_management.visual.sections.payload.override_rules')}
                description={t('config_management.visual.sections.payload.override_rules_desc')}
              >
                <PayloadRulesEditor
                  value={values.payloadOverrideRules}
                  disabled={disabled}
                  protocolFirst
                  onChange={handlePayloadOverrideRulesChange}
                />
              </SectionSubsection>

              <SectionSubsection
                title={t('config_management.visual.sections.payload.override_raw_rules')}
                description={t('config_management.visual.sections.payload.override_raw_rules_desc')}
              >
                <PayloadRulesEditor
                  value={values.payloadOverrideRawRules}
                  disabled={disabled}
                  protocolFirst
                  rawJsonValues
                  onChange={handlePayloadOverrideRawRulesChange}
                />
              </SectionSubsection>

              <SectionSubsection
                title={t('config_management.visual.sections.payload.filter_rules')}
                description={t('config_management.visual.sections.payload.filter_rules_desc')}
              >
                <PayloadFilterRulesEditor
                  value={values.payloadFilterRules}
                  disabled={disabled}
                  onChange={handlePayloadFilterRulesChange}
                />
              </SectionSubsection>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="claude"
            ref={(node) => {
              sectionRefs.current.claude = node;
            }}
            icon={<IconBrandClaude size={16} />}
            title={t('config_management.visual.sections.claude.title')}
            description={t('config_management.visual.sections.claude.description')}
          >
            <SectionStack>
              <ToggleList>
                <ToggleRow
                  title={t('config_management.visual.sections.network.disable_claude_cloak_mode')}
                  description={t(
                    'config_management.visual.sections.network.disable_claude_cloak_mode_desc'
                  )}
                  checked={values.disableClaudeCloakMode}
                  disabled={disabled}
                  onChange={(disableClaudeCloakMode) => onChange({ disableClaudeCloakMode })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.network.experimental_cch_signing')}
                  description={t(
                    'config_management.visual.sections.network.experimental_cch_signing_desc'
                  )}
                  checked={values.experimentalCCHSigning}
                  disabled={disabled}
                  onChange={(experimentalCCHSigning) => onChange({ experimentalCCHSigning })}
                />
              </ToggleList>
              <SectionSubsection
                title={t('config_management.visual.sections.headers.claude_title')}
                description={t('config_management.visual.sections.headers.description')}
              >
                <SectionStack>
                  <SectionGrid>
                    <Input
                      label={t('config_management.visual.sections.headers.user_agent')}
                      value={values.claudeHeaderUserAgent}
                      onChange={(e) => onChange({ claudeHeaderUserAgent: e.target.value })}
                      disabled={disabled}
                    />
                    <Input
                      label={t('config_management.visual.sections.headers.package_version')}
                      value={values.claudeHeaderPackageVersion}
                      onChange={(e) => onChange({ claudeHeaderPackageVersion: e.target.value })}
                      disabled={disabled}
                    />
                    <Input
                      label={t('config_management.visual.sections.headers.runtime_version')}
                      value={values.claudeHeaderRuntimeVersion}
                      onChange={(e) => onChange({ claudeHeaderRuntimeVersion: e.target.value })}
                      disabled={disabled}
                    />
                    <Input
                      label={t('config_management.visual.sections.headers.os')}
                      value={values.claudeHeaderOs}
                      onChange={(e) => onChange({ claudeHeaderOs: e.target.value })}
                      disabled={disabled}
                    />
                    <Input
                      label={t('config_management.visual.sections.headers.arch')}
                      value={values.claudeHeaderArch}
                      onChange={(e) => onChange({ claudeHeaderArch: e.target.value })}
                      disabled={disabled}
                    />
                    <Input
                      label={t('config_management.visual.sections.headers.timeout')}
                      value={values.claudeHeaderTimeout}
                      onChange={(e) => onChange({ claudeHeaderTimeout: e.target.value })}
                      disabled={disabled}
                    />
                  </SectionGrid>
                  <ToggleList>
                    <ToggleRow
                      title={t('config_management.visual.sections.headers.stabilize_device')}
                      description={t(
                        'config_management.visual.sections.headers.stabilize_device_desc'
                      )}
                      checked={values.claudeHeaderStabilizeDeviceProfile}
                      disabled={disabled}
                      onChange={(claudeHeaderStabilizeDeviceProfile) =>
                        onChange({ claudeHeaderStabilizeDeviceProfile })
                      }
                    />
                  </ToggleList>
                </SectionStack>
              </SectionSubsection>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="codex"
            ref={(node) => {
              sectionRefs.current.codex = node;
            }}
            icon={<IconBrandCodex size={16} />}
            title={t('config_management.visual.sections.codex.title')}
            description={t('config_management.visual.sections.codex.description')}
          >
            <SectionStack>
              {codexLicensedFeaturesAllowed && (
                <ToggleList>
                  <ToggleRow
                    title={t(
                      'config_management.visual.sections.network.codex_force_super_category'
                    )}
                    description={t(
                      'config_management.visual.sections.network.codex_force_super_category_desc'
                    )}
                    checked={values.codexForceSuperCategory}
                    disabled={disabled}
                    onChange={(codexForceSuperCategory) => onChange({ codexForceSuperCategory })}
                  />
                  <ToggleRow
                    title={t('config_management.visual.sections.network.codex_bug_mode')}
                    checked={values.codexBugMode}
                    disabled={disabled}
                    onChange={(codexBugMode) => onChange({ codexBugMode })}
                  />
                </ToggleList>
              )}
              <SectionSubsection
                title={t('config_management.visual.sections.codex.compaction_title')}
                description={t('config_management.visual.sections.codex.compaction_description')}
              >
                <SectionStack>
                  <ToggleList>
                    <ToggleRow
                      title={t(
                        'config_management.visual.sections.network.force_summary_compaction'
                      )}
                      description={t(
                        'config_management.visual.sections.network.force_summary_compaction_desc'
                      )}
                      checked={values.forceSummaryCompaction}
                      disabled={disabled}
                      onChange={(forceSummaryCompaction) => onChange({ forceSummaryCompaction })}
                    />
                  </ToggleList>
                  <SectionGrid>
                    <Input
                      label={t('config_management.visual.sections.network.codex_compact_model')}
                      value={values.responsesCompactModel}
                      placeholder="claude-sonnet-4-6"
                      disabled={disabled}
                      hint={t('config_management.visual.sections.network.codex_compact_model_hint')}
                      onChange={(event) => onChange({ responsesCompactModel: event.target.value })}
                    />
                  </SectionGrid>
                </SectionStack>
              </SectionSubsection>
              {codexLicensedFeaturesAllowed && (
                <SectionSubsection
                  title={t('config_management.visual.sections.codex.turn_state_title')}
                  description={t('config_management.visual.sections.codex.turn_state_description')}
                >
                  <SectionStack>
                    <ToggleList>
                      <ToggleRow
                        title={t(
                          'config_management.visual.sections.network.codex_rewrite_turn_state'
                        )}
                        description={t(
                          'config_management.visual.sections.network.codex_rewrite_turn_state_desc'
                        )}
                        checked={values.codexRewriteTurnState}
                        disabled={disabled}
                        onChange={(codexRewriteTurnState) => onChange({ codexRewriteTurnState })}
                      />
                      <ToggleRow
                        title={t(
                          'config_management.visual.sections.network.codex_force_turn_state_proxy'
                        )}
                        description={t(
                          'config_management.visual.sections.network.codex_force_turn_state_proxy_desc'
                        )}
                        checked={values.codexForceTurnStateProxy}
                        disabled={disabled}
                        onChange={(codexForceTurnStateProxy) =>
                          onChange({ codexForceTurnStateProxy })
                        }
                      />
                    </ToggleList>
                    <div className={styles.turnStateProxyProviderField}>
                      <div className="form-group">
                        <label htmlFor="codex-turn-state-proxy-provider-urls">
                          {t(
                            'config_management.visual.sections.network.codex_turn_state_proxy_provider_urls'
                          )}
                        </label>
                        <textarea
                          id="codex-turn-state-proxy-provider-urls"
                          className={`input ${styles.turnStateProxyProviderTextarea}`}
                          value={values.codexTurnStateProxyProviderUrls.join('\n')}
                          disabled={disabled}
                          rows={5}
                          onChange={(event) =>
                            onChange({
                              codexTurnStateProxyProviderUrls: event.target.value.split(/\r?\n/),
                            })
                          }
                        />
                        <div className="hint">
                          {t(
                            'config_management.visual.sections.network.codex_turn_state_proxy_provider_urls_hint'
                          )}
                        </div>
                      </div>
                    </div>
                    <SectionGrid>
                      <Input
                        label={t(
                          'config_management.visual.sections.network.codex_turn_state_proxy_provider_proxy_url'
                        )}
                        value={values.codexTurnStateProxyProviderProxyUrl}
                        placeholder="socks5://127.0.0.1:1080"
                        onChange={(event) =>
                          onChange({ codexTurnStateProxyProviderProxyUrl: event.target.value })
                        }
                        disabled={disabled}
                        hint={t(
                          'config_management.visual.sections.network.codex_turn_state_proxy_provider_proxy_url_hint'
                        )}
                      />
                      <Input
                        label={t(
                          'config_management.visual.sections.network.codex_turn_state_proxy_attempt_timeout_seconds'
                        )}
                        type="number"
                        min="1"
                        max="120"
                        placeholder="15"
                        value={values.codexTurnStateProxyAttemptTimeoutSeconds}
                        onChange={(event) =>
                          onChange({ codexTurnStateProxyAttemptTimeoutSeconds: event.target.value })
                        }
                        disabled={disabled}
                        hint={t(
                          'config_management.visual.sections.network.codex_turn_state_proxy_attempt_timeout_seconds_hint'
                        )}
                      />
                      <Input
                        label={t(
                          'config_management.visual.sections.network.codex_turn_state_proxy_concurrency'
                        )}
                        type="number"
                        min="1"
                        max="5"
                        placeholder="1"
                        value={values.codexTurnStateProxyConcurrency}
                        onChange={(event) =>
                          onChange({ codexTurnStateProxyConcurrency: event.target.value })
                        }
                        disabled={disabled}
                        hint={t(
                          'config_management.visual.sections.network.codex_turn_state_proxy_concurrency_hint'
                        )}
                      />
                    </SectionGrid>
                  </SectionStack>
                </SectionSubsection>
              )}
              <CodexContextWindowOverridesEditor
                value={values.codexModelContextWindowOverrides}
                disabled={disabled}
                error={codexContextWindowOverridesError}
                onChange={handleCodexContextWindowOverridesChange}
              />
              <SectionSubsection
                title={t('config_management.visual.sections.headers.codex_title')}
                description={t('config_management.visual.sections.headers.description')}
              >
                <SectionGrid>
                  <Input
                    label={t('config_management.visual.sections.headers.user_agent')}
                    value={values.codexHeaderUserAgent}
                    onChange={(e) => onChange({ codexHeaderUserAgent: e.target.value })}
                    disabled={disabled}
                  />
                  <Input
                    label={t('config_management.visual.sections.headers.beta_features')}
                    value={values.codexHeaderBetaFeatures}
                    onChange={(e) => onChange({ codexHeaderBetaFeatures: e.target.value })}
                    disabled={disabled}
                  />
                  <FieldShell
                    label={t('config_management.visual.sections.headers.identity_mode')}
                    labelAdornment={
                      <InfoTooltip
                        ariaLabel={t(
                          'config_management.visual.sections.headers.identity_mode_help_aria'
                        )}
                        title={t(
                          'config_management.visual.sections.headers.identity_mode_help_title'
                        )}
                        content={
                          <div className={styles.identityFlow}>
                            <div className={styles.identityFlowLine}>
                              {t('config_management.visual.sections.headers.identity_flow_client')}
                              <span aria-hidden="true">→</span>
                              {t(
                                'config_management.visual.sections.headers.identity_flow_credential'
                              )}
                              <span aria-hidden="true">→</span>
                              {t(
                                'config_management.visual.sections.headers.identity_flow_upstream'
                              )}
                            </div>
                            <div className={styles.identityFlowExample}>
                              {t('config_management.visual.sections.headers.identity_flow_example')}
                            </div>
                            <ul className={styles.identityFlowList}>
                              {CODEX_IDENTITY_MODES.map((mode) => (
                                <li key={mode}>
                                  <span className={styles.term}>
                                    {t(
                                      `config_management.visual.sections.headers.identity_mode_${mode}`
                                    )}
                                  </span>
                                  <span className={styles.description}>
                                    {' '}
                                    {t(
                                      `config_management.visual.sections.headers.identity_mode_help_${mode}`
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        }
                        footnote={t(
                          'config_management.visual.sections.headers.identity_mode_help_footnote'
                        )}
                      />
                    }
                    labelId={codexIdentityModeLabelId}
                    hint={t('config_management.visual.sections.headers.identity_mode_hint')}
                    hintId={codexIdentityModeHintId}
                  >
                    <Select
                      value={values.codexIdentityMode}
                      options={CODEX_IDENTITY_MODES.map((mode) => ({
                        value: mode,
                        label: t(`config_management.visual.sections.headers.identity_mode_${mode}`),
                      }))}
                      id={`${codexIdentityModeLabelId}-select`}
                      disabled={disabled}
                      ariaLabelledBy={codexIdentityModeLabelId}
                      ariaDescribedBy={codexIdentityModeHintId}
                      onChange={(nextValue) =>
                        onChange({
                          codexIdentityMode: nextValue as CodexIdentityMode,
                        })
                      }
                    />
                  </FieldShell>
                </SectionGrid>
              </SectionSubsection>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="gemini"
            ref={(node) => {
              sectionRefs.current.gemini = node;
            }}
            icon={<IconBrandGemini size={16} />}
            title={t('config_management.visual.sections.gemini.title')}
            description={t('config_management.visual.sections.gemini.description')}
          >
            <ToggleList>
              <ToggleRow
                title={t('config_management.visual.sections.system.antigravity_signature_cache')}
                description={t(
                  'config_management.visual.sections.system.antigravity_signature_cache_desc'
                )}
                checked={values.antigravitySignatureCacheEnabled}
                disabled={disabled}
                onChange={(antigravitySignatureCacheEnabled) =>
                  onChange({ antigravitySignatureCacheEnabled })
                }
              />
              <ToggleRow
                title={t('config_management.visual.sections.system.antigravity_signature_strict')}
                description={t(
                  'config_management.visual.sections.system.antigravity_signature_strict_desc'
                )}
                checked={values.antigravitySignatureBypassStrict}
                disabled={disabled}
                onChange={(antigravitySignatureBypassStrict) =>
                  onChange({ antigravitySignatureBypassStrict })
                }
              />
            </ToggleList>
          </ConfigSection>

          <ConfigSection
            id="augment"
            ref={(node) => {
              sectionRefs.current.augment = node;
            }}
            icon={<IconBrandAugment size={16} />}
            title={t('config_management.visual.sections.augment.title')}
            description={t('config_management.visual.sections.augment.description')}
          >
            <SectionStack>
              <SectionGrid>
                <Input
                  label={t('config_management.visual.sections.augment.silent_mode_model')}
                  placeholder="gpt-6.1-sol"
                  value={values.augmentSilentModeModel}
                  onChange={(e) => onChange({ augmentSilentModeModel: e.target.value })}
                  disabled={disabled}
                  hint={t('config_management.visual.sections.augment.silent_mode_model_hint')}
                />
                <Input
                  label={t('config_management.visual.sections.augment.codebase_retrieval_model')}
                  placeholder="gpt-6.1-sol"
                  value={values.augmentCodebaseRetrievalModel}
                  onChange={(e) => onChange({ augmentCodebaseRetrievalModel: e.target.value })}
                  disabled={disabled}
                  hint={t(
                    'config_management.visual.sections.augment.codebase_retrieval_model_hint'
                  )}
                />
              </SectionGrid>
              <ToggleList>
                <ToggleRow
                  title={t(
                    'config_management.visual.sections.augment.use_configured_completion_models'
                  )}
                  description={t(
                    'config_management.visual.sections.augment.use_configured_completion_models_desc'
                  )}
                  checked={values.augmentUseConfiguredCompletionModels}
                  disabled={disabled}
                  onChange={(augmentUseConfiguredCompletionModels) =>
                    onChange({ augmentUseConfiguredCompletionModels })
                  }
                />
              </ToggleList>
              <SectionGrid>
                <Input
                  label={t('config_management.visual.sections.augment.code_completion_model')}
                  placeholder="gpt-5.6-luna"
                  value={values.augmentCodeCompletionModel}
                  onChange={(e) => onChange({ augmentCodeCompletionModel: e.target.value })}
                  disabled={disabled || !values.augmentUseConfiguredCompletionModels}
                  hint={t('config_management.visual.sections.augment.code_completion_model_hint')}
                />
                <Input
                  label={t('config_management.visual.sections.augment.chat_input_completion_model')}
                  placeholder="claude-haiku-4-5"
                  value={values.augmentChatInputCompletionModel}
                  onChange={(e) => onChange({ augmentChatInputCompletionModel: e.target.value })}
                  disabled={disabled || !values.augmentUseConfiguredCompletionModels}
                  hint={t(
                    'config_management.visual.sections.augment.chat_input_completion_model_hint'
                  )}
                />
              </SectionGrid>
              <ToggleList>
                <ToggleRow
                  title={t('config_management.visual.sections.augment.show_thinking_progress')}
                  description={t(
                    'config_management.visual.sections.augment.show_thinking_progress_desc'
                  )}
                  checked={values.augmentShowThinkingProgress}
                  disabled={disabled}
                  onChange={(augmentShowThinkingProgress) =>
                    onChange({ augmentShowThinkingProgress })
                  }
                />
              </ToggleList>
              <SectionSubsection
                title={t('config_management.visual.sections.models.title')}
                description={t('config_management.visual.sections.models.description')}
              >
                <UsageModelsEditor
                  value={values.usageModels}
                  disabled={disabled}
                  onChange={handleUsageModelsChange}
                />
              </SectionSubsection>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="kiro"
            ref={(node) => {
              sectionRefs.current.kiro = node;
            }}
            icon={<IconBrandKiro size={16} />}
            title={t('config_management.visual.sections.kiro.title')}
            description={t('config_management.visual.sections.kiro.description')}
          >
            <SectionStack>
              <SectionGrid>
                <Input
                  label={t('config_management.visual.sections.kiro.per_account_rpm_limit')}
                  type="number"
                  placeholder="20"
                  value={values.kiroPerAccountRpmLimit}
                  onChange={(e) => onChange({ kiroPerAccountRpmLimit: e.target.value })}
                  disabled={disabled}
                  error={kiroPerAccountRpmLimitError}
                />
                <Input
                  label={t('config_management.visual.sections.kiro.free_rpm_limit')}
                  type="number"
                  placeholder="20"
                  value={values.kiroFreeRpmLimit}
                  onChange={(e) => onChange({ kiroFreeRpmLimit: e.target.value })}
                  disabled={disabled}
                  error={kiroFreeRpmLimitError}
                />
                <Input
                  label={t('config_management.visual.sections.kiro.pro_rpm_limit')}
                  type="number"
                  placeholder="60"
                  value={values.kiroProRpmLimit}
                  onChange={(e) => onChange({ kiroProRpmLimit: e.target.value })}
                  disabled={disabled}
                  error={kiroProRpmLimitError}
                />
                <FieldShell
                  label={t('config_management.visual.sections.kiro.cooldown_strategy')}
                  labelId={kiroCooldownStrategyLabelId}
                  hint={t('config_management.visual.sections.kiro.cooldown_strategy_hint')}
                  hintId={kiroCooldownStrategyHintId}
                >
                  <Select
                    value={values.kiroCooldownStrategy}
                    options={[
                      {
                        value: 'linear',
                        label: t('config_management.visual.sections.kiro.strategy_linear'),
                      },
                      {
                        value: 'fixed',
                        label: t('config_management.visual.sections.kiro.strategy_fixed'),
                      },
                      {
                        value: 'exponential',
                        label: t('config_management.visual.sections.kiro.strategy_exponential'),
                      },
                    ]}
                    id={`${kiroCooldownStrategyLabelId}-select`}
                    disabled={disabled}
                    ariaLabelledBy={kiroCooldownStrategyLabelId}
                    ariaDescribedBy={kiroCooldownStrategyHintId}
                    onChange={(nextValue) =>
                      onChange({
                        kiroCooldownStrategy:
                          nextValue as VisualConfigValues['kiroCooldownStrategy'],
                      })
                    }
                  />
                </FieldShell>
                <Input
                  label={t('config_management.visual.sections.kiro.base_cooldown_seconds')}
                  type="number"
                  placeholder="300"
                  value={values.kiroBaseCooldownSeconds}
                  onChange={(e) => onChange({ kiroBaseCooldownSeconds: e.target.value })}
                  disabled={disabled}
                  error={kiroBaseCooldownSecondsError}
                />
                <Input
                  label={t('config_management.visual.sections.kiro.max_cooldown_seconds')}
                  type="number"
                  placeholder="1800"
                  value={values.kiroMaxCooldownSeconds}
                  onChange={(e) => onChange({ kiroMaxCooldownSeconds: e.target.value })}
                  disabled={disabled}
                  error={kiroMaxCooldownSecondsError}
                />
                <Input
                  label={t(
                    'config_management.visual.sections.kiro.consecutive_error_cooldown_threshold'
                  )}
                  type="number"
                  placeholder="5"
                  value={values.kiroConsecutiveErrorCooldownThreshold}
                  onChange={(e) =>
                    onChange({ kiroConsecutiveErrorCooldownThreshold: e.target.value })
                  }
                  disabled={disabled}
                  error={kiroConsecutiveErrorCooldownThresholdError}
                />
                <Input
                  label={t(
                    'config_management.visual.sections.kiro.consecutive_error_disable_threshold'
                  )}
                  type="number"
                  placeholder="20"
                  value={values.kiroConsecutiveErrorDisableThreshold}
                  onChange={(e) =>
                    onChange({ kiroConsecutiveErrorDisableThreshold: e.target.value })
                  }
                  disabled={disabled}
                  error={kiroConsecutiveErrorDisableThresholdError}
                />
              </SectionGrid>
              <ToggleList>
                <ToggleRow
                  title={t('config_management.visual.sections.kiro.invalid_auth_auto_disable')}
                  description={t(
                    'config_management.visual.sections.kiro.invalid_auth_auto_disable_desc'
                  )}
                  checked={values.kiroInvalidAuthAutoDisable}
                  disabled={disabled}
                  onChange={(kiroInvalidAuthAutoDisable) =>
                    onChange({ kiroInvalidAuthAutoDisable })
                  }
                />
              </ToggleList>
            </SectionStack>
          </ConfigSection>
        </div>
      </div>
    </div>
  );
}
