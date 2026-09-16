import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { formatShiftAr, formatDateTimeAr } from '../utils/time.js'

const fmt = (n) => Number(n).toFixed(2)

const KIND_META = {
  supply: { cls: 'tx-kind-supply', label: 'فاتورة توريد' },
  return: { cls: 'tx-kind-return', label: 'فاتورة مترجع' },
  sale: { cls: 'tx-kind-sale', label: 'فاتورة بيع' },
}

const INVOICE_TYPE_LABELS = {
  product_sale: 'بيع منتجات',
  service_sale: 'بيع خدمات',
  reservation: 'حجز',
}

const DISCOUNT_LABELS = {
  none: 'بدون خصم',
  predefined: 'خصم معرف مسبقًا',
  variable: 'خصم نسبة',
  fixed: 'خصم قيمة',
  free: 'فاتورة مجانية',
}

const STATUS_LABELS = {
  completed: 'مكتملة',
  reserved: 'محجوزة',
  delivered: 'تم التسليم',
  cancelled: 'ملغاة',
}

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
  const isSale = inv.kind === 'sale'
  const meta = KIND_META[inv.kind] || { cls: '', label: inv.kind }

  const subtotal = items.reduce((sum, it) => sum + it.line_total, 0)
  const grandTotal = isSale ? inv.total_after_discount : inv.total_amount

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>{meta.label} رقم #{inv.id}</h1>
        <Link to={backUrl} className="btn-secondary">⇨ رجوع للسجل</Link>
      </div>

      <div className="inv-detail-head">
        <span className={'tx-kind ' + meta.cls}>{meta.label}</span>
        {isSale && inv.invoice_type && (
          <span className="tx-badge-shift in">{INVOICE_TYPE_LABELS[inv.invoice_type] || inv.invoice_type}</span>
        )}
        {isSale && inv.status && (
          <span className="tx-badge-shift in">{STATUS_LABELS[inv.status] || inv.status}</span>
        )}
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
        {isSale ? (
          <>
            <DetailField label="العميل">
              {inv.customer_name}
            </DetailField>
            <DetailField label="نوع الخصم">
              {DISCOUNT_LABELS[inv.discount_type] || inv.discount_type}
            </DetailField>
            {inv.discount_type === 'variable' && (
              <DetailField label="نسبة الخصم">
                {inv.discount_percent}%
              </DetailField>
            )}
            {inv.discount_type === 'fixed' && (
              <DetailField label="قيمة الخصم">
                {fmt(inv.discount_value)}
              </DetailField>
            )}
          </>
        ) : (
          <>
            <DetailField label="المورد">
              {inv.supplier_name}
            </DetailField>
            <DetailField label="مصاريف الشحن">
              {inv.shipping_cost !== 0 ? fmt(inv.shipping_cost) : '—'}
            </DetailField>
          </>
        )}
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
              {isSale ? (
                <>
                  <th style={{ width: 100 }}>السعر الأصلي</th>
                  <th style={{ width: 100 }}>سعر البيع</th>
                  <th style={{ width: 100 }}>التكلفة</th>
                </>
              ) : (
                <>
                  <th style={{ width: 100 }}>تكلفة الوحدة</th>
                  <th style={{ width: 100 }}>سعر البيع</th>
                </>
              )}
              <th style={{ width: 110 }}>الإجمالي</th>
              <th style={{ width: 130 }}>الباركود</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.item_id}>
                <td data-label="المنتج">{it.product_name}</td>
                <td data-label="التصنيف">{it.category_name}</td>
                <td data-label="الكمية" className="cell-center">{it.quantity}</td>
                {isSale ? (
                  <>
                    <td data-label="السعر الأصلي">{fmt(it.original_price)}</td>
                    <td data-label="سعر البيع">{fmt(it.unit_price)}</td>
                    <td data-label="التكلفة">{fmt(it.cost_price_at_sale)}</td>
                  </>
                ) : (
                  <>
                    <td data-label="تكلفة الوحدة">{fmt(it.unit_cost)}</td>
                    <td data-label="سعر البيع">{it.retail_price !== null ? fmt(it.retail_price) : '—'}</td>
                  </>
                )}
                <td data-label="الإجمالي" className="cell-total">{fmt(it.line_total)}</td>
                <td data-label="الباركود">
                  {it.barcode ? <span className="barcode-cell">{it.barcode}</span> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isSale ? (
        <div className="inv-detail-totals">
          <div className="inv-total-row">
            <span>مجموع البنود</span>
            <span>{fmt(subtotal)}</span>
          </div>
          <div className="inv-total-row">
            <span>الخصم {inv.discount_type === 'variable' ? `(${inv.discount_percent}%)` : inv.discount_type === 'free' ? '(مجاني)' : inv.discount_type === 'fixed' ? '(قيمة)' : ''}</span>
            <span className="neg">- {fmt(inv.discount_value || 0)}</span>
          </div>
          <div className={'inv-total-row inv-total-grand'}>
            <span>الصافي</span>
            <span>{fmt(grandTotal)}</span>
          </div>
          <div className="inv-total-row">
            <span>المدفوع</span>
            <span>{fmt(inv.paid_amount || 0)}</span>
          </div>
          <div className="inv-total-row">
            <span>المتبقي</span>
            <span className={Number(inv.remaining_amount) > 0 ? 'neg' : ''}>{fmt(inv.remaining_amount || 0)}</span>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  )
}