import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/Card';
import styles from '@/features/aiProviders/AiProvidersPage.module.scss';
import { useFloatingProviderSection } from './useFloatingProviderSection';

interface FloatingProviderSectionProps {
  title: ReactNode;
  extra: ReactNode;
  children: ReactNode;
}


export function FloatingProviderSection({
  title,
  extra,
  children,
}: FloatingProviderSectionProps) {
  const {
    sectionRef,
    topToolbarAnchorRef,
    floatingToolbarStyle,
    shouldRenderFloatingToolbar,
  } = useFloatingProviderSection();

  return (
    <>
      <div ref={sectionRef} data-provider-floating-section>
        <Card
          title={title}
          extra={
            <div
              ref={topToolbarAnchorRef}
              className={
                shouldRenderFloatingToolbar ? styles.providerToolbarAnchorHidden : undefined
              }
            >
              {extra}
            </div>
          }
        >
          {children}
        </Card>
      </div>
      {typeof document !== 'undefined' && shouldRenderFloatingToolbar
        ? createPortal(
            <div
              className={'card ' + styles.providerFloatingToolbar}
              style={{
                left: floatingToolbarStyle.left,
                top: floatingToolbarStyle.top,
                width: floatingToolbarStyle.width,
              }}
            >
              <div className="card-header">
                <div className="title">{title}</div>
                {extra}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
