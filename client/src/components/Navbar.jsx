export default function Navbar({ user, onLogout, onChangePassword }) {
  return (
    <header className="navbar">
      <div className="navbar-title">نظام الكاشير</div>
      <div className="navbar-actions">
        <span className="navbar-user">
          {user.name || user.username}
          <span className="role-badge">{user.role === 'admin' ? 'مدير' : 'موظف'}</span>
        </span>
        <button className="btn-change-password" onClick={onChangePassword}>
          تغيير كلمة السر
        </button>
        <button className="btn-logout" onClick={onLogout}>
          تسجيل الخروج
        </button>
      </div>
    </header>
  )
}