import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AdminRoute from './components/AdminRoute.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Employees from './pages/Employees.jsx'
import Categories from './pages/Categories.jsx'
import Products from './pages/Products.jsx'
import SupplyInvoicePage from './pages/SupplyInvoicePage.jsx'

function Home() {
  return (
    <div className="page-placeholder">
      <h1>أهلًا بك</h1>
      <p>اختر صفحة من القائمة الجانبية للبدء.</p>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />}>
          <Route index element={<Home />} />
          <Route path="supply-invoice" element={<SupplyInvoicePage />} />
          <Route element={<AdminRoute />}>
            <Route path="employees" element={<Employees />} />
            <Route path="categories" element={<Categories />} />
            <Route path="products" element={<Products />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}