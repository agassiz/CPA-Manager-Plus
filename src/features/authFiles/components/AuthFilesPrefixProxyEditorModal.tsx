import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type {
  PrefixProxyEditorField,
  PrefixProxyEditorFieldValue,
  PrefixProxyEditorState,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import styles from '@/features/authFiles/AuthFilesPage.module.scss';

export type AuthFilesPrefixProxyEditorModalProps = {
  disableControls: boolean;
  editor: PrefixProxyEditorState | null;
  updatedText: string;
  dirty: boolean;
  onClose: () => void;
  onCopyText: (text: string) => void | Promise<void>;
  onSave: () => void;
  onChange: (field: PrefixProxyEditorField, value: PrefixProxyEditorFieldValue) => void;
};

export function AuthFilesPrefixProxyEditorModal(props: AuthFilesPrefixProxyEditorModalProps) {
  const { t } = useTranslation();
  const { disableControls, editor, updatedText, dirty, onClose, onCopyText, onSave, onChange } =
    props;
  const formatJsonText = (text: string) => {
    if (!text) return '';
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  };
  const previewText = formatJsonText(updatedText);
  const invalidContentPreview = editor?.invalidContentPreview ?? '';
  const exclusiveConfigInvalid = Boolean(
    editor?.exclusiveEnabled &&
    (!editor.exclusiveModel.trim() ||
      !Number.isInteger(Number(editor.exclusiveThreshold.trim())) ||
      Number(editor.exclusiveThreshold.trim()) < 1 ||
      Number(editor.exclusiveThreshold.trim()) > 100)
  );

  return (
    <Modal
      open={Boolean(editor)}
      onClose={onClose}
      closeDisabled={editor?.saving === true}
      width={720}
      title={
        editor?.fileName
          ? t('auth_files.auth_field_editor_title', { name: editor.fileName })
          : t('auth_files.prefix_proxy_button')
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={editor?.saving === true}>
            {dirty ? t('common.cancel') : t('common.close')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (!updatedText) return;
              void onCopyText(updatedText);
            }}
            disabled={editor?.saving === true || !updatedText}
          >
            {t('common.copy')}
          </Button>
          <Button
            onClick={onSave}
            loading={editor?.saving === true}
            disabled={
              disableControls ||
              editor?.saving === true ||
              !dirty ||
              !editor?.json ||
              Boolean(editor?.headersTouched && editor.headersError)
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {editor && (
        <div className={styles.prefixProxyEditor}>
          {editor.loading ? (
            <div className={styles.prefixProxyLoading}>
              <LoadingSpinner size={14} />
              <span>{t('auth_files.prefix_proxy_loading')}</span>
            </div>
          ) : (
            <>
              {editor.error && <div className={styles.prefixProxyError}>{editor.error}</div>}
              {editor.json && (
                <div className={styles.prefixProxyFields}>
                  <div className={styles.prefixProxyInlineFields}>
                    <Input
                      label={t('auth_files.prefix_label')}
                      value={editor.prefix}
                      disabled={disableControls || editor.saving || !editor.json}
                      onChange={(e) => onChange('prefix', e.target.value)}
                    />
                    <Input
                      label={t('auth_files.priority_label')}
                      value={editor.priority}
                      placeholder={t('auth_files.priority_placeholder')}
                      hint={t('auth_files.priority_hint')}
                      disabled={disableControls || editor.saving || !editor.json}
                      onChange={(e) => onChange('priority', e.target.value)}
                    />
                  </div>
                  <Input
                    label={t('auth_files.proxy_url_label')}
                    value={editor.proxyUrl}
                    placeholder={t('auth_files.proxy_url_placeholder')}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('proxyUrl', e.target.value)}
                  />
                  {editor.providerKey === 'codex' && (
                    <>
                      <div className="form-group">
                        <label>{t('ai_providers.codex_websockets_label')}</label>
                        <ToggleSwitch
                          checked={Boolean(editor.websockets)}
                          onChange={(value) => onChange('websockets', value)}
                          disabled={disableControls || editor.saving || !editor.json}
                          ariaLabel={t('ai_providers.codex_websockets_label')}
                        />
                        <div className="hint">{t('ai_providers.codex_websockets_hint')}</div>
                      </div>
                      {editor.superCategoryAllowed && (
                        <div className="form-group">
                          <label>{t('auth_files.super_category_label')}</label>
                          <ToggleSwitch
                            checked={Boolean(editor.superCategory)}
                            onChange={(value) => onChange('superCategory', value)}
                            disabled={disableControls || editor.saving || !editor.json}
                            ariaLabel={t('auth_files.super_category_label')}
                          />
                          <div className="hint">{t('auth_files.super_category_hint')}</div>
                        </div>
                      )}
                      {editor.exclusiveAllowed && (
                        <div className="form-group">
                          <label>{t('auth_files.exclusive_config_label')}</label>
                          <ToggleSwitch
                            checked={Boolean(editor.exclusiveEnabled)}
                            onChange={(value) => onChange('exclusiveEnabled', value)}
                            disabled={disableControls || editor.saving || !editor.json}
                            ariaLabel={t('auth_files.exclusive_config_label')}
                          />
                          <div className="hint">{t('auth_files.exclusive_config_hint')}</div>
                          {editor.exclusiveEnabled && (
                            <div className={styles.prefixProxyInlineFields}>
                              <label className="form-group">
                                <span>{t('auth_files.exclusive_config_model_label')}</span>
                                <select
                                  className="input"
                                  value={editor.exclusiveModel}
                                  disabled={
                                    disableControls ||
                                    editor.saving ||
                                    !editor.json ||
                                    editor.exclusiveModelsLoading
                                  }
                                  onChange={(event) =>
                                    onChange('exclusiveModel', event.target.value)
                                  }
                                >
                                  <option value="">
                                    {t('auth_files.exclusive_config_model_placeholder')}
                                  </option>
                                  {editor.exclusiveModels.map((model) => (
                                    <option key={model} value={model}>
                                      {model}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <Input
                                label={t('auth_files.exclusive_config_threshold_label')}
                                type="number"
                                min={1}
                                max={100}
                                value={editor.exclusiveThreshold}
                                placeholder={t('auth_files.exclusive_config_threshold_placeholder')}
                                error={
                                  exclusiveConfigInvalid
                                    ? t('auth_files.exclusive_config_invalid')
                                    : undefined
                                }
                                disabled={disableControls || editor.saving || !editor.json}
                                onChange={(event) =>
                                  onChange('exclusiveThreshold', event.target.value)
                                }
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  <div className="form-group">
                    <label>{t('auth_files.headers_label')}</label>
                    <textarea
                      className={`input ${editor.headersError ? styles.prefixProxyTextareaInvalid : ''}`}
                      value={editor.headersText}
                      placeholder={t('auth_files.headers_placeholder')}
                      rows={4}
                      aria-invalid={Boolean(editor.headersError)}
                      disabled={disableControls || editor.saving || !editor.json}
                      onChange={(e) => onChange('headersText', e.target.value)}
                    />
                    {editor.headersError && <div className="error-box">{editor.headersError}</div>}
                    <div className="hint">{t('auth_files.headers_hint')}</div>
                  </div>
                  <div className={styles.prefixProxyJsonWrapper}>
                    <label className={styles.prefixProxyLabel}>
                      {t('auth_files.prefix_proxy_info_label')}
                    </label>
                    <textarea
                      className={styles.prefixProxyTextarea}
                      rows={8}
                      readOnly
                      value={editor.fileInfoText}
                    />
                  </div>
                  <div className={styles.prefixProxyJsonWrapper}>
                    <label className={styles.prefixProxyLabel}>
                      {t('auth_files.prefix_proxy_source_label')}
                    </label>
                    <textarea
                      className={styles.prefixProxyTextarea}
                      rows={10}
                      readOnly
                      value={previewText}
                    />
                  </div>
                  <Input
                    label={t('auth_files.note_label')}
                    value={editor.note}
                    placeholder={t('auth_files.note_placeholder')}
                    hint={t('auth_files.note_hint')}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('note', e.target.value)}
                  />
                </div>
              )}
              {!editor.json && (
                <>
                  <div className={styles.prefixProxyJsonWrapper}>
                    <label className={styles.prefixProxyLabel}>
                      {t('auth_files.prefix_proxy_info_label')}
                    </label>
                    <textarea
                      className={styles.prefixProxyTextarea}
                      rows={8}
                      readOnly
                      value={editor.fileInfoText}
                    />
                  </div>
                  <div className={styles.prefixProxyJsonWrapper}>
                    <label className={styles.prefixProxyLabel}>
                      {t('auth_files.prefix_proxy_invalid_content_label')}
                    </label>
                    <pre className={styles.prefixProxyInvalidContentPreview}>
                      {invalidContentPreview}
                    </pre>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
