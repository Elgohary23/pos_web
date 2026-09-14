import { useState } from 'react'

export default function ConfirmDialog({ title, message, confirmLabel = 'تأكيد', onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false)

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2>{title}</h2>
        <p className="modal-text">{message}</p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            إلغاء
          </button>
          <button type="button" className="btn-danger" onClick={handleConfirm} disabled={busy}>
            {busy ? 'جارٍ الحذف...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}