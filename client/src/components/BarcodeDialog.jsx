export default function BarcodeDialog({ products, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box barcode-dialog">
        <button type="button" className="modal-close" onClick={onClose} aria-label="إغلاق">
          ✕
        </button>
        <h2>باركودات المنتجات الجديدة</h2>
        <div className="barcode-list">
          {products.map((p) => (
            <div key={p.barcode} className="barcode-item">
              <img src={p.barcode_url} alt={`باركود ${p.name}`} width={300} height={140} />
              <div className="barcode-label">
                {p.name} | {p.barcode}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}