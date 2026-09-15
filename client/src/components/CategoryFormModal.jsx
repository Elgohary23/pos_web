import { useState } from 'react'
import { flattenForSelect } from '../utils/tree.js'

export default function CategoryFormModal({ categories, category, defaultParentId, onSave, onClose }) {
  const [name, setName] = useState(category?.name ?? '')
  const [parentId, setParentId] = useState(
    category ? (category.parentId ?? '') : (defaultParentId ?? '')
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isEdit = Boolean(category)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('اسم التصنيف مطلوب')
    const payload = { name: name.trim(), parentId: parentId === '' || parentId === null ? null : Number(parentId) }
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
      <div className="modal-box">
        <button type="button" className="modal-close" onClick={onClose} aria-label="إغلاق">
          ✕
        </button>
        <h2>{isEdit ? 'تعديل تصنيف' : 'تصنيف جديد'}</h2>
        <form onSubmit={handleSubmit} className="form-stack">
          <label>
            اسم التصنيف
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </label>
          <label>
            التصنيف الأب
            <select value={String(parentId)} onChange={(e) => setParentId(e.target.value)}>
              <option value="">تصنيف رئيسي</option>
              {flattenForSelect(categories.filter((c) => !isEdit || c.id !== category.id)).map((c) => (
                <option key={c.id} value={c.id}>
                  {'\u2003'.repeat(c.depth) + c.name}
                </option>
              ))}
            </select>
          </label>
          {error && <div className="error-box">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              إلغاء
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إنشاء'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}