import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function ChangePasswordDialog({ onClose }) {
  const { changePassword } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [skipChecked, setSkipChecked] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  const handleClose = () => {
    if (skipChecked) {
      localStorage.setItem('skipPwChangeDialog', '1')
    }
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (newPassword !== confirmPassword) {
      setError('تأكيد كلمة السر غير مطابق')
      return
    }
    setBusy(true)
    try {
      await changePassword(currentPassword, newPassword)
      setSuccess('تم تغيير كلمة السر بنجاح')
      setTimeout(handleClose, 1200)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" role="dialog" aria-modal="true">
        <button
          type="button"
          className="modal-close"
          onClick={handleClose}
          aria-label="إغلاق"
        >
          ✕
        </button>
        <h2>تغيير كلمة السر</h2>
        <p className="modal-text">
          أنت تستخدم كلمة سر افتراضية. ننصح بتغييرها لحماية حسابك.
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            كلمة السر الحالية
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label>
            كلمة السر الجديدة
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          <label>
            تأكيد كلمة السر الجديدة
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          {error && <div className="error-box">{error}</div>}
          {success && <div className="success-box">{success}</div>}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={skipChecked}
              onChange={(e) => setSkipChecked(e.target.checked)}
            />
            لا تظهر هذه الرسالة مرة أخرى
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'جارٍ الحفظ...' : 'تغيير كلمة السر'}
          </button>
        </form>
      </div>
    </div>
  )
}