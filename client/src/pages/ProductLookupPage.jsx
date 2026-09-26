import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import QrScannerDialog from '../components/QrScannerDialog.jsx'

const fmt = (n) => Number(n).toFixed(2)
const RESULT_LIMIT = 50
const SEARCH_DEBOUNCE_MS = 300

const EMPTY_SCAN = { code: '', product: null, error: '' }

export default function ProductLookupPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  // نتيجة المسح محفوظة في حالة منفصلة عن البحث النصي حتى لا يتعارضا
  const [scan, setScan] = useState(EMPTY_SCAN)
  const [scanning, setScanning] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)

  const inputRef = useRef(null)
  const requestSeq = useRef(0)

  const term = query.trim()

  // بحث بالاسم أو الباركود، مع تأخير بسيط لتقليل الطلبات أثناء الكتابة
  useEffect(() => {
    if (!term) {
      setResults([])
      setSearching(false)
      setSearchError('')
      return undefined
    }

    let active = true
    requestSeq.current += 1
    const seq = requestSeq.current
    setSearching(true)

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ active: '1', limit: String(RESULT_LIMIT), q: term })
        const res = await api.get(`/api/products?${params.toString()}`)
        if (!active || seq !== requestSeq.current) return
        setResults(res.products || [])
        setSearchError('')
      } catch (err) {
        if (!active || seq !== requestSeq.current) return
        setResults([])
        setSearchError(err.message)
      } finally {
        if (active && seq === requestSeq.current) setSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [term])

  // نبرز نتيجة واحدة فقط: تطابق باركود بالضبط، أو اسم المنتج كاملًا.
  // أي بحث جزئي يبقى في جدول النتائج.
  const exact = useMemo(() => {
    if (!term) return null
    const lower = term.toLowerCase()
    return (
      results.find((p) => p.barcode && String(p.barcode).toLowerCase() === lower) ||
      results.find((p) => p.name.trim().toLowerCase() === lower) ||
      null
    )
  }, [results, term])

  const otherResults = useMemo(
    () => (exact ? results.filter((p) => p.id !== exact.id) : results),
    [results, exact]
  )

  // المسح يطابق الباركود بالضبط — أدق من البحث الجزئي، خصوصًا إذا حمل الـ QR نصًا طويلًا
  const handleScan = useCallback(async (code) => {
    setScanOpen(false)
    setScan({ code, product: null, error: '' })
    setScanning(true)
    try {
      const params = new URLSearchParams({ active: '1', barcode: code })
      const res = await api.get(`/api/products?${params.toString()}`)
      const found = (res.products || [])[0] || null
      setScan(
        found
          ? { code, product: found, error: '' }
          : { code, product: null, error: `لا يوجد منتج مسجّل بالباركود: ${code}` }
      )
    } catch (err) {
      setScan({ code, product: null, error: err.message })
    } finally {
      setScanning(false)
    }
  }, [])

  const featured = scan.product || exact
  const busy = searching || scanning
  const activeError = scan.error || searchError
  const hasNothing = !busy && !featured && otherResults.length === 0 && !activeError
  const showIntro = hasNothing && !term && !scan.code
  const showNoResults = hasNothing && !showIntro

  const clearAll = () => {
    setQuery('')
    setResults([])
    setSearchError('')
    setScan(EMPTY_SCAN)
    inputRef.current?.focus()
  }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>الاستعلام عن المنتجات</h1>
        <Link to="/" className="btn-secondary">⇦ رجوع للرئيسية</Link>
      </div>

      <p className="lookup-intro">
        اكتب اسم المنتج أو امسح رمز الـ QR / الباركود ليظهر سعره فورًا.
      </p>

      <section className="invoice-card lookup-search-card">
        <div className="field-group">
          <span className="field-label">اسم المنتج أو الكود</span>
          <div className="lookup-search-row">
            <input
              ref={inputRef}
              type="text"
              className="autocomplete-input lookup-search-input"
              value={query}
              placeholder="اكتب اسم المنتج أو الكود..."
              onChange={(e) => {
                setQuery(e.target.value)
                setScan(EMPTY_SCAN)
                setSearchError('')
              }}
              onKeyDown={(e) => e.key === 'Escape' && clearAll()}
              autoComplete="off"
            />
            <button type="button" className="btn-secondary btn-scan" onClick={() => setScanOpen(true)}>
              📷 مسح
            </button>
            {(term || scan.code) && (
              <button type="button" className="btn-secondary btn-scan btn-clear" onClick={clearAll} aria-label="مسح البحث">
                ✕
              </button>
            )}
          </div>
        </div>
        <div className="lookup-hints">
          <span className="lookup-hint-chip">مسح بالكاميرا</span>
          <span className="lookup-hint-chip">أو رفع صورة الرمز</span>
          <span className="lookup-hint-chip">أو كتابة الكود يدويًا</span>
        </div>
      </section>

      {activeError && <div className="error-box invoice-alert">{activeError}</div>}
      {busy && <div className="lookup-status">جارٍ البحث...</div>}

      {featured && (
        <section className="lookup-feature">
          {featured.imageUrl && (
            <img className="lookup-feature-img" src={featured.imageUrl} alt={featured.name} />
          )}
          <div className="lookup-feature-body">
            <h2 className="lookup-feature-name">{featured.name}</h2>
            <div className="lookup-feature-tags">
              {featured.categoryName && <span className="lookup-tag">{featured.categoryName}</span>}
              {featured.isService && <span className="lookup-tag lookup-tag-service">خدمة</span>}
              {scan.product && <span className="lookup-tag lookup-tag-scan">تم المسح</span>}
            </div>
            <div className="lookup-feature-prices">
              <div className="lookup-price-box">
                <span className="lookup-price-label">سعر البيع</span>
                <span className="lookup-price-value">{fmt(featured.retailPrice)}</span>
              </div>
              <div className="lookup-price-box">
                <span className="lookup-price-label">الكمية المتاحة</span>
                <span className="lookup-price-value">{Number(featured.quantity) || 0}</span>
              </div>
              {isAdmin && (
                <>
                  <div className="lookup-price-box">
                    <span className="lookup-price-label">سعر الجملة</span>
                    <span className="lookup-price-value">{fmt(featured.wholesalePrice)}</span>
                  </div>
                  <div className="lookup-price-box">
                    <span className="lookup-price-label">سعر التكلفة</span>
                    <span className="lookup-price-value">{fmt(featured.costPrice)}</span>
                  </div>
                </>
              )}
            </div>
            <div className="lookup-feature-barcode">
              <span className="muted">الباركود: </span>
              <span className="lookup-code">{featured.barcode || '—'}</span>
            </div>
          </div>
        </section>
      )}

      {otherResults.length > 0 && (
        <div className="lines-block lookup-results">
          <div className="lines-toolbar">
            <span className="muted">نتائج أخرى ({otherResults.length})</span>
          </div>
          <div className="table-wrap">
            <table className="data-table data-table-cards lookup-table">
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>التصنيف</th>
                  <th>الباركود</th>
                  <th>سعر البيع</th>
                  <th>الكمية</th>
                  {isAdmin && <th>سعر الجملة</th>}
                  {isAdmin && <th>سعر التكلفة</th>}
                </tr>
              </thead>
              <tbody>
                {otherResults.map((p) => (
                  <tr key={p.id}>
                    <td data-label="المنتج">
                      {p.name}
                      {p.isService ? <span className="tx-new-badge">خدمة</span> : ''}
                    </td>
                    <td data-label="التصنيف">{p.categoryName || '—'}</td>
                    <td data-label="الباركود" className="barcode-cell">{p.barcode || '—'}</td>
                    <td data-label="سعر البيع" className="cell-total">{fmt(p.retailPrice)}</td>
                    <td data-label="الكمية" className="cell-center">{Number(p.quantity) || 0}</td>
                    {isAdmin && <td data-label="سعر الجملة">{fmt(p.wholesalePrice)}</td>}
                    {isAdmin && <td data-label="سعر التكلفة">{fmt(p.costPrice)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showIntro && (
        <div className="lookup-empty">
          <div className="lookup-empty-icon">🔍</div>
          <p>اكتب اسم المنتج أو اضغط «مسح» لمسح رمز الـ QR لمعرفة السعر والكمية المتاحة.</p>
        </div>
      )}

      {showNoResults && (
        <div className="lookup-empty">
          <div className="lookup-empty-icon">🔎</div>
          <p>لا يوجد منتج يطابق «{term || scan.code}».</p>
        </div>
      )}

      {scanOpen && (
        <QrScannerDialog title="مسح رمز المنتج" onResult={handleScan} onClose={() => setScanOpen(false)} />
      )}
    </div>
  )
}
