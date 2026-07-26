import { useEffect, useRef, useState } from 'react';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';

interface FloatingToolbarStyle {
  left: number;
  top: number;
  width: number;
  visible: boolean;
}

const INITIAL_STYLE: FloatingToolbarStyle = { left: 0, top: 0, width: 0, visible: false };

export function useFloatingProviderSection() {
  const pageTransitionLayer = usePageTransitionLayer();
  const isTransitionAnimating = pageTransitionLayer?.isAnimating ?? false;
  const [floatingToolbarStyle, setFloatingToolbarStyle] =
    useState<FloatingToolbarStyle>(INITIAL_STYLE);
  const sectionRef = useRef<HTMLDivElement>(null);
  const topToolbarAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isTransitionAnimating || typeof window === 'undefined') return;

    const updateFloatingToolbar = () => {
      const section = sectionRef.current;
      const anchor = topToolbarAnchorRef.current;
      if (!section || !anchor || window.innerWidth <= 768) {
        setFloatingToolbarStyle((previous) =>
          previous.visible ? { ...previous, visible: false } : previous
        );
        return;
      }

      const rootStyles = getComputedStyle(document.documentElement);
      const fixedTop = Number.parseFloat(rootStyles.getPropertyValue('--header-height')) || 64;
      const anchorHeight = anchor.getBoundingClientRect().height;
      const activeSections = Array.from(
        document.querySelectorAll<HTMLElement>('[data-provider-floating-section]')
      )
        .map((candidate) => {
          const rect = candidate.getBoundingClientRect();
          const header = candidate.querySelector<HTMLElement>('.card-header');
          return {
            element: candidate,
            rect,
            headerHeight: header?.getBoundingClientRect().height ?? anchorHeight,
          };
        })
        .filter(
          ({ rect, headerHeight }) =>
            rect.top <= fixedTop && rect.bottom > fixedTop + headerHeight
        )
        .sort((left, right) => left.rect.top - right.rect.top);
      const activeSection = activeSections[activeSections.length - 1];
      const sectionRect = section.getBoundingClientRect();
      const next = {
        left: sectionRect.left,
        top: fixedTop,
        width: sectionRect.width,
        visible: activeSection?.element === section,
      };

      setFloatingToolbarStyle((previous) =>
        previous.left === next.left &&
        previous.top === next.top &&
        previous.width === next.width &&
        previous.visible === next.visible
          ? previous
          : next
      );
    };

    updateFloatingToolbar();
    window.addEventListener('resize', updateFloatingToolbar);
    window.addEventListener('scroll', updateFloatingToolbar, true);
    return () => {
      window.removeEventListener('resize', updateFloatingToolbar);
      window.removeEventListener('scroll', updateFloatingToolbar, true);
    };
  }, [isTransitionAnimating]);

  return {
    sectionRef,
    topToolbarAnchorRef,
    floatingToolbarStyle,
    shouldRenderFloatingToolbar: !isTransitionAnimating && floatingToolbarStyle.visible,
  };
}
