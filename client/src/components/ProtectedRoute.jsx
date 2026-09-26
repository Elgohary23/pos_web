import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

/**
 * A phone opening a printed deep link (http://<lan>:3000/l/CODE) has no session
 * yet, so the requested location is carried through the login form and restored
 * afterwards - otherwise every scan would drop the cashier on the home page.
 */
export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="full-page-loader">جارٍ التحميل...</div>
  }

  if (!user) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  return <Outlet />
}
