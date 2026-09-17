import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AdminRoute from './components/AdminRoute.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Employees from './pages/Employees.jsx'
import Categories from './pages/Categories.jsx'
import Products from './pages/Products.jsx'
import SupplyInvoicePage from './pages/SupplyInvoicePage.jsx'
import SalesInvoicePage from './pages/SalesInvoicePage.jsx'
import TransactionLog from './pages/TransactionLog.jsx'
import InvoiceDetail from './pages/InvoiceDetail.jsx'
import BarcodePrintPage from './pages/BarcodePrintPage.jsx'
import BackupPage from './pages/BackupPage.jsx'

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
          <Route path="sales-invoice" element={<SalesInvoicePage />} />
          <Route element={<AdminRoute />}>
            <Route path="employees" element={<Employees />} />
            <Route path="categories" element={<Categories />} />
            <Route path="products" element={<Products />} />
            <Route path="transactions" element={<TransactionLog />} />
            <Route path="transactions/:id" element={<InvoiceDetail />} />
            <Route path="barcodes" element={<BarcodePrintPage />} />
            <Route path="backup" element={<BackupPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}