"use client";

interface WindowsDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function WindowsDialog({
  open,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel
}: WindowsDialogProps) {
  if (!open) return null;

  return (
    <div className="win-dialog-backdrop" role="presentation">
      <section className="win-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header className="win-dialog-titlebar">
          <span>{title}</span>
          <button type="button" className="win-dialog-close" onClick={onCancel} aria-label="Fechar dialogo">
            x
          </button>
        </header>

        <div className="win-dialog-content">
          <span className="win-dialog-icon" aria-hidden="true">
            !
          </span>
          <p className="win-dialog-text">{message}</p>
        </div>

        <div className="win-dialog-actions">
          <button type="button" className="action-btn" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="action-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
