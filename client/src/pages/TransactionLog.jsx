import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { formatShiftAr } from '../utils/time.js'

const fmt = (n) => Number(n).toFixed(2)

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const KIND_META = {
  supply: { cls: 'tx-kind-supply', label: 'فاتورة توريد' },
  return: { cls: 'tx-kind-return', label: 'فاتورة مترجع' },
  sale: { cls: 'tx-kind-sale', label: 'فاتورة بيع' },
}

function KindBadge({ kind }) {
  const meta = KIND_META[kind] || { cls: '', label: kind }
  return <span className={'tx-kind ' + meta.cls}>{meta.label}</span>
}

function InvoiceRow({ inv }) {
  const total = inv.total ?? 0
  const isReturn = inv.kind === 'return'
  return (
    <Link to={`/transactions/${inv.id}?date=${inv.created_at ? String(inv.created_at).slice(0, 10) : ''}`} className="tx-inv">
      <span className="tx-inv-main">
        <KindBadge kind={inv.kind} />
        <span className="tx-inv-id"># {inv.id}</span>
        {!inv.in_shift && <span className="tx-badge-out">خارج ساعات العمل</span>}
      </span>
      <span className="tx-inv-meta">
        <span className="tx-inv-user">
          {inv.user_name}
          <span className="tx-inv-username"> ({inv.username})</span>
          {inv.customer_name ? <span className="tx-inv-customer"> ← {inv.customer_name}</span> : ''}
        </span>
        <span className="tx-inv-time">{inv.time}</span>
      </span>
      <span className={'tx-inv-total' + (isReturn ? ' neg' : '')}>{fmt(total)}</span>
    </Link>
  )
}

function GroupBlock({ title, subtitle, total, children, danger, muted, aggregate }) {
  return (
    <section className={'tx-group' + (danger ? ' tx-group-danger' : '') + (muted ? ' tx-group-muted' : '')}>
      <div className="tx-group-head">
        <div className="tx-group-title-wrap">
          <h3 className="tx-group-title">{title}</h3>
          {subtitle && <div className="tx-group-sub">{subtitle}</div>}
        </div>
        <div className="tx-group-totals">
          {aggregate !== undefined && (
            <div className={'shift-aggregate' + (aggregate < 0 ? ' neg' : '')}>
              تجميع: {aggregate < 0 ? '' : '+'}{fmt(aggregate)}
            </div>
          )}
          <div className="tx-group-total">{fmt(total)}</div>
        </div>
      </div>
      {children}
    </section>
  )
}

export default function TransactionLog() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [date, setDate] = useState(() => searchParams.get('date') || today())
  const [view, setView] = useState('shift')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const handleDateChange = (value) => {
    setDate(value)
    setSearchParams(value ? { date: value } : {}, { replace: true })
  }

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError('')
    api
      .get(`/api/transactions?date=${encodeURIComponent(date)}`)
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
  }, [date])

  const summary = data?.summary
  const shiftView = data?.shift_view
  const accounts = data?.account_view

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>سجل المعاملات</h1>
        <Link to="/" className="btn-secondary">
          ⇦ رجوع للرئيسية
        </Link>
      </div>

      <div className="tx-toolbar">
        <div className="tx-controls">
          <label className="tx-date-field">
            <span className="field-label">اليوم</span>
            <input
              type="date"
              className="tx-date-input"
              value={date}
              min="2020-01-01"
              max={today()}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </label>

          <div className="tx-view-toggle" role="group" aria-label="طريقة العرض">
            <button
              type="button"
              className={'tx-view-btn' + (view === 'shift' ? ' active' : '')}
              onClick={() => setView('shift')}
            >
              حسب الشيفت
            </button>
            <button
              type="button"
              className={'tx-view-btn' + (view === 'account' ? ' active' : '')}
              onClick={() => setView('account')}
            >
              حسب الأكونت
            </button>
          </div>
        </div>

        {summary && (
          <div className="tx-summary">
            <div className="tx-stat">
              <span className="tx-stat-label">فواتير</span>
              <span className="tx-stat-value">{summary.count}</span>
            </div>
            <div className="tx-stat">
              <span className="tx-stat-label">بيع</span>
              <span className="tx-stat-value pos">{summary.sale_count} / {fmt(summary.sale_total)}</span>
            </div>
            <div className="tx-stat">
              <span className="tx-stat-label">توريد</span>
              <span className="tx-stat-value">{summary.supply_count} / {fmt(summary.supply_total)}</span>
            </div>
            <div className="tx-stat">
              <span className="tx-stat-label">مرتجع</span>
              <span className="tx-stat-value neg">{summary.return_count} / {fmt(summary.return_total)}</span>
            </div>
            <div className="tx-stat tx-stat-net">
              <span className="tx-stat-label">الصافي</span>
              <span className={'tx-stat-value' + (summary.net < 0 ? ' neg' : '')}>{fmt(summary.net)}</span>
            </div>
          </div>
        )}
      </div>

      {data && summary && summary.count > 0 && (
        <div className="tx-summary-agg">
          <span className="field-label">تجميع أموال اليوم:</span>
          <span className={'tx-agg-total' + (data.shift_aggregate < 0 ? ' neg' : '')}>
            {data.shift_aggregate < 0 ? '' : '+'}{fmt(data.shift_aggregate)}
          </span>
          <span className="tx-agg-hint">(بيع + / توريد ومرتجع -)</span>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div className="page-placeholder">جارٍ التحميل...</div>
      ) : !data || summary.count === 0 ? (
        <div className="page-placeholder">
          <p>لا توجد معاملات في هذا اليوم.</p>
        </div>
      ) : view === 'shift' ? (
        <div className="tx-blocks">
          {shiftView.groups.map((g) => (
            <GroupBlock
              key={g.key}
              title={`شيفت ${formatShiftAr(g.shift_start)} ← ${formatShiftAr(g.shift_end)}`}
              subtitle={g.users.join(' • ')}
              total={g.subtotal}
              aggregate={g.aggregate}
            >
              {g.invoices.map((inv) => (
                <InvoiceRow key={inv.id} inv={inv} />
              ))}
            </GroupBlock>
          ))}

          {shiftView.no_shift.invoices.length > 0 && (
            <GroupBlock
              title="بدون شيفت مسجل"
              subtitle="مستخدمون لا يوجد لهم شيفت مسجل على النظام"
              total={shiftView.no_shift.subtotal}
              muted
              aggregate={shiftView.no_shift.aggregate}
            >
              {shiftView.no_shift.invoices.map((inv) => (
                <InvoiceRow key={inv.id} inv={inv} />
              ))}
            </GroupBlock>
          )}

          <GroupBlock
            title="خارج ساعات العمل"
            subtitle="معاملات تمت خارج الشيفت المسجل لمستخدمها"
            total={shiftView.out_of_hours.subtotal}
            danger
            aggregate={shiftView.out_of_hours.aggregate}
          >
            {shiftView.out_of_hours.invoices.length === 0 ? (
              <div className="tx-none">لا توجد معاملات خارج ساعات العمل في هذا اليوم</div>
            ) : (
              shiftView.out_of_hours.invoices.map((inv) => (
                <InvoiceRow key={inv.id} inv={inv} />
              ))
            )}
          </GroupBlock>
        </div>
      ) : (
        <div className="tx-blocks">
          {accounts.map((acc) => (
            <GroupBlock
              key={acc.user_id}
              title={`${acc.user_name}`}
              subtitle={`${acc.username} • ${acc.count} ${acc.count === 1 ? 'فاتورة' : 'فواتير'}`}
              total={acc.subtotal}
            >
              {acc.invoices.map((inv) => (
                <InvoiceRow key={inv.id} inv={inv} />
              ))}
            </GroupBlock>
          ))}
        </div>
      )}
    </div>
  )
}