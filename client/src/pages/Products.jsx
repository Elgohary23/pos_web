import { useEffect, useState, useRef } from 'react'
import { api } from '../api.js'
import { flattenForSelect } from '../utils/tree.js'
import ProductFormModal from '../components/ProductFormModal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

export default function Products() {
  const [products, setProducts] = useState(null)
  const [categories, setCategories] = useState([])
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const debounceRef = useRef(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const loadCategories = async () => {
    try {
      const data = await api.get('/api/categories')
      setCategories(data.categories)
    } catch { /* ignore */ }
  }

  const loadProducts = async (q, catId) => {
    setError('')
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (catId) params.set('categoryId', catId)
      const qs = params.toString()
      const data = await api.get(`/api/products${qs ? '?' + qs : ''}`)
      setProducts(data.products)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    loadCategories()
    loadProducts()
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      loadProducts(search, categoryFilter)
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [search, categoryFilter])

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (product) => {
    setEditing(product)
    setModalOpen(true)
  }

  const handleSave = async (form) => {
    if (editing) {
      await api.upload(`/api/products/${editing.id}`, 'PUT', form)
    } else {
      await api.upload('/api/products', 'POST', form)
    }
    setModalOpen(false)
    loadProducts(search, categoryFilter)
  }

  const handleDelete = async () => {
    await api.delete(`/api/products/${deleting.id}`)
    setDeleting(null)
    loadProducts(search, categoryFilter)
  }

  const handleCreateCategory = async (payload) => {
    const res = await api.post('/api/categories', payload)
    setCategories((prev) => [...prev, res.category])
    return res.category
  }

  const selectOptions = flattenForSelect(categories)

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>إدارة المنتجات</h1>
        <button className="btn-primary" onClick={openCreate}>
          + إضافة منتج
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="filter-row">
        <input
          type="text"
          className="search-input"
          placeholder="بحث بالاسم أو الباركود..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">كل التصنيفات</option>
          {selectOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {'\u2003'.repeat(c.depth) + c.name}
            </option>
          ))}
        </select>
      </div>

      {products === null ? (
        <div className="page-placeholder">جارٍ التحميل...</div>
      ) : products.length === 0 ? (
        <div className="page-placeholder">
          <p>{search || categoryFilter ? 'لا توجد نتائج مطابقة للبحث.' : 'لا توجد منتجات بعد. اضغط «إضافة منتج» للبدء.'}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table data-table-cards">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>الباركود</th>
                <th>التصنيف</th>
                <th>الكمية</th>
                <th>سعر الجملة</th>
                <th>سعر البيع</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td data-label="المنتج">
                    <span className="cell-with-img">
                      <img src={p.imageUrl || '/placeholder.png'} alt="" className="thumb-sm" />
                      {p.name}
                    </span>
                  </td>
                  <td data-label="الباركود" className="barcode-cell">{p.barcode}</td>
                  <td data-label="التصنيف">{p.categoryName || '—'}</td>
                  <td data-label="الكمية">{p.quantity}</td>
                  <td data-label="سعر الجملة">{p.wholesalePrice}</td>
                  <td data-label="سعر البيع">{p.retailPrice}</td>
                  <td data-label="إجراءات" className="row-actions">
                    <button className="btn-secondary" onClick={() => openEdit(p)}>
                      تعديل
                    </button>
                    <button className="btn-danger" onClick={() => setDeleting(p)}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <ProductFormModal
          product={editing}
          categories={categories}
          defaultCategoryId={categoryFilter || undefined}
          onCreateCategory={handleCreateCategory}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="حذف المنتج"
          message={`هل أنت متأكد من حذف منتج «${deleting.name}»؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف"
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
