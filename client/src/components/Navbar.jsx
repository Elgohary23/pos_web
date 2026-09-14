export default function Navbar({ user, onLogout }) {
  return (
    <header className="navbar">
      <div className="navbar-title">نظام الكاشير</div>
      <div className="navbar-actions">
        <span className="navbar-user">👤 {user.username}</span>
        <button className="btn-logout" onClick={onLogout}>
          تسجيل الخروج
        </button>
      </div>
    </header>
  )
}