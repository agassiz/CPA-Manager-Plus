import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconInfo } from './icons';
import styles from './InfoTooltip.module.scss';

export type InfoTooltipEntry = {
  term: string;
  description: string;
};

type InfoTooltipProps = {
  /** Accessible name of the trigger, e.g. "What do these options mean?". */
  ariaLabel: string;
  title?: string;
  entries?: ReadonlyArray<InfoTooltipEntry>;
  content?: ReactNode;
  footnote?: ReactNode;
};

const PANEL_WIDTH = 340;
const VIEWPORT_MARGIN = 12;
const TRIGGER_OFFSET = 8;
// Rough per-entry height used only to decide whether the panel opens below or above
// the trigger; the panel itself is laid out by the browser.
const ENTRY_HEIGHT = 46;
const PANEL_CHROME_HEIGHT = 64;

export function InfoTooltip({ ariaLabel, title, entries = [], content, footnote }: InfoTooltipProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const show = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    const estimatedHeight =
      PANEL_CHROME_HEIGHT +
      entries.length * ENTRY_HEIGHT +
      (content ? 260 : 0) +
      (footnote ? ENTRY_HEIGHT : 0);
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
    );
    const below = rect.bottom + TRIGGER_OFFSET;
    const top =
      below + estimatedHeight <= window.innerHeight - VIEWPORT_MARGIN
        ? below
        : Math.max(VIEWPORT_MARGIN, rect.top - estimatedHeight - TRIGGER_OFFSET);

    setPosition({ top, left });
    setOpen(true);
  }, [entries.length, footnote]);

  const hide = useCallback(() => setOpen(false), []);

  const panel = open ? (
    <div id={panelId} role="tooltip" className={styles.panel} style={position}>
      {title ? <div className={styles.title}>{title}</div> : null}
      {content}
      {entries.length > 0 ? (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.term}>
              <span className={styles.term}>{entry.term}</span>
              <span className={styles.description}> {entry.description}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {footnote ? <div className={styles.footnote}>{footnote}</div> : null}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={ariaLabel}
        aria-describedby={open ? panelId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={open ? hide : show}
      >
        <IconInfo size={14} />
      </button>
      {panel && (typeof document === 'undefined' ? panel : createPortal(panel, document.body))}
    </>
  );
}
