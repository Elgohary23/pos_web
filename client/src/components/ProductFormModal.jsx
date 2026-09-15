import { useRef, useState } from 'react'
import { flattenForSelect } from '../utils/tree.js'

export default function ProductFormModal({
  categories,
  product,
  defaultCategoryId,
  onCreateCategory,
  onSave,
  onClose,
}) {
  const [name, setName] = useState(product?.name ?? '')
  const [wholesalePrice, setWholesalePrice] = useState(product?.wholesalePrice ?? '')
  const [retailPrice, setRetailPrice] = useState(product?.retailPrice ?? '')
  const [quantity, setQuantity] = useState(product?.quantity ?? 0)
  const [barcode, setBarcode] = useState(product?.barcode ?? '')
  const [categoryId, setCategoryId] = useState(
    String(product?.categoryId ?? defaultCategoryId ?? '')
  )
  const [localCategories, setLocalCategories] = useState(categories)
  const [imageFile, setImageFile] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [catName, setCatName] = useState('')
  const [catParent, setCatParent] = useState(categoryId || '')
  const [catError, setCatError] = useState('')
  const [catBusy, setCatBusy] = useState(false)
  const fileRef = useRef(null)

  const isEdit = Boolean(product)
  const selectOptions = flattenForSelect(localCategories)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('اسم المنتج مطلوب')
    if (!retailPrice && retailPrice !== 0) return setError('سعر البيع مطلوب')
    if (!wholesalePrice && wholesalePrice !== 0) return setError('سعر الجملة مطلوب')
    if (!categoryId) return setError('يجب اختيار تصنيف للمنتج')
    if (quantity < 0) return setError('الكمية يجب أن تكون صفر أو أكثر')

    const form = new FormData()
    form.append('name', name.trim())
    form.append('wholesalePrice', String(wholesalePrice))
    form.append('retailPrice', String(retailPrice))
    form.append('quantity', String(quantity))
    form.append('categoryId', String(categoryId))
    if (barcode.trim()) form.append('barcode', barcode.trim())
    if (imageFile) form.append('image', imageFile)

    setBusy(true)
    try {
      await onSave(form)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleCreateCategory = async (e) => {
    e.preventDefault()
    setCatError('')
    if (!catName.trim()) return setCatError('اسم التصنيف مطلوب')
    setCatBusy(true)
    try {
      const created = await onCreateCategory({
        name: catName.trim(),
        parentId: catParent === '' ? null : Number(catParent),
      })
      setLocalCategories((prev) => [...prev, created])
      setCategoryId(String(created.id))
      setCatParent('')
      setCatName('')
      setShowCategoryModal(false)
    } catch (err) {
      setCatError(err.message)
    } finally {
      setCatBusy(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-wide">
        <button type="button" className="modal-close" onClick={onClose} aria-label="إغلاق">
          ✕
        </button>
        <h2>{isEdit ? 'تعديل منتج' : 'إضافة منتج'}</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="span-2">
            اسم المنتج
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </label>

          <label>
            سعر الجملة
            <input
              type="number"
              min="0"
              step="0.01"
              value={wholesalePrice}
              onChange={(e) => setWholesalePrice(e.target.value)}
              required
            />
          </label>
          <label>
            سعر البيع
            <input
              type="number"
              min="0"
              step="0.01"
              value={retailPrice}
              onChange={(e) => setRetailPrice(e.target.value)}
              required
            />
          </label>
          <label>
            الكمية
            <input
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </label>

          <label className="span-2">
            Barcode {!isEdit && <span className="hint">اتركه فارغًا ليتم توليده تلقائيًا</span>}
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="اختياري — يُولَّد تلقائيًا عند تركه فارغًا"
            />
          </label>

          <div className="span-2">
            <label>
              التصنيف
              <div className="category-select-row">
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">— اختر تصنيفًا —</option>
                  {selectOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {'\u2003'.repeat(c.depth) + c.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-secondary btn-compact" onClick={() => setShowCategoryModal(true)}>
                  + تصنيف جديد
                </button>
              </div>
            </label>
          </div>

          <label className="span-2">
            الصورة {!isEdit && <span className="hint">اختيارية</span>}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files[0])}
            />
            {product?.imageUrl && !imageFile && (
              <img className="thumb" src={product.imageUrl} alt="الصورة الحالية" />
            )}
          </label>

          {error && <div className="error-box span-2">{error}</div>}

          <div className="modal-actions span-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              إلغاء
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة المنتج'}
            </button>
          </div>
        </form>
      </div>

      {showCategoryModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <button type="button" className="modal-close" onClick={() => setShowCategoryModal(false)} aria-label="إغلاق">
              ✕
            </button>
            <h2>تصنيف جديد</h2>
            <form onSubmit={handleCreateCategory} className="form-stack">
              <label>
                اسم التصنيف
                <input type="text" value={catName} onChange={(e) => setCatName(e.target.value)} autoFocus required />
              </label>
              <label>
                التصنيف الأب
                <select value={String(catParent)} onChange={(e) => setCatParent(e.target.value)}>
                  <option value="">تصنيف رئيسي</option>
                  {selectOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {'\u2003'.repeat(c.depth) + c.name}
                    </option>
                  ))}
                </select>
              </label>
              {catError && <div className="error-box">{catError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCategoryModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn-primary" disabled={catBusy}>
                  {catBusy ? 'جارٍ الإنشاء...' : 'إنشاء'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}