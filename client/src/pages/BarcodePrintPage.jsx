import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api.js'
import IntInput from '../components/IntInput.jsx'

const MAX_COPIES = 50

export default function BarcodePrintPage() {
  const [products, setProducts] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [copies, setCopies] = useState('1')
  const [preparing, setPreparing] = useState(false)
  const [printItems, setPrintItems] = useState(null)

  useEffect(() => {
    let active = true
    api
      .get('/api/products')
      .then((data) => {
        if (active) setProducts(data.products)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    const list = products || []
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode && String(p.barcode).toLowerCase().includes(q))
    )
  }, [products, search])

  const printableFiltered = useMemo(() => filtered.filter((p) => p.barcode), [filtered])
  const allSelected =
    printableFiltered.length > 0 && printableFiltered.every((p) => selected.has(p.id))

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        printableFiltered.forEach((p) => next.delete(p.id))
      } else {
        printableFiltered.forEach((p) => next.add(p.id))
      }
      return next
    })
  }

  const copiesNum = Math.min(Math.max(Number(copies) || 1, 1), MAX_COPIES)

  const openPrint = async () => {
    setError('')
    const chosen = (products || []).filter((p) => selected.has(p.id) && p.barcode)
    if (chosen.length === 0) {
      setError('اختر منتجًا واحدًا على الأقل له باركود')
      return
    }
    setPreparing(true)
    try {
      await api.post('/api/barcodes/ensure', { barcodes: chosen.map((p) => p.barcode) })
      const items = []
      for (const p of chosen) {
        for (let i = 0; i < copiesNum; i += 1) items.push(p)
      }
      setPrintItems(items)
    } catch (err) {
      setError(err.message)
    } finally {
      setPreparing(false)
    }
  }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>طباعة الباركود</h1>
      </div>

      {error && <div className="error-box backup-alert">{error}</div>}

      <div className="filter-row barcode-toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="بحث بالاسم أو الباركود..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="btn-secondary" onClick={toggleAll}>
          {allSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
        </button>
        <div className="barcode-copies">
          <span className="field-label">نسخ لكل منتج</span>
          <IntInput value={copies} onChange={setCopies} placeholder="1" />
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={openPrint}
          disabled={preparing || selected.size === 0}
        >
          {preparing ? 'جارٍ التجهيز...' : `🖨 طباعة المحدد (${selected.size})`}
        </button>
      </div>

      {products === null ? (
        <div className="page-placeholder">جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="page-placeholder">
          <p>{search ? 'لا توجد نتائج مطابقة للبحث.' : 'لا توجد منتجات بعد.'}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table data-table-cards">
            <thead>
              <tr>
                <th style={{ width: 48 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="تحديد الكل"
                  />
                </th>
                <th>المنتج</th>
                <th>الباركود</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className={selected.has(p.id) ? 'selected' : ''}>
                  <td data-label="تحديد">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      disabled={!p.barcode}
                      onChange={() => toggle(p.id)}
                      aria-label={`تحديد ${p.name}`}
                    />
                  </td>
                  <td data-label="المنتج">{p.name}</td>
                  <td data-label="الباركود" className="barcode-cell">
                    {p.barcode || <span className="muted">لا يوجد باركود</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {printItems &&
        createPortal(
          <div className="print-overlay">
            <div className="print-toolbar">
              <span className="muted">عدد الملصقات: {printItems.length}</span>
              <button type="button" className="btn-primary" onClick={() => window.print()}>
                🖨 طباعة
              </button>
              <button type="button" className="btn-secondary" onClick={() => setPrintItems(null)}>
                إغلاق
              </button>
            </div>
            <div className="print-sheet">
              {printItems.map((p, i) => (
                <div className="barcode-tag" key={`${p.id}-${i}`}>
                  <div className="barcode-tag-name">{p.name}</div>
                  <img src={`/barcodes/${p.barcode}.png`} alt={`باركود ${p.name}`} />
                  <div className="barcode-tag-code">{p.barcode}</div>
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
