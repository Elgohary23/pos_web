import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Navbar from '../components/Navbar.jsx'
import Sidebar from '../components/Sidebar.jsx'
import ChangePasswordDialog from '../components/ChangePasswordDialog.jsx'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [showChangePw, setShowChangePw] = useState(false)

  useEffect(() => {
    if (user?.isDefaultPassword && !localStorage.getItem('skipPwChangeDialog')) {
      setShowChangePw(true)
    }
  }, [user])

  return (
    <div className="dashboard">
      <Navbar user={user} onLogout={logout} />
      <div className="dashboard-body">
        <Sidebar />
        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
      {showChangePw && (
        <ChangePasswordDialog onClose={() => setShowChangePw(false)} />
      )}
    </div>
  )
}