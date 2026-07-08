/**
 * A lightweight centered modal for the add/edit forms and confirmations.
 * Portaled to <body>, traps focus, makes the rest of the app inert while open,
 * and restores focus on close. Not using a UI library keeps the PWA small.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { CloseIcon } from './icons';
import styles from './Modal.module.css';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * Whether a backdrop click closes the modal. Forms with unsaved input pass
   * `false` so a stray tap can't silently discard what was typed. Defaults to
   * true. Escape and the explicit Close button always work.
   */
  closeOnBackdrop?: boolean;
  /**
   * Where to land focus on open. `'container'` (default) focuses the dialog so
   * the title is announced first — right for confirmations. `'first-field'`
   * focuses the first control in the body, so add/edit forms open onto their
   * first input (and the mobile keyboard pops).
   */
  initialFocus?: 'container' | 'first-field';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  onClose,
  children,
  closeOnBackdrop = true,
  initialFocus = 'container',
}: ModalProps) {
  const headingId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const appRoot = document.getElementById('root');
    // Hide the rest of the app from AT + keyboard while the dialog is open.
    appRoot?.setAttribute('inert', '');
    appRoot?.setAttribute('aria-hidden', 'true');

    // Land focus per policy: the first field for forms, else the dialog itself
    // (safe for confirms; lets the screen reader announce the title first).
    if (initialFocus === 'first-field') {
      const firstField = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (firstField ?? modalRef.current)?.focus();
    } else {
      modalRef.current?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const items = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      if (items.length === 0) {
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      appRoot?.removeAttribute('inert');
      appRoot?.removeAttribute('aria-hidden');
      previouslyFocused?.focus?.();
    };
  }, [onClose, initialFocus]);

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id={headingId}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon size={20} />
          </button>
        </header>
        <div ref={bodyRef} className={styles.body}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
