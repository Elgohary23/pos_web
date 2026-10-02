import { useEffect, useMemo, useState } from 'react'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'master_detail'
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
    if (!category) {
      setSelected(null)
      setDetail(null)
      return
    }
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
    if (selected?.id === deleting.id) {
      setSelected(null)
      setDetail(null)
    }
    await loadCategories()
  }

  // Pre-calculations & maps
  const childrenMap = useMemo(() => (categories ? buildChildrenMap(categories) : {}), [categories])
  const roots = childrenMap['root'] || []

  // Stats
  const stats = useMemo(() => {
    if (!categories) return { rootCount: 0, subCount: 0, total: 0 }
    const rootCount = roots.length
    const subCount = categories.filter((c) => c.parent_id !== null).length
    return { rootCount, subCount, total: categories.length }
  }, [categories, roots])

  // Filtered categories
  const filteredCategories = useMemo(() => {
    if (!categories) return []
    const q = searchQuery.trim().toLowerCase()
    if (!q) return categories
    return categories.filter((c) => c.name.toLowerCase().includes(q))
  }, [categories, searchQuery])

  if (categories === null) {
    return (
      <div className="full-page-loader">
        <div className="loader-spinner"></div>
        <span>جارٍ تحميل التصنيفات...</span>
      </div>
    )
  }

  return (
    <div className="page page-wide categories-dashboard">
      {/* Top Header & Metrics Bar */}
      <div className="cat-page-header">
        <div className="cat-header-main">
          <div>
            <h1>إدارة التصنيفات والمنتجات</h1>
            <p className="page-desc">تنظيم هيكل المنتجات وتصنيفاتها الرئيسية والفرعية بسهولة</p>
          </div>
          <div className="cat-header-actions">
            <button
              type="button"
              className="btn-primary cat-add-root-btn"
              onClick={() => setCatModal({ mode: 'create', parentId: null })}
            >
              <span className="btn-icon">＋</span> تصنيف رئيسي جديد
            </button>
          </div>
        </div>

        {/* Quick KPI Stats Cards */}
        <div className="cat-stats-row">
          <div className="cat-stat-card">
            <div className="cat-stat-icon root-icon">🗂️</div>
            <div className="cat-stat-content">
              <span className="cat-stat-label">التصنيفات الرئيسية</span>
              <strong className="cat-stat-value">{stats.rootCount}</strong>
            </div>
          </div>
          <div className="cat-stat-card">
            <div className="cat-stat-icon sub-icon">📂</div>
            <div className="cat-stat-content">
              <span className="cat-stat-label">التصنيفات الفرعية</span>
              <strong className="cat-stat-value">{stats.subCount}</strong>
            </div>
          </div>
          <div className="cat-stat-card">
            <div className="cat-stat-icon total-icon">🏷️</div>
            <div className="cat-stat-content">
              <span className="cat-stat-label">إجمالي التصنيفات</span>
              <strong className="cat-stat-value">{stats.total}</strong>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Toolbar: Search & View Switcher */}
      <div className="cat-controls-bar">
        <div className="cat-search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="بحث في التصنيفات..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" className="search-clear-btn" onClick={() => setSearchQuery('')}>
              ✕
            </button>
          )}
        </div>

        <div className="cat-view-toggles" role="tablist">
          <button
            type="button"
            className={'cat-view-toggle-btn' + (viewMode === 'grid' ? ' active' : '')}
            onClick={() => setViewMode('grid')}
            title="عرض البطاقات"
          >
            🔲 عرض البطاقات
          </button>
          <button
            type="button"
            className={'cat-view-toggle-btn' + (viewMode === 'master_detail' ? ' active' : '')}
            onClick={() => setViewMode('master_detail')}
            title="عرض القائمة والتفاصيل"
          >
            📑 عرض التقسيم
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="cat-empty-state">
          <div className="empty-icon">🗂️</div>
          <h3>لا توجد تصنيفات بعد</h3>
          <p>ابدأ بإضافة أول تصنيف رئيسي لتنظيم منتجاتك في النظام.</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setCatModal({ mode: 'create', parentId: null })}
          >
            ＋ إضافة تصنيف رئيسي
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* ==================== VIEW 1: INTERACTIVE CARD GRID ==================== */
        <div className="cat-grid-view">
          {selected && (
            <div className="cat-breadcrumbs-card">
              <div className="breadcrumb">
                <button className="link-btn breadcrumb-root" onClick={() => selectCategory(null)}>
                  🏠 جميع التصنيفات
                </button>
                {findPath(categories, selected.id).map((c) => (
                  <span key={c.id}>
                    <span className="crumb-sep"> / </span>
                    <button
                      className={'link-btn' + (c.id === selected.id ? ' active-crumb' : '')}
                      onClick={() => selectCategory(c)}
                    >
                      {c.name}
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="btn-secondary btn-compact"
                onClick={() => selectCategory(null)}
              >
                ← العودة للتصنيفات الرئيسية
              </button>
            </div>
          )}

          {/* Drill-down Category Detail in Grid Mode */}
          {selected ? (
            detailLoading ? (
              <div className="cat-loading-box">
                <div className="loader-spinner"></div>
                <span>جارٍ تحميل محتويات «{selected.name}»...</span>
              </div>
            ) : detail ? (
              <div className="cat-detail-wrapper">
                {/* Hero Header for Selected Category */}
                <div className="cat-detail-hero">
                  <div className="cat-hero-info">
                    <span className="cat-hero-badge">تصنيف نشط</span>
                    <h2>{detail.category.name}</h2>
                    <div className="cat-hero-meta">
                      <span className="meta-pill">📂 {detail.children.length} تصنيف فرعي</span>
                      <span className="meta-pill">📦 {detail.products.length} منتج مسجل</span>
                    </div>
                  </div>
                  <div className="cat-hero-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setProductModal({ categoryId: detail.category.id })}
                    >
                      ＋ إضافة منتج
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        setCatModal({ mode: 'create', parentId: detail.category.id })
                      }
                    >
                      ＋ تصنيف فرعي
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        setCatModal({ mode: 'edit', category: detail.category })
                      }
                    >
                      ✎ تعديل
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => setDeleting(detail.category)}
                    >
                      🗑 حذف
                    </button>
                  </div>
                </div>

                {/* Subcategories Subsection */}
                <div className="cat-section-card">
                  <div className="cat-section-header">
                    <h3>📂 التصنيفات الفرعية ({detail.children.length})</h3>
                    <button
                      type="button"
                      className="btn-compact btn-secondary"
                      onClick={() =>
                        setCatModal({ mode: 'create', parentId: detail.category.id })
                      }
                    >
                      ＋ تصنيف فرعي
                    </button>
                  </div>

                  {detail.children.length === 0 ? (
                    <div className="cat-section-empty">لا توجد تصنيفات فرعية في هذا التصنيف.</div>
                  ) : (
                    <div className="cat-card-grid">
                      {detail.children.map((child) => (
                        <div key={child.id} className="cat-card subcat-card">
                          <div className="cat-card-top" onClick={() => selectCategory(child)}>
                            <div className="cat-card-avatar sub-avatar">📂</div>
                            <div className="cat-card-titles">
                              <h4>{child.name}</h4>
                              <span className="cat-card-subcount">
                                {childrenMap[child.id]?.length ?? 0} فرعي إضافي
                              </span>
                            </div>
                          </div>
                          <div className="cat-card-footer">
                            <button
                              type="button"
                              className="btn-card-action"
                              onClick={() => selectCategory(child)}
                            >
                              عرض المحتوى ←
                            </button>
                            <div className="cat-card-mini-actions">
                              <button
                                type="button"
                                className="mini-icon-btn"
                                title="تعديل"
                                onClick={() => setCatModal({ mode: 'edit', category: child })}
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                className="mini-icon-btn mini-icon-danger"
                                title="حذف"
                                onClick={() => setDeleting(child)}
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Products Subsection */}
                <div className="cat-section-card">
                  <div className="cat-section-header">
                    <h3>📦 المنتجات المصنفة ({detail.products.length})</h3>
                    <button
                      type="button"
                      className="btn-compact btn-primary"
                      onClick={() => setProductModal({ categoryId: detail.category.id })}
                    >
                      ＋ إضافة منتج
                    </button>
                  </div>

                  {detail.products.length === 0 ? (
                    <div className="cat-section-empty">لا توجد منتجات مسجلة في هذا التصنيف بعد.</div>
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table data-table-cards">
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
                              <td data-label="المنتج">
                                <span className="cell-with-img">
                                  <img
                                    src={p.imageUrl || '/placeholder.png'}
                                    alt=""
                                    className="thumb-sm"
                                  />
                                  <strong className="product-title">{p.name}</strong>
                                </span>
                              </td>
                              <td data-label="الباركود">
                                <span className="barcode-badge">{p.barcode || '—'}</span>
                              </td>
                              <td data-label="سعر الجملة" className="price-cell">
                                {Number(p.wholesalePrice).toFixed(2)} ج.م
                              </td>
                              <td data-label="سعر البيع" className="price-cell price-highlight">
                                {Number(p.retailPrice).toFixed(2)} ج.م
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : null
          ) : (
            /* Root Categories Grid View */
            <div className="cat-card-grid">
              {(searchQuery ? filteredCategories : roots).map((c) => {
                const subCount = childrenMap[c.id]?.length || 0
                return (
                  <div key={c.id} className="cat-card">
                    <div className="cat-card-top" onClick={() => selectCategory(c)}>
                      <div className="cat-card-avatar">🗂️</div>
                      <div className="cat-card-titles">
                        <h3>{c.name}</h3>
                        <div className="cat-card-badges">
                          <span className="cat-badge-sub">{subCount} فرعي</span>
                          {c.parent_id && <span className="cat-badge-sub">تصنيف فرعي</span>}
                        </div>
                      </div>
                    </div>
                    <div className="cat-card-footer">
                      <button
                        type="button"
                        className="btn-card-action"
                        onClick={() => selectCategory(c)}
                      >
                        عرض التصنيف والمنتجات ←
                      </button>
                      <div className="cat-card-mini-actions">
                        <button
                          type="button"
                          className="mini-icon-btn"
                          title="إضافة فرعي"
                          onClick={() => setCatModal({ mode: 'create', parentId: c.id })}
                        >
                          ＋
                        </button>
                        <button
                          type="button"
                          className="mini-icon-btn"
                          title="تعديل"
                          onClick={() => setCatModal({ mode: 'edit', category: c })}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="mini-icon-btn mini-icon-danger"
                          title="حذف"
                          onClick={() => setDeleting(c)}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* ==================== VIEW 2: MASTER-DETAIL SPLIT VIEW ==================== */
        <div className="cat-layout cat-layout-modern">
          <aside className="cat-sidebar-card">
            <div className="cat-sidebar-header">
              <span className="cat-sidebar-title">الهيكل الشجري</span>
              <button
                type="button"
                className="mini-btn-pill"
                onClick={() => setCatModal({ mode: 'create', parentId: null })}
              >
                ＋ رئيسي
              </button>
            </div>
            <div className="cat-tree-list">
              {roots.map((node) => (
                <ModernTreeNode
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
            </div>
          </aside>

          <section className="cat-detail">
            {!selected ? (
              <div className="cat-selection-placeholder">
                <div className="placeholder-icon">👈</div>
                <h3>اختر تصنيفاً من القائمة الجانبية</h3>
                <p>اضغط على أي تصنيف لعرض تفاصيله، تصنيفاته الفرعية، وجدول منتجاته.</p>
              </div>
            ) : detailLoading ? (
              <div className="cat-loading-box">
                <div className="loader-spinner"></div>
                <span>جارٍ التحميل...</span>
              </div>
            ) : detail ? (
              <div className="cat-detail-box">
                <div className="breadcrumb">
                  {findPath(categories, selected.id).map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && <span className="crumb-sep"> / </span>}
                      <button
                        className={'link-btn' + (c.id === selected.id ? ' active-crumb' : '')}
                        onClick={() => selectCategory(c)}
                      >
                        {c.name}
                      </button>
                    </span>
                  ))}
                </div>

                <div className="cat-detail-header">
                  <div>
                    <h2>{detail.category.name}</h2>
                    <span className="muted">
                      {detail.children.length} تصنيف فرعي • {detail.products.length} منتج
                    </span>
                  </div>
                  <div className="btn-group">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setProductModal({ categoryId: detail.category.id })}
                    >
                      ＋ منتج
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        setCatModal({ mode: 'create', parentId: detail.category.id })
                      }
                    >
                      ＋ تصنيف فرعي
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        setCatModal({ mode: 'edit', category: detail.category })
                      }
                    >
                      ✎ تعديل
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => setDeleting(detail.category)}
                    >
                      🗑 حذف
                    </button>
                  </div>
                </div>

                <h3 className="section-title">
                  التصنيفات الفرعية ({detail.children.length})
                </h3>
                {detail.children.length === 0 ? (
                  <p className="muted empty-hint">لا توجد تصنيفات فرعية في هذا التصنيف</p>
                ) : (
                  <div className="child-cards">
                    {detail.children.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="child-card"
                        onClick={() => selectCategory(c)}
                      >
                        <span className="child-name">📂 {c.name}</span>
                        <span className="child-count">
                          {childrenMap[c.id]?.length ?? 0} فرعي
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <h3 className="section-title">المنتجات ({detail.products.length})</h3>
                {detail.products.length === 0 ? (
                  <p className="muted empty-hint">لا توجد منتجات مسجلة في هذا التصنيف بعد</p>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table data-table-cards">
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
                            <td data-label="المنتج">
                              <span className="cell-with-img">
                                <img
                                  src={p.imageUrl || '/placeholder.png'}
                                  alt=""
                                  className="thumb-sm"
                                />
                                <strong className="product-title">{p.name}</strong>
                              </span>
                            </td>
                            <td data-label="الباركود">
                              <span className="barcode-badge">{p.barcode || '—'}</span>
                            </td>
                            <td data-label="سعر الجملة" className="price-cell">
                              {Number(p.wholesalePrice).toFixed(2)} ج.م
                            </td>
                            <td data-label="سعر البيع" className="price-cell price-highlight">
                              {Number(p.retailPrice).toFixed(2)} ج.م
                            </td>
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

      {/* Modals */}
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

function ModernTreeNode({
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
  const isSelected = selected?.id === node.id

  return (
    <div className="tree-node" style={{ '--depth': depth }}>
      <div className={`tree-row ${isSelected ? 'tree-row-selected' : ''}`}>
        <button
          type="button"
          className="tree-toggle"
          onClick={() => children.length > 0 && onToggle(node.id)}
          aria-label={isOpen ? 'طي' : 'توسيع'}
        >
          {children.length === 0 ? (
            <span className="tree-leaf-dot">•</span>
          ) : isOpen ? (
            <span className="tree-chevron">▾</span>
          ) : (
            <span className="tree-chevron">◂</span>
          )}
        </button>
        <button
          type="button"
          className={`tree-name ${isSelected ? 'tree-name-selected' : ''}`}
          onClick={() => onSelect(node)}
        >
          <span className="tree-icon">{children.length > 0 ? '📂' : '📁'}</span>
          <span className="tree-title">{node.name}</span>
          {children.length > 0 && <span className="tree-badge">{children.length}</span>}
        </button>
        <div className="tree-actions">
          <button
            type="button"
            className="mini-btn"
            title="إضافة تصنيف فرعي"
            onClick={() => onAddSub(node)}
          >
            ＋
          </button>
          <button
            type="button"
            className="mini-btn"
            title="إضافة منتج"
            onClick={() => onAddProduct(node)}
          >
            📦
          </button>
          <button
            type="button"
            className="mini-btn"
            title="تعديل"
            onClick={() => onEdit(node)}
          >
            ✎
          </button>
          <button
            type="button"
            className="mini-btn mini-danger"
            title="حذف"
            onClick={() => onDelete(node)}
          >
            🗑
          </button>
        </div>
      </div>
      {isOpen &&
        children.map((child) => (
          <ModernTreeNode
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