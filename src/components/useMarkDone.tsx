/**
 * "Mark renewed" / "Mark paid" with a short undo notice. Shared by Home and the
 * two list views so a tap always confirms what changed and can be reversed.
 */
import { useEffect, useRef, useState } from 'react';

import { useAppData } from '../state/useAppData';
import type { Installment, Subscription } from '../types';
import styles from './useMarkDone.module.css';

const NOTICE_MS = 6000;

interface Notice {
  message: string;
  undo: () => void;
}

export function useMarkDone() {
  const {
    markSubscriptionRenewed,
    updateSubscription,
    markInstallmentPaid,
    updateInstallment,
  } = useAppData();
  const [notice, setNotice] = useState<Notice | null>(null);
  // Stays up while the user is on it (keyboard / screen reader), WCAG 2.2.1.
  const [paused, setPaused] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const autoFocusRef = useRef(false);

  useEffect(() => {
    if (!notice || paused) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, paused]);

  // The tapped button may be gone (a Home row leaves the due list): land
  // keyboard focus on Undo rather than losing it to <body>.
  const show = (next: Notice) => {
    setNotice(next);
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) {
        autoFocusRef.current = true; // our own focus move doesn't pause the timer
        undoRef.current?.focus();
      }
    });
  };

  const renew = (subscription: Subscription) => {
    markSubscriptionRenewed(subscription.id);
    show({
      message: `${subscription.name} marked renewed.`,
      undo: () =>
        updateSubscription(subscription.id, {
          nextRenewal: subscription.nextRenewal,
        }),
    });
  };

  const pay = (installment: Installment) => {
    if (installment.paidPayments >= installment.totalPayments) {
      return;
    }
    markInstallmentPaid(installment.id);
    show({
      message: `${installment.name}: payment ${installment.paidPayments + 1} of ${installment.totalPayments} marked paid.`,
      undo: () =>
        updateInstallment(installment.id, {
          paidPayments: installment.paidPayments,
        }),
    });
  };

  // Undo restores a snapshot, so drop it before the item can change any other way.
  const dismiss = () => setNotice(null);

  const undo = () => {
    notice?.undo();
    setNotice(null);
    autoFocusRef.current = true;
    regionRef.current?.focus();
  };

  // The live region stays mounted so screen readers announce each new notice.
  const toast = (
    <div
      ref={regionRef}
      className={styles.region}
      role="status"
      tabIndex={-1}
      onFocus={() => {
        if (autoFocusRef.current) {
          autoFocusRef.current = false;
          return;
        }
        setPaused(true);
      }}
      onBlur={() => setPaused(false)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {notice && (
        <div className={styles.toast}>
          <span>{notice.message}</span>
          <button
            ref={undoRef}
            type="button"
            className="button button-small"
            onClick={undo}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );

  return { renew, pay, dismiss, toast };
}
