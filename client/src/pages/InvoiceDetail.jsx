import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { formatShiftAr, formatDateTimeAr } from '../utils/time.js'

const fmt = (n) => Number(n).toFixed(2)

function DetailField({ label, children }) {
  return (
    <div className="inv-detail-field">
      <span className="field-label">{label}</span>
      <span>{children ?? '—'}</span>
    </div>
  )
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const backDate = searchParams.get('date') || ''
  const backUrl = backDate ? `/transactions?date=${backDate}` : '/transactions'

  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError('')
    api
      .get(`/api/transactions/${id}`)
      .then((d) => {
        if (!cancel) setData(d)
      })
      .catch((err) => {
        if (!cancel) {
          setData(null)
          setError(err.message)
        }
      })
      .finally(() => {
        if (!cancel) setLoading(false)
      })
    return () => {
      cancel = true
    }
  }, [id])

  if (loading) return <div className="page-placeholder">جارٍ التحميل...</div>
  if (error) return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>تفاصيل الفاتورة</h1>
        <Link to={backUrl} className="btn-secondary">⇨ رجوع للسجل</Link>
      </div>
      <div className="error-box">{error}</div>
    </div>
  )

  const { invoice: inv, items } = data

  const subtotal = items.reduce((sum, it) => sum + it.line_total, 0)
  const grandTotal = inv.total_amount

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>{inv.kind === 'supply' ? 'فاتورة توريد' : 'فاتورة مترجع'} رقم #{inv.id}</h1>
        <Link to={backUrl} className="btn-secondary">⇨ رجوع للسجل</Link>
      </div>

      <div className="inv-detail-head">
        <span className={'tx-kind' + (inv.kind === 'supply' ? ' tx-kind-supply' : ' tx-kind-return')}>
          {inv.kind === 'supply' ? 'فاتورة توريد' : 'فاتورة مترجع'}
        </span>
        <span className={'tx-badge-shift' + (inv.in_shift ? ' in' : ' out')}>
          {inv.in_shift ? 'داخل ساعات العمل' : 'خارج ساعات العمل'}
        </span>
      </div>

      <div className="inv-detail-grid">
        <DetailField label="القائم بالمعاملة">
          {inv.user_name} <span className="tx-inv-username">({inv.username})</span>
        </DetailField>
        <DetailField label="التاريخ والوقت">
          {formatDateTimeAr(inv.created_at)}
        </DetailField>
        <DetailField label="المورد">
          {inv.supplier_name}
        </DetailField>
        <DetailField label="مصاريف الشحن">
          {inv.shipping_cost !== 0 ? fmt(inv.shipping_cost) : '—'}
        </DetailField>
        <DetailField label="ملاحظات" >
          <span className="inv-detail-notes">{inv.notes}</span>
        </DetailField>
      </div>

      <div className="inv-detail-items-title">
        بنود الفاتورة <span className="muted">({items.length} بند)</span>
      </div>

      <div className="table-wrap">
        <table className="data-table data-table-cards inv-items-table">
          <thead>
            <tr>
              <th style={{ width: 180 }}>المنتج</th>
              <th style={{ width: 110 }}>التصنيف</th>
              <th style={{ width: 60 }}>الكمية</th>
              <th style={{ width: 100 }}>تكلفة الوحدة</th>
              <th style={{ width: 100 }}>سعر البيع</th>
              <th style={{ width: 110 }}>الإجمالي</th>
              <th style={{ width: 130 }}>الباركود</th>
              <th style={{ width: 70 }}>جديد؟</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.item_id}>
                <td data-label="المنتج">{it.product_name}</td>
                <td data-label="التصنيف">{it.category_name}</td>
                <td data-label="الكمية" className="cell-center">{it.quantity}</td>
                <td data-label="تكلفة الوحدة">{fmt(it.unit_cost)}</td>
                <td data-label="سعر البيع">{it.retail_price !== null ? fmt(it.retail_price) : '—'}</td>
                <td data-label="الإجمالي" className="cell-total">{fmt(it.line_total)}</td>
                <td data-label="الباركود">
                  {it.barcode && (
                    <>
                      {it.is_new_product && (
                        <img src={`/barcodes/${it.barcode}.png`} alt={it.barcode} className="inv-barcode-img" />
                      )}
                      <span className="barcode-cell">{it.barcode}</span>
                    </>
                  )}
                </td>
                <td data-label="جديد؟">
                  {it.is_new_product ? <span className="tx-new-badge">جديد</span> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="inv-detail-totals">
        <div className="inv-total-row">
          <span>مجموع البنود</span>
          <span>{fmt(subtotal)}</span>
        </div>
        <div className="inv-total-row">
          <span>مصاريف الشحن</span>
          <span>{inv.shipping_cost !== 0 ? fmt(inv.shipping_cost) : '0.00'}</span>
        </div>
        <div className={'inv-total-row inv-total-grand' + (grandTotal < 0 ? ' neg' : '')}>
          <span>الإجمالي</span>
          <span>{fmt(grandTotal)}</span>
        </div>
      </div>
    </div>
  )
}