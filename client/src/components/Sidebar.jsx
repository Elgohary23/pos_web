import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Sidebar() {
  const { user } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar-header">القائمة</div>
      <nav className="sidebar-nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          الرئيسية
        </NavLink>
        <NavLink to="/supply-invoice" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          فاتورة توريد / مرتجع <span className="nav-shortcut">(F3)</span>
        </NavLink>
        <NavLink to="/sales-invoice" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          فاتورة بيع <span className="nav-shortcut">(F4)</span>
        </NavLink>
        {user?.role === 'admin' && (
          <>
            <NavLink to="/categories" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              التصنيفات
            </NavLink>
            <NavLink to="/products" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              المنتجات
            </NavLink>
            <NavLink to="/barcodes" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              طباعة الباركود
            </NavLink>
            <NavLink to="/transactions" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              سجل المعاملات
            </NavLink>
            <NavLink to="/employees" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              إدارة الموظفين
            </NavLink>
            <NavLink to="/backup" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              النسخ الاحتياطي
            </NavLink>
          </>
        )}
      </nav>
    </aside>
  )
}