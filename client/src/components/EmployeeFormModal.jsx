import { useState } from 'react'
import { to12, to24 } from '../utils/time.js'

const MINUTES = ['00', '15', '30', '45']
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1))

export default function EmployeeFormModal({ user, onClose, onSave }) {
  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [password, setPassword] = useState('')
  const [shiftStart, setShiftStart] = useState(() => to12(user?.shiftStart))
  const [shiftEnd, setShiftEnd] = useState(() => to12(user?.shiftEnd))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isEdit = Boolean(user)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('الاسم مطلوب')
    if (!username.trim()) return setError('اسم المستخدم مطلوب')
    if (!isEdit && password.length < 6) return setError('كلمة السر يجب أن تكون 6 أحرف على الأقل')
    if (isEdit && password && password.length < 6) {
      return setError('كلمة السر الجديدة يجب أن تكون 6 أحرف على الأقل')
    }

    const payload = {
      name: name.trim(),
      username: username.trim(),
      shiftStart: to24(shiftStart),
      shiftEnd: to24(shiftEnd),
    }
    if (password) payload.password = password

    setBusy(true)
    try {
      await onSave(payload)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-wide">
        <button type="button" className="modal-close" onClick={onClose} aria-label="إغلاق">
          ✕
        </button>
        <h2>{isEdit ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'}</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            الاسم
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            اسم المستخدم
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="span-2 first-password">
            كلمة السر {isEdit && <span className="hint">اتركها فارغة لإبقائها كما هي</span>}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? '••••••••' : ''}
            />
          </label>

          <div className="span-2 shift-row">
            <TimePicker label="بداية الشيفت" value={shiftStart} onChange={(p) => setShiftStart(p)} />
            <TimePicker label="نهاية الشيفت" value={shiftEnd} onChange={(p) => setShiftEnd(p)} />
          </div>

          {error && <div className="error-box span-2">{error}</div>}

          <div className="modal-actions span-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              إلغاء
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إنشاء الحساب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TimePicker({ label, value, onChange }) {
  return (
    <div className="field-group">
      <label>{label}</label>
      <div className="time-picker">
        <select value={value.hour} onChange={(e) => onChange({ ...value, hour: e.target.value })}>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span>:</span>
        <select value={value.minute} onChange={(e) => onChange({ ...value, minute: e.target.value })}>
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={value.period}
          onChange={(e) => onChange({ ...value, period: e.target.value })}
        >
          <option value="AM">ص</option>
          <option value="PM">م</option>
        </select>
      </div>
    </div>
  )
}