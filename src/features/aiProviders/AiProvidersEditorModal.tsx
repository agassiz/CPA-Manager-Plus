import { type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { AiProvidersPage } from './AiProvidersPage';
import styles from './AiProvidersPage.module.scss';

type LocationState = { fromAiProviders?: boolean } | null;

export function AiProvidersEditorModal({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const isNew = location.pathname.endsWith('/new');
  const title = location.pathname.startsWith('/ai-providers/gemini')
    ? t(isNew ? 'ai_providers.gemini_add_modal_title' : 'ai_providers.gemini_edit_modal_title')
    : location.pathname.startsWith('/ai-providers/codex')
      ? t(isNew ? 'ai_providers.codex_add_modal_title' : 'ai_providers.codex_edit_modal_title')
      : location.pathname.startsWith('/ai-providers/claude')
        ? t(isNew ? 'ai_providers.claude_add_modal_title' : 'ai_providers.claude_edit_modal_title')
        : location.pathname.startsWith('/ai-providers/vertex')
          ? t(isNew ? 'ai_providers.vertex_add_modal_title' : 'ai_providers.vertex_edit_modal_title')
          : t(isNew ? 'ai_providers.openai_add_modal_title' : 'ai_providers.openai_edit_modal_title');

  const handleClose = () => {
    const state = location.state as LocationState;
    if (state?.fromAiProviders) {
      navigate(-1);
      return;
    }
    navigate('/ai-providers', { replace: true });
  };

  return (
    <>
      <AiProvidersPage />
      <Modal
        open
        title={title}
        onClose={handleClose}
        width={1120}
        className={styles.providerEditorModal}
      >
        {children ?? <Outlet />}
      </Modal>
    </>
  );
}
