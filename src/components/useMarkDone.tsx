/**
 * "Mark renewed" / "Mark paid" with a short undo notice. Shared by Home and the
 * two list views so a tap always confirms what changed and can be reversed.
 */
import { useEffect, useState } from 'react';

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
    markInstallmentUnpaid,
  } = useAppData();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const renew = (subscription: Subscription) => {
    const previous = subscription.nextRenewal;
    markSubscriptionRenewed(subscription.id);
    setNotice({
      message: `${subscription.name} marked renewed.`,
      undo: () =>
        updateSubscription(subscription.id, { nextRenewal: previous }),
    });
  };

  const pay = (installment: Installment) => {
    markInstallmentPaid(installment.id);
    setNotice({
      message: `${installment.name}: payment ${installment.paidPayments + 1} of ${installment.totalPayments} marked paid.`,
      undo: () => markInstallmentUnpaid(installment.id),
    });
  };

  // The live region stays mounted so screen readers announce each new notice.
  const toast = (
    <div className={styles.region} role="status">
      {notice && (
        <div className={styles.toast}>
          <span>{notice.message}</span>
          <button
            type="button"
            className="button button-small"
            onClick={() => {
              notice.undo();
              setNotice(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );

  return { renew, pay, toast };
}
