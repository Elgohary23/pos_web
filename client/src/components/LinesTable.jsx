export default function LinesTable({ lines, selected, onToggle, onDeleteSelected }) {
  const lineTotal = (l) => (l.unit_cost * l.quantity).toFixed(2)

  return (
    <div className="lines-block">
      <div className="lines-toolbar">
        <span className="muted">
          البنود ({lines.length})
        </span>
        <button
          type="button"
          className="btn-danger btn-compact"
          disabled={selected.size === 0}
          onClick={onDeleteSelected}
        >
          🗑 حذف المحدد
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table lines-table">
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              <th style={{ width: 250 }}>المنتج</th>
              <th style={{ width: 60 }}>الكمية</th>
              <th style={{ width: 100 }}>تكلفة الوحدة</th>
              <th style={{ width: 110 }}>الإجمالي</th>
              <th style={{ width: 120 }}>التصنيف</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  أضف بنودًا من الأعلى
                </td>
              </tr>
            ) : (
              lines.map((l, i) => (
                <tr key={i} className={selected.has(i) ? 'selected' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => onToggle(i)}
                      aria-label={`تحديد بند ${l.name}`}
                    />
                  </td>
                  <td>{l.name}</td>
                  <td className="cell-center">{l.quantity}</td>
                  <td>{Number(l.unit_cost).toFixed(2)}</td>
                  <td className="cell-total">{lineTotal(l)}</td>
                  <td>{l.category_name || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}