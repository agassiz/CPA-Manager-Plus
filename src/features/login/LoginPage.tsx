import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import {
  IconEye,
  IconEyeOff,
  IconLanguages,
  IconMoon,
  IconSun,
} from '@/components/ui/icons';
import {
  useAuthStore,
  useLanguageStore,
  useNotificationStore,
  useThemeStore,
} from '@/stores';
import { getUsageServiceErrorCode } from '@/services/api/usageService';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';
import { LANGUAGE_LABEL_KEYS, LANGUAGE_ORDER } from '@/utils/constants';
import { isSupportedLanguage } from '@/utils/language';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import type { ApiError } from '@/types';
import styles from './LoginPage.module.scss';

type RedirectState = { from?: { pathname?: string } };

function getLocalizedErrorMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const usageServiceCode = getUsageServiceErrorCode(error);
  if (usageServiceCode) {
    return t(`usage_service_errors.${usageServiceCode}`, {
      defaultValue: t('usage_service_errors.request_failed'),
    });
  }

  const apiError = error as Partial<ApiError>;
  const status = typeof apiError.status === 'number' ? apiError.status : undefined;
  const code = typeof apiError.code === 'string' ? apiError.code : undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof apiError.message === 'string'
        ? apiError.message
        : typeof error === 'string'
          ? error
          : '';

  const withHttpStatus = (summary: string) => {
    if (!status) return summary;

    const genericAxiosMessage = `Request failed with status code ${status}`;
    const detail = message.trim();
    const backendDetail =
      detail && detail !== genericAxiosMessage
        ? ` (${t('login.error_backend_detail')}: ${detail})`
        : '';

    return `HTTP ${status}: ${summary}${backendDetail}`;
  };

  if (status === 401) return withHttpStatus(t('login.error_unauthorized'));
  if (status === 403) return withHttpStatus(t('login.error_forbidden'));
  if (status === 404) return withHttpStatus(t('login.error_not_found'));
  if (status && status >= 500) return withHttpStatus(t('login.error_server'));
  if (code === 'ECONNABORTED' || message.toLowerCase().includes('timeout')) {
    return t('login.error_timeout');
  }
  if (code === 'ERR_NETWORK' || message.toLowerCase().includes('network error')) {
    return t('login.error_network');
  }
  if (code === 'ERR_CERT_AUTHORITY_INVALID' || message.toLowerCase().includes('certificate')) {
    return t('login.error_ssl');
  }
  if (message.toLowerCase().includes('cors') || message.toLowerCase().includes('cross-origin')) {
    return t('login.error_cors');
  }

  return withHttpStatus(t('login.error_invalid'));
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { showNotification } = useNotificationStore();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const theme = useThemeStore((state) => state.theme);
  const cycleTheme = useThemeStore((state) => state.cycleTheme);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const login = useAuthStore((state) => state.login);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);

  const [apiBase, setApiBase] = useState('');
  const [managementKeyInput, setManagementKeyInput] = useState('');
  const [showCustomBase, setShowCustomBase] = useState(false);
  const [showManagementKey, setShowManagementKey] = useState(false);
  const [rememberCredential, setRememberCredential] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(true);
  const [autoLoginSuccess, setAutoLoginSuccess] = useState(false);
  const [error, setError] = useState('');
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);

  const detectedBase = useMemo(() => detectApiBaseFromLocation(), []);
  const toggleLanguageMenu = useCallback(() => {
    setLanguageMenuOpen((prev) => !prev);
  }, []);

  const handleLanguageSelect = useCallback(
    (selectedLanguage: string) => {
      if (!isSupportedLanguage(selectedLanguage)) {
        return;
      }

      setLanguage(selectedLanguage);
      setLanguageMenuOpen(false);
    },
    [setLanguage]
  );

  useEffect(() => {
    if (!languageMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setLanguageMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLanguageMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [languageMenuOpen]);

  useEffect(() => {
    const init = async () => {
      try {
        const hostedManagementPage =
          typeof window !== 'undefined' && /\/management\.html$/i.test(window.location.pathname);
        const autoLoggedIn = await restoreSession({
          expectedMode: 'local',
          expectedPanelBase: hostedManagementPage ? detectedBase : undefined,
        });
        if (autoLoggedIn) {
          setAutoLoginSuccess(true);
          setTimeout(() => {
            const redirect = (location.state as RedirectState | null)?.from?.pathname || '/';
            navigate(redirect, { replace: true });
          }, 1500);
          return;
        }

        const { apiBase: storedBase, managementSecret, rememberPassword } = useAuthStore.getState();
        setApiBase(storedBase || detectedBase);
        setShowCustomBase(false);
        setManagementKeyInput(rememberPassword ? managementSecret || '' : '');
        setRememberCredential(rememberPassword);
      } finally {
        if (!autoLoginSuccess) {
          setAutoLoading(false);
        }
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedManagementKey = managementKeyInput.trim();
    const baseToUse = apiBase ? normalizeApiBase(apiBase) : detectedBase;

    if (!trimmedManagementKey) {
      setError(t('login.cpa_management_key_required'));
      return;
    }
    if (!baseToUse) {
      setError(t('login.cpa_address_required'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      await login({
        apiBase: baseToUse,
        managementKey: trimmedManagementKey,
        rememberPassword: rememberCredential,
        sessionMode: 'local',
        sessionPanelBase: detectedBase,
      });
      showNotification(t('common.connected_status'), 'success');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message = getLocalizedErrorMessage(err, t);
      setError(message);
      showNotification(`${t('notification.login_failed')}: ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [
    apiBase,
    detectedBase,
    login,
    managementKeyInput,
    navigate,
    rememberCredential,
    showNotification,
    t,
  ]);

  const handleSubmitKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !loading) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, loading]
  );

  if (isAuthenticated && !autoLoading && !autoLoginSuccess) {
    const redirect = (location.state as RedirectState | null)?.from?.pathname || '/';
    return <Navigate to={redirect} replace />;
  }

  const showSplash = autoLoading || autoLoginSuccess;

  const renderKeyToggle = (visible: boolean, toggle: () => void) => (
    <button
      type="button"
      className="btn btn-ghost btn-xs btn-icon-only"
      onClick={toggle}
      aria-label={visible ? t('login.hide_key') : t('login.show_key')}
      title={visible ? t('login.hide_key') : t('login.show_key')}
    >
      {visible ? <IconEyeOff size={16} /> : <IconEye size={16} />}
    </button>
  );

  return (
    <div className={styles.container}>
      <div className={styles.toolBar}>
        <button
          type="button"
          className={styles.toolButton}
          onClick={cycleTheme}
          aria-label={t('theme.switch')}
          title={t('theme.switch')}
        >
          {theme === 'dark' ? <IconMoon size={17} /> : <IconSun size={17} />}
        </button>
        <div className={styles.languageMenu} ref={languageMenuRef}>
          <button
            type="button"
            className={styles.toolButton}
            onClick={toggleLanguageMenu}
            aria-label={t('language.switch')}
            title={t('language.switch')}
            aria-haspopup="menu"
            aria-expanded={languageMenuOpen}
          >
            <IconLanguages size={17} />
          </button>
          {languageMenuOpen && (
            <div
              className={styles.languagePopover}
              role="menu"
              aria-label={t('language.switch')}
            >
              {LANGUAGE_ORDER.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={`${styles.languageOption} ${
                    language === lang ? styles.languageOptionActive : ''
                  }`}
                  onClick={() => handleLanguageSelect(lang)}
                  role="menuitemradio"
                  aria-checked={language === lang}
                >
                  {t(LANGUAGE_LABEL_KEYS[lang])}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.formPanel}>
        {showSplash ? (
          <div className={styles.splashContent}>
            <img src={INLINE_LOGO_JPEG} alt="CPAMP" className={styles.splashLogo} />
            <h1 className={styles.splashTitle}>{t('splash.title')}</h1>
            <p className={styles.splashSubtitle}>{t('splash.subtitle')}</p>
            <div className={styles.splashLoader}>
              <div className={styles.splashLoaderBar} />
            </div>
          </div>
        ) : (
          <div className={styles.formContent}>
            <div className={styles.loginCard}>
              <div className={styles.cardBranding}>
                <img src={INLINE_LOGO_JPEG} alt="CPA Manager Plus" className={styles.logo} />
                <h1>CPA Manager Plus</h1>
                <p>{t('login.subtitle')}</p>
              </div>

              <div className={styles.loginForm}>
                <div className={styles.connectionBox}>
                  <div className={styles.label}>{t('login.connection_current')}</div>
                  <div className={styles.value}>{apiBase || detectedBase}</div>
                  <div className={styles.hint}>{t('login.connection_auto_hint')}</div>
                </div>

                <div className={styles.toggleAdvanced}>
                  <SelectionCheckbox
                    checked={showCustomBase}
                    onChange={setShowCustomBase}
                    ariaLabel={t('login.custom_connection_label')}
                    label={t('login.custom_connection_label')}
                    labelClassName={styles.toggleLabel}
                  />
                </div>

                {showCustomBase && (
                  <Input
                    label={t('login.custom_connection_label')}
                    placeholder={t('login.custom_connection_placeholder')}
                    value={apiBase}
                    onChange={(event) => setApiBase(event.target.value)}
                    hint={t('login.custom_connection_hint')}
                  />
                )}

                <Input
                  autoFocus
                  label={t('login.cpa_management_key_label')}
                  placeholder={t('login.cpa_management_key_placeholder')}
                  type={showManagementKey ? 'text' : 'password'}
                  value={managementKeyInput}
                  onChange={(event) => setManagementKeyInput(event.target.value)}
                  onKeyDown={handleSubmitKeyDown}
                  hint={t('login.cpa_management_key_hint')}
                  rightElement={renderKeyToggle(showManagementKey, () =>
                    setShowManagementKey((prev) => !prev)
                  )}
                />

                <div className={styles.toggleAdvanced}>
                  <SelectionCheckbox
                    checked={rememberCredential}
                    onChange={setRememberCredential}
                    ariaLabel={t('login.remember_credential_label')}
                    label={t('login.remember_credential_label')}
                    labelClassName={styles.toggleLabel}
                  />
                </div>

                <Button fullWidth onClick={handleSubmit} loading={loading}>
                  {loading ? t('login.submitting') : t('login.submit_button')}
                </Button>

                {error && <div className={styles.errorBox}>{error}</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
