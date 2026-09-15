import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { buildChildrenMap, findPath } from '../utils/tree.js'
import CategoryFormModal from '../components/CategoryFormModal.jsx'
import ProductFormModal from '../components/ProductFormModal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

export default function Categories() {
  const [categories, setCategories] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [expanded, setExpanded] = useState(new Set())
  const [catModal, setCatModal] = useState(null) // { mode: 'create', parentId } | { mode: 'edit', category }
  const [productModal, setProductModal] = useState(null) // categoryId
  const [deleting, setDeleting] = useState(null)

  const loadCategories = async () => {
    setError('')
    try {
      const data = await api.get('/api/categories')
      setCategories(data.categories)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  const selectCategory = async (category) => {
    setSelected(category)
    setDetailLoading(true)
    setDetail(null)
    try {
      const data = await api.get(`/api/categories/${category.id}`)
      setDetail(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSaveCategory = async (payload) => {
    if (catModal.mode === 'edit') {
      const res = await api.put(`/api/categories/${catModal.category.id}`, payload)
      if (selected && selected.id === catModal.category.id) setSelected(res.category)
    } else {
      await api.post('/api/categories', payload)
    }
    setCatModal(null)
    await loadCategories()
    if (selected) selectCategory(selected)
  }

  const handleSaveProduct = async (form) => {
    await api.upload('/api/products', 'POST', form)
    setProductModal(null)
    await loadCategories()
    if (selected) selectCategory(selected)
  }

  const handleDelete = async () => {
    await api.delete(`/api/categories/${deleting.id}`)
    setDeleting(null)
    setSelected(null)
    setDetail(null)
    await loadCategories()
  }

  if (categories === null) {
    return <div className="page-placeholder">جارٍ التحميل...</div>
  }

  const childrenMap = buildChildrenMap(categories)
  const roots = childrenMap['root'] || []

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>إدارة التصنيفات</h1>
        <button className="btn-primary" onClick={() => setCatModal({ mode: 'create', parentId: null })}>
          + تصنيف رئيسي
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {categories.length === 0 ? (
        <div className="page-placeholder">
          <p>لا توجد تصنيفات بعد. اضغط «تصنيف رئيسي» للبدء.</p>
        </div>
      ) : (
        <div className="cat-layout">
          <aside className="cat-tree">
            {roots.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                childrenMap={childrenMap}
                expanded={expanded}
                onToggle={toggleExpand}
                selected={selected}
                onSelect={selectCategory}
                onAddSub={(c) => setCatModal({ mode: 'create', parentId: c.id })}
                onEdit={(c) => setCatModal({ mode: 'edit', category: c })}
                onDelete={(c) => setDeleting(c)}
                onAddProduct={(c) => setProductModal({ categoryId: c.id })}
              />
            ))}
          </aside>

          <section className="cat-detail">
            {!selected ? (
              <div className="page-placeholder">
                <p>اختر تصنيفًا من الشجرة لعرض محتواه.</p>
              </div>
            ) : detailLoading ? (
              <div className="page-placeholder">جارٍ التحميل...</div>
            ) : detail ? (
              <div className="cat-detail-box">
                <div className="breadcrumb">
                  {findPath(categories, selected.id).map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && <span className="crumb-sep"> / </span>}
                      <button className="link-btn" onClick={() => selectCategory(c)}>
                        {c.name}
                      </button>
                    </span>
                  ))}
                </div>

                <div className="cat-detail-header">
                  <h2>{detail.category.name}</h2>
                  <div className="btn-group">
                    <button className="btn-secondary" onClick={() => setCatModal({ mode: 'create', parentId: detail.category.id })}>
                      + تصنيف فرعي
                    </button>
                    <button className="btn-primary" onClick={() => setProductModal({ categoryId: detail.category.id })}>
                      + منتج
                    </button>
                    <button className="btn-secondary" onClick={() => setCatModal({ mode: 'edit', category: detail.category })}>
                      تعديل
                    </button>
                    <button className="btn-danger" onClick={() => setDeleting(detail.category)}>
                      حذف
                    </button>
                  </div>
                </div>

                <h3 className="section-title">
                  التصنيفات الفرعية ({detail.children.length})
                </h3>
                {detail.children.length === 0 ? (
                  <p className="muted">لا توجد تصنيفات فرعية</p>
                ) : (
                  <div className="child-cards">
                    {detail.children.map((c) => (
                      <button key={c.id} className="child-card" onClick={() => selectCategory(c)}>
                        {c.name}
                        <span className="child-count">
                          {childrenMap[c.id]?.length ?? 0} فرعي
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <h3 className="section-title">
                  المنتجات ({detail.products.length})
                </h3>
                {detail.products.length === 0 ? (
                  <p className="muted">لا توجد منتجات في هذا التصنيف</p>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>المنتج</th>
                          <th>الباركود</th>
                          <th>سعر الجملة</th>
                          <th>سعر البيع</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.products.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <span className="cell-with-img">
                                <img src={p.imageUrl || '/placeholder.png'} alt="" className="thumb-sm" />
                                {p.name}
                              </span>
                            </td>
                            <td>{p.barcode}</td>
                            <td>{p.wholesalePrice}</td>
                            <td>{p.retailPrice}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>
      )}

      {catModal && (
        <CategoryFormModal
          categories={categories}
          category={catModal.mode === 'edit' ? catModal.category : null}
          defaultParentId={catModal.mode === 'create' ? catModal.parentId : null}
          onSave={handleSaveCategory}
          onClose={() => setCatModal(null)}
        />
      )}

      {productModal && (
        <ProductFormModal
          categories={categories}
          defaultCategoryId={productModal.categoryId}
          onCreateCategory={async (payload) => {
            const res = await api.post('/api/categories', payload)
            setCategories((prev) => [...prev, res.category])
            return res.category
          }}
          onSave={handleSaveProduct}
          onClose={() => setProductModal(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="حذف التصنيف"
          message={`هل أنت متأكد من حذف تصنيف «${deleting.name}»؟ لا يمكن حذف تصنيف يحتوي على تصنيفات فرعية أو منتجات.`}
          confirmLabel="حذف"
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

function TreeNode({
  node,
  depth,
  childrenMap,
  expanded,
  onToggle,
  selected,
  onSelect,
  onAddSub,
  onEdit,
  onDelete,
  onAddProduct,
}) {
  const children = childrenMap[node.id] || []
  const isOpen = expanded.has(node.id)
  return (
    <div className="tree-node">
      <div className="tree-row">
        <button
          type="button"
          className="tree-toggle"
          onClick={() => children.length > 0 && onToggle(node.id)}
        >
          {children.length === 0 ? <span className="tree-leaf-dot">•</span> : isOpen ? '⌄' : '‹'}
        </button>
        <button
          type="button"
          className={`tree-name ${selected?.id === node.id ? 'tree-name-selected' : ''}`}
          onClick={() => onSelect(node)}
        >
          {node.name}
        </button>
        <div className="tree-actions">
          <button type="button" className="mini-btn" title="إضافة تصنيف فرعي" onClick={() => onAddSub(node)}>
            +
          </button>
          <button type="button" className="mini-btn" title="إضافة منتج" onClick={() => onAddProduct(node)}>
            📦
          </button>
          <button type="button" className="mini-btn" title="تعديل" onClick={() => onEdit(node)}>
            ✎
          </button>
          <button type="button" className="mini-btn mini-danger" title="حذف" onClick={() => onDelete(node)}>
            🗑
          </button>
        </div>
      </div>
      {isOpen &&
        children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            childrenMap={childrenMap}
            expanded={expanded}
            onToggle={onToggle}
            selected={selected}
            onSelect={onSelect}
            onAddSub={onAddSub}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddProduct={onAddProduct}
          />
        ))}
    </div>
  )
}