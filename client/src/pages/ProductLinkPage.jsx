import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { extractScanCode } from '../utils/scanCode.js'

const fmt = (n) => Number(n || 0).toFixed(2)

/**
 * Product page opened by a phone's own camera app after it reads the QR on a
 * printed label, e.g. http://192.168.1.5:3000/l/8F3A2B
 *
 * It is deliberately plain HTTP: a browser blocks getUserMedia on an insecure
 * origin, but plain navigation and fetch do not care, so the phone needs no
 * certificate and no browser permission. The page is also what the desktop
 * scanner's deep links land on.
 */
export default function ProductLinkPage() {
  const { code: rawCode } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const code = extractScanCode(rawCode)

  const [product, setProduct] = useState(null)
  const [state, setState] = useState(code ? 'loading' : 'invalid')
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const requestId = useRef(0)

  const load = useCallback(() => {
    if (!code) {
      setState('invalid')
      return
    }
    const seq = (requestId.current += 1)
    setState('loading')
    setError('')
    api
      .get(`/api/products?active=1&barcode=${encodeURIComponent(code)}`)
      .then((data) => {
        if (seq !== requestId.current) return
        const found = (data.products || [])[0] || null
        setProduct(found)
        setState(found ? 'ready' : 'missing')
      })
      .catch((err) => {
        if (seq !== requestId.current) return
        setError(err.message)
        setState('error')
      })
  }, [code])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  // Scanning the same label twice leaves the phone on an identical URL, so the
  // router never remounts this page. Refreshing when the tab becomes visible
  // again is what makes back-to-back scans update the price.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  return (
    <div className="page page-wide scan-landing">
      <div className="page-header">
        <h1>المنتج</h1>
        {code && <span className="scan-landing-code">{code}</span>}
      </div>

      {state === 'loading' && <div className="page-placeholder">جارٍ جلب بيانات المنتج...</div>}

      {state === 'invalid' && (
        <div className="page-placeholder">
          <p>رابط المسح غير صالح.</p>
          <p className="muted">تأكد إن الملصق مطبوع من هذا الجهاز.</p>
          <Link className="btn-secondary" to="/">
            رجوع للرئيسية
          </Link>
        </div>
      )}

      {state === 'error' && (
        <div className="error-box">
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={load}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {state === 'missing' && (
        <div className="page-placeholder">
          <p>لا يوجد منتج بهذا الباركود.</p>
          <p className="muted">{code}</p>
          <Link className="btn-secondary" to="/">
            رجوع للرئيسية
          </Link>
        </div>
      )}

      {state === 'ready' && product && (
        <>
          <div className="scan-product">
            {isAdmin && product.imageUrl && (
              <img className="scan-product-image" src={product.imageUrl} alt={product.name} />
            )}
            <h2 className="scan-product-name">{product.name}</h2>
            {isAdmin && product.categoryName && <p className="muted">{product.categoryName}</p>}

            <div className="scan-price-block">
              <span className="scan-price-label">سعر البيع</span>
              <span className="scan-product-price">{fmt(product.retailPrice)}</span>
            </div>

            {/* An employee only ever needs the name and the price they can sell
                at, so costs, stock and the barcode stay behind the admin view. */}
            {isAdmin && (
              <dl className="scan-product-details">
                <div className="scan-product-detail">
                  <dt>سعر الجملة</dt>
                  <dd>{fmt(product.wholesalePrice)}</dd>
                </div>
                <div className="scan-product-detail">
                  <dt>التكلفة</dt>
                  <dd>{fmt(product.costPrice)}</dd>
                </div>
                <div className="scan-product-detail">
                  <dt>الكمية في المخزن</dt>
                  <dd>{fmt(product.quantity)}</dd>
                </div>
                <div className="scan-product-detail">
                  <dt>الباركود</dt>
                  <dd>{product.barcode || '—'}</dd>
                </div>
              </dl>
            )}
          </div>

          <div className="scan-landing-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate(`/sales-invoice?code=${encodeURIComponent(product.barcode || code)}`)}
            >
              بيع هذا المنتج
            </button>
            <button type="button" className="btn-secondary" onClick={load}>
              تحديث
            </button>
          </div>
        </>
      )}
    </div>
  )
}
