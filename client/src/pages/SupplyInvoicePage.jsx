import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import AutocompleteInput from '../components/AutocompleteInput.jsx'
import MoneyInput from '../components/MoneyInput.jsx'
import IntInput from '../components/IntInput.jsx'
import LinesTable from '../components/LinesTable.jsx'
import BarcodeDialog from '../components/BarcodeDialog.jsx'

export default function SupplyInvoicePage() {
  const [kind, setKind] = useState('supply')
  const [supplierName, setSupplierName] = useState('')
  const [shipping, setShipping] = useState('')

  const [productName, setProductName] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [retailPrice, setRetailPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [categoryName, setCategoryName] = useState('')

  const [lines, setLines] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [notes, setNotes] = useState('')

  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [dialogProducts, setDialogProducts] = useState(null)

  const loadLookups = async () => {
    try {
      const [s, p, c] = await Promise.all([
        api.get('/api/suppliers'),
        api.get('/api/products?active=1'),
        api.get('/api/categories'),
      ])
      setSuppliers((s.suppliers || []).map((x) => ({ id: x.id, name: x.name })))
      setProducts((p.products || []).map((x) => ({ id: x.id, name: x.name, quantity: x.quantity })))
      setCategories((c.categories || []).map((x) => ({ id: x.id, name: x.name })))
    } catch { /* تجاهل — أخطاء العرض تظهر أثناء الحفظ */ }
  }

  useEffect(() => {
    loadLookups()
  }, [])

  const shippingNum = shipping === '' ? 0 : Number(shipping)

  const total = useMemo(() => {
    const subtotal = lines.reduce((sum, l) => sum + l.unit_cost * l.quantity, 0)
    const signed = kind === 'return' ? -subtotal : subtotal
    return (signed + (Number.isFinite(shippingNum) ? shippingNum : 0)).toFixed(2)
  }, [lines, kind, shippingNum])

  const toggleSelect = (index) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const handleAdd = () => {
    setError('')
    setSuccess('')

    const name = productName.trim()
    if (!name) {
      setError('اسم المنتج مطلوب')
      return
    }
    const costNum = unitCost === '' ? NaN : Number(unitCost)
    if (!Number.isFinite(costNum) || costNum < 0) {
      setError('سعر التكلفة (جملة) يجب أن يكون رقمًا موجبًا')
      return
    }
    const retailNum = retailPrice === '' ? null : Number(retailPrice)
    if (retailNum !== null && (!Number.isFinite(retailNum) || retailNum < 0)) {
      setError('سعر البيع يجب أن يكون رقمًا موجبًا')
      return
    }
    const isExisting = products.some((p) => p.name.toLowerCase() === name.toLowerCase())
    if (kind === 'supply' && !isExisting && retailNum === null) {
      setError('(سعر البيع) مطلوب (للمنتج الجديد)')
      return
    }
    const qtyNum = qty === '' ? NaN : Number(qty)
    if (!Number.isInteger(qtyNum) || qtyNum < 1) {
      setError('الكمية يجب أن تكون عددًا صحيحًا موجبًا')
      return
    }

    const line = {
      name,
      unit_cost: Math.round(costNum * 100) / 100,
      quantity: qtyNum,
      category_name: categoryName.trim() || undefined,
    }
    if (retailNum !== null) line.retail_price = Math.round(retailNum * 100) / 100

    setLines((prev) => [...prev, line])
    setProductName('')
    setUnitCost('')
    setRetailPrice('')
    setQty('1')
    setCategoryName('')
  }

  const handleDeleteSelected = () => {
    setError('')
    setLines((prev) => {
      const keep = prev.filter((_, i) => !selected.has(i))
      setSelected(new Set())
      return keep
    })
  }

  const handleSave = async () => {
    setError('')
    setSuccess('')
    if (lines.length === 0) {
      setError('أضف بنودًا على الأقل')
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/api/supply-invoices', {
        kind,
        supplier_name: supplierName.trim() || undefined,
        shipping_cost: Number.isFinite(shippingNum) ? shippingNum : 0,
        notes: notes.trim() || undefined,
        items: lines.map((l) => ({
          name: l.name,
          unit_cost: l.unit_cost,
          retail_price: l.retail_price ?? undefined,
          quantity: l.quantity,
          category_name: l.category_name || undefined,
        })),
      })
      const inv = res.invoice
      setSuccess(`تم حفظ ${kind === 'return' ? 'فاتورة المرتجع' : 'فاتورة التوريد'} رقم ${inv.invoice_id}`)
      if (kind === 'supply' && Array.isArray(inv.new_products) && inv.new_products.length > 0) {
        setDialogProducts(inv.new_products)
      }
      setLines([])
      setSelected(new Set())
      setSupplierName('')
      setShipping('')
      setNotes('')
      setKind('supply')
      loadLookups()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>فاتورة توريد / مرتجع</h1>
        <Link to="/" className="btn-secondary">
          ⇦ رجوع للرئيسية
        </Link>
      </div>

      {error && <div className="error-box invoice-alert">{error}</div>}
      {success && <div className="success-box invoice-alert">{success}</div>}

      <div className="invoice-grid">
        <section className="invoice-card">
          <h2 className="invoice-card-title">بيانات الفاتورة</h2>
          <div className="kind-radio-row">
            <label className={'kind-radio' + (kind === 'supply' ? ' active' : '')}>
              <input
                type="radio"
                name="kind"
                value="supply"
                checked={kind === 'supply'}
                onChange={() => setKind('supply')}
              />
              توريد
            </label>
            <label className={'kind-radio' + (kind === 'return' ? ' active' : '')}>
              <input
                type="radio"
                name="kind"
                value="return"
                checked={kind === 'return'}
                onChange={() => setKind('return')}
              />
              مرتجع
            </label>
          </div>

          <div className="field-group">
            <span className="field-label">المورد (اختياري — يمكن كتابة اسم جديد)</span>
            <AutocompleteInput
              value={supplierName}
              onChange={setSupplierName}
              options={suppliers}
              placeholder="اختر موردًا أو اكتب اسمًا جديدًا..."
            />
          </div>

          <div className="field-group">
            <span className="field-label">مصاريف الشحن</span>
            <MoneyInput value={shipping} onChange={setShipping} placeholder="0.00" />
          </div>
        </section>

        <section className="invoice-card">
          <h2 className="invoice-card-title">إضافة بند</h2>
          <div className="invoice-item-fields">
            <div className="field-group">
              <span className="field-label">اسم المنتج</span>
              <AutocompleteInput
                value={productName}
                onChange={setProductName}
                options={products}
                placeholder={kind === 'supply' ? 'اختر أو اكتب اسم منتج جديد...' : 'اختر منتجًا للإرجاع...'}
              />
            </div>
            <div className="field-group">
              <span className="field-label">سعر التكلفة (جملة)</span>
              <MoneyInput value={unitCost} onChange={setUnitCost} placeholder="0.00" />
            </div>
            <div className="field-group">
              <span className="field-label">
                سعر البيع
                <span className="hint">
                  {kind === 'supply' &&
                    (products.some((p) => p.name.toLowerCase() === productName.trim().toLowerCase())
                      ? 'اختياري'
                      : 'مطلوب (للمنتج الجديد)')}
                </span>
              </span>
              <MoneyInput value={retailPrice} onChange={setRetailPrice} placeholder="0.00" />
            </div>
            <div className="field-group">
              <span className="field-label">الكمية</span>
              <IntInput value={qty} onChange={setQty} placeholder="1" />
            </div>
            <div className="field-group">
              <span className="field-label">التصنيف (اختياري)</span>
              <AutocompleteInput
                value={categoryName}
                onChange={setCategoryName}
                options={categories}
                placeholder="اختر أو اكتب تصنيفًا جديدًا..."
              />
            </div>
            <button type="button" className="btn-primary btn-add-line" onClick={handleAdd}>
              ➕ إضافة
            </button>
          </div>
        </section>
      </div>

      <LinesTable lines={lines} selected={selected} onToggle={toggleSelect} onDeleteSelected={handleDeleteSelected} />

      <div className="total-bar">
        <div className="total-bar-label">
          {kind === 'return' ? 'إجمالي المرتجع' : 'الإجمالي'} :
        </div>
        <div className="total-bar-value">{total}</div>
      </div>

      <div className="field-group invoice-notes">
        <span className="field-label">ملاحظات</span>
        <textarea
          className="notes-textarea"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ملاحظات إضافية على الفاتورة (اختياري)"
        />
      </div>

      <button
        type="button"
        className="btn-primary btn-save-invoice"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'جارٍ الحفظ...' : '💾 حفظ الفاتورة'}
      </button>

      {dialogProducts && (
        <BarcodeDialog products={dialogProducts} onClose={() => setDialogProducts(null)} />
      )}
    </div>
  )
}