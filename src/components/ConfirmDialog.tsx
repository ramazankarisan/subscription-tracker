/**
 * A small confirm/cancel dialog built on Modal — used for destructive actions
 * (deletes) instead of the native window.confirm, so the prompt matches the
 * app's look and stays keyboard-accessible.
 */
import { Modal } from './Modal';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className={styles.message}>{message}</p>
      <div className="form-actions">
        {/* Focus the safe action by default for a destructive prompt. */}
        <button
          type="button"
          className="button button-ghost"
          onClick={onCancel}
          autoFocus
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`button ${danger ? 'button-danger' : 'button-primary'}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
