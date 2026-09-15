import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Navbar from '../components/Navbar.jsx'
import Sidebar from '../components/Sidebar.jsx'
import ChangePasswordDialog from '../components/ChangePasswordDialog.jsx'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [showChangePw, setShowChangePw] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (user?.isDefaultPassword && !localStorage.getItem('skipPwChangeDialog')) {
      setShowChangePw(true)
    }
  }, [user])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'F3') {
        e.preventDefault()
        navigate('/supply-invoice')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  return (
    <div className="dashboard">
      <Navbar user={user} onLogout={logout} onChangePassword={() => setShowChangePw(true)} />
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