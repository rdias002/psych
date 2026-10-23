import { useEffect } from 'react';

interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation. The safe choice (cancel) is the prominent one. */
export function ConfirmDialog({ title, body, confirmLabel, cancelLabel, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm rounded-3xl bg-night-2 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-xl font-bold">
          {title}
        </h2>
        <p className="mt-2 text-indigo-300">{body}</p>
        <div className="mt-6 flex flex-col gap-2">
          <button onClick={onCancel} className="btn-primary" autoFocus>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className="btn-secondary text-rose-300">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
