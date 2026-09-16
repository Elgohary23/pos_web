import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import MoneyInput from '../components/MoneyInput.jsx'
import IntInput from '../components/IntInput.jsx'

const fmt = (n) => Number(n).toFixed(2)

export default function SalesInvoicePage() {
  const { user } = useAuth()
  const isEmployee = user?.role === 'employee'

  const [invoiceType, setInvoiceType] = useState('product_sale')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [discountType, setDiscountType] = useState('none')
  const [discountPercent, setDiscountPercent] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [notes, setNotes] = useState('')

  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])

  // product search
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const searchRef = useRef(null)

  const [qty, setQty] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')

  const [lines, setLines] = useState([])
  const [selected, setSelected] = useState(() => new Set())

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const loadLookups = async () => {
    try {
      const [p, c] = await Promise.all([
        api.get('/api/products?active=1'),
        api.get('/api/customers?limit=100'),
      ])
      setProducts(p.products || [])
      setCustomers(c.customers || [])
    } catch { /* تجاهل */ }
  }

  useEffect(() => {
    loadLookups()
  }, [])

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.barcode && String(p.barcode).toLowerCase().includes(q))
    )
  }, [search, products])

  const filteredCustomers = useMemo(() => {
    const q = customerName.trim().toLowerCase()
    if (!q) return []
    return customers.filter((c) => c.name.toLowerCase().includes(q))
  }, [customerName, customers])

  // ----- search keyboard & outside click -----
  useEffect(() => {
    const onOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const handleSearchKey = (e) => {
    if (!searchOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSearchOpen(true) }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filteredProducts.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (highlight >= 0 && filteredProducts[highlight]) {
        e.preventDefault()
        selectProduct(filteredProducts[highlight])
      } else if (filteredProducts.length === 1 && filteredProducts[0]) {
        e.preventDefault()
        selectProduct(filteredProducts[0])
      } else {
        setSearchOpen(false)
      }
    } else if (e.key === 'Escape') {
      setSearchOpen(false)
    }
  }

  const selectProduct = (p) => {
    setSearch(p.name)
    setSearchOpen(false)
    setUnitPrice(String(Number(p.retailPrice) || 0))
  }

  const selectCustomer = (c) => {
    setCustomerName(c.name)
    if (c.phone) setCustomerPhone(c.phone)
  }

  // ----- computed totals -----
  const percent = discountType === 'free' ? 100 : discountPercent === '' ? 0 : Number(discountPercent) || 0
  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.unit_price * l.quantity, 0),
    [lines]
  )
  const discountValue = discountType === 'none' ? 0 : (subtotal * percent) / 100
  const totalAfterDiscount = subtotal - discountValue
  const paid = paidAmount === '' ? 0 : Number(paidAmount) || 0
  const remaining = totalAfterDiscount - paid

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

    const q = search.trim().toLowerCase()
    const match =
      filteredProducts.find((p) => p.name.toLowerCase() === q) ||
      filteredProducts.find((p) => p.barcode && String(p.barcode).toLowerCase() === q)

    if (!match) {
      setError('اختر منتجًا من القائمة (بحث بالاسم أو الباركود)')
      return
    }

    const priceNum = unitPrice === '' ? NaN : Number(unitPrice)
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError('سعر الوحدة يجب أن يكون رقمًا موجبًا')
      return
    }
    const qtyNum = qty === '' ? NaN : Number(qty)
    if (!Number.isInteger(qtyNum) || qtyNum < 1) {
      setError('الكمية يجب أن تكون عددًا صحيحًا موجبًا')
      return
    }

    const line = {
      product_id: match.id,
      name: match.name,
      barcode: match.barcode || null,
      is_service: Boolean(match.isService),
      quantity: qtyNum,
      unit_price: Math.round(priceNum * 100) / 100,
      line_total: Math.round(priceNum * qtyNum * 100) / 100,
    }

    setLines((prev) => [...prev, line])
    setSearch('')
    setQty('1')
    setUnitPrice('')
  }

  const handleDeleteSelected = () => {
    setLines((prev) => prev.filter((_, i) => !selected.has(i)))
    setSelected(new Set())
  }

  const handleSave = async () => {
    setError('')
    setSuccess('')
    if (lines.length === 0) {
      setError('أضف بنودًا على الأقل')
      return
    }
    if (discountType === 'variable' && (!discountPercent || Number(discountPercent) <= 0)) {
      setError('أدخل نسبة الخصم')
      return
    }
    if (isEmployee && discountType === 'variable') {
      if (!customerName.trim()) {
        setError('يجب إدخال اسم العميل عند تطبيق خصم متغير')
        return
      }
      if (!notes.trim()) {
        setError('يجب إدخال ملاحظات إضافية عند تطبيق خصم متغير')
        return
      }
    }
    if (paid > totalAfterDiscount) {
      setError('المبلغ المدفوع أكبر من إجمالي الفاتورة')
      return
    }

    setSaving(true)
    try {
      const res = await api.post('/api/sales-invoices', {
        invoice_type: invoiceType,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        discount_type: discountType,
        discount_percent: discountType === 'variable' ? Number(discountPercent) : undefined,
        paid_amount: paidAmount === '' ? undefined : paid,
        notes: notes.trim() || undefined,
        items: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
        })),
      })
      const inv = res.invoice
      setSuccess(`تم حفظ فاتورة البيع رقم ${inv.invoice_id} — الصافي ${fmt(inv.total_after_discount)}`)
      setLines([])
      setSelected(new Set())
      setCustomerName('')
      setCustomerPhone('')
      setDiscountType('none')
      setDiscountPercent('')
      setPaidAmount('')
      setNotes('')
      setInvoiceType('product_sale')
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
        <h1>فاتورة بيع</h1>
        <Link to="/" className="btn-secondary">⇦ رجوع للرئيسية</Link>
      </div>

      {error && <div className="error-box invoice-alert">{error}</div>}
      {success && <div className="success-box invoice-alert">{success}</div>}

      <div className="invoice-grid">
        <section className="invoice-card">
          <h2 className="invoice-card-title">بيانات الفاتورة</h2>

          <div className="kind-radio-row">
            <label className={'kind-radio' + (invoiceType === 'product_sale' ? ' active' : '')}>
              <input type="radio" name="invoiceType" value="product_sale"
                checked={invoiceType === 'product_sale'}
                onChange={() => setInvoiceType('product_sale')} />
              بيع منتجات
            </label>
            <label className={'kind-radio' + (invoiceType === 'service_sale' ? ' active' : '')}>
              <input type="radio" name="invoiceType" value="service_sale"
                checked={invoiceType === 'service_sale'}
                onChange={() => setInvoiceType('service_sale')} />
              بيع خدمات
            </label>
            <label className={'kind-radio' + (invoiceType === 'reservation' ? ' active' : '')}>
              <input type="radio" name="invoiceType" value="reservation"
                checked={invoiceType === 'reservation'}
                onChange={() => setInvoiceType('reservation')} />
              حجز
            </label>
          </div>

          <div className="field-group">
            <span className="field-label">
              اسم العميل {isEmployee && discountType === 'variable' ? <span className="hint required">مطلوب لخصم المتغير</span> : <span className="hint">(اختياري — يمكن كتابة اسم جديد)</span>}
            </span>
            <div className="autocomplete-wrap">
              <input
                type="text"
                className="autocomplete-input"
                value={customerName}
                placeholder="اختر عميلًا أو اكتب اسمًا جديدًا..."
                onChange={(e) => setCustomerName(e.target.value)}
                autoComplete="off"
              />
              {filteredCustomers.length > 0 && (
                <ul className="autocomplete-list">
                  {filteredCustomers.slice(0, 8).map((c) => (
                    <li key={c.customer_id} className="autocomplete-item" onMouseDown={() => selectCustomer(c)}>
                      {c.name}{c.phone ? <span className="muted"> — {c.phone}</span> : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="field-group">
            <span className="field-label">هاتف العميل</span>
            <input
              type="text"
              inputMode="tel"
              className="money-input"
              value={customerPhone}
              placeholder="01xxxxxxxxx"
              onChange={(e) => setCustomerPhone(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="field-group">
            <span className="field-label">نوع الخصم</span>
            <div className="kind-radio-row">
              <label className={'kind-radio' + (discountType === 'none' ? ' active' : '')}>
                <input type="radio" name="discountType" value="none"
                  checked={discountType === 'none'}
                  onChange={() => { setDiscountType('none'); setDiscountPercent('') }} />
                بدون خصم
              </label>
              <label className={'kind-radio' + (discountType === 'variable' ? ' active' : '')}>
                <input type="radio" name="discountType" value="variable"
                  checked={discountType === 'variable'}
                  onChange={() => setDiscountType('variable')} />
                خصم متغير
              </label>
              <label className={'kind-radio' + (discountType === 'free' ? ' active' : '')}>
                <input type="radio" name="discountType" value="free"
                  checked={discountType === 'free'}
                  onChange={() => { setDiscountType('free'); setDiscountPercent('100') }} />
                فاتورة مجانية
              </label>
            </div>
          </div>

          {discountType === 'variable' && (
            <div className="field-group">
              <span className="field-label">نسبة الخصم %</span>
              <MoneyInput value={discountPercent} onChange={setDiscountPercent} placeholder="10" />
            </div>
          )}

          <div className="field-group">
            <span className="field-label">المبلغ المدفوع</span>
            <MoneyInput value={paidAmount} onChange={setPaidAmount} placeholder="0.00" />
          </div>
        </section>

        <section className="invoice-card">
          <h2 className="invoice-card-title">إضافة بند</h2>
          <div className="invoice-item-fields">
            <div className="field-group">
              <span className="field-label">بحث المنتج (الاسم أو الباركود)</span>
              <div className="product-search-wrap" ref={searchRef}>
                <input
                  type="text"
                  className="autocomplete-input product-search-input"
                  value={search}
                  placeholder="اكتب اسم المنتج أو الباركود..."
                  onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); setHighlight(-1) }}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={handleSearchKey}
                  autoComplete="off"
                />
                {searchOpen && filteredProducts.length > 0 && (
                  <ul className="autocomplete-list product-search-list">
                    {filteredProducts.slice(0, 10).map((p, i) => (
                      <li
                        key={p.id}
                        className={i === highlight ? 'autocomplete-item active product-search-item' : 'autocomplete-item product-search-item'}
                        onMouseDown={() => selectProduct(p)}
                      >
                        <span className="product-search-name">{p.name}</span>
                        <span className="product-search-meta">
                          {p.barcode ? <span className="muted">{p.barcode}</span> : ''}
                          <span className="product-search-price">{Number(p.retailPrice).toFixed(2)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="field-group">
              <span className="field-label">الكمية</span>
              <IntInput value={qty} onChange={setQty} placeholder="1" />
            </div>
            <div className="field-group">
              <span className="field-label">سعر الوحدة</span>
              <MoneyInput value={unitPrice} onChange={setUnitPrice} placeholder="0.00" />
            </div>
            <button type="button" className="btn-primary btn-add-line" onClick={handleAdd}>
              ➕ إضافة
            </button>
          </div>
        </section>
      </div>

      <div className="lines-block">
        <div className="lines-toolbar">
          <span className="muted">البنود ({lines.length})</span>
          <button type="button" className="btn-danger btn-compact" disabled={selected.size === 0} onClick={handleDeleteSelected}>
            🗑 حذف المحدد
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table data-table-cards lines-table sales-lines-table">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th style={{ width: 220 }}>المنتج</th>
                <th style={{ width: 130 }}>الباركود</th>
                <th style={{ width: 60 }}>الكمية</th>
                <th style={{ width: 100 }}>سعر الوحدة</th>
                <th style={{ width: 110 }}>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">أضف بنودًا من الأعلى</td>
                </tr>
              ) : (
                lines.map((l, i) => (
                  <tr key={i} className={selected.has(i) ? 'selected' : ''}>
                    <td>
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelect(i)} aria-label={`تحديد بند ${l.name}`} />
                    </td>
                    <td data-label="المنتج">{l.name}{l.is_service ? <span className="tx-new-badge">خدمة</span> : ''}</td>
                    <td data-label="الباركود" className="barcode-cell">{l.barcode || '—'}</td>
                    <td data-label="الكمية" className="cell-center">{l.quantity}</td>
                    <td data-label="سعر الوحدة">{fmt(l.unit_price)}</td>
                    <td data-label="الإجمالي" className="cell-total">{fmt(l.line_total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sales-totals">
        <div className="sales-total-row">
          <span>الإجمالي قبل الخصم</span>
          <span>{fmt(subtotal)}</span>
        </div>
        {discountType !== 'none' && (
          <div className="sales-total-row">
            <span>الخصم {discountType === 'free' ? '(مجاني)' : `(${percent}%)`}</span>
            <span className="neg">- {fmt(discountValue)}</span>
          </div>
        )}
        <div className="sales-total-row sales-total-grand">
          <span>الصافي</span>
          <span>{fmt(totalAfterDiscount)}</span>
        </div>
        <div className="sales-total-row">
          <span>المدفوع</span>
          <span>{fmt(paid)}</span>
        </div>
        <div className="sales-total-row">
          <span>المتبقي</span>
          <span className={remaining > 0 ? 'neg' : ''}>{fmt(remaining)}</span>
        </div>
      </div>

      <div className="field-group invoice-notes">
        <span className="field-label">
          ملاحظات {isEmployee && discountType === 'variable' ? <span className="hint required">مطلوبة لخصم المتغير</span> : ''}
        </span>
        <textarea className="notes-textarea" rows={2} value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ملاحظات إضافية على الفاتورة (اختياري)" />
      </div>

      <button type="button" className="btn-primary btn-save-invoice" onClick={handleSave} disabled={saving}>
        {saving ? 'جارٍ الحفظ...' : '💾 حفظ فاتورة البيع'}
      </button>
    </div>
  )
}