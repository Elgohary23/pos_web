import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Only same-origin paths are honoured, so a crafted ?next= cannot bounce the
// cashier to an external site after logging in.
function safeNext(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username.trim(), password)
      navigate(safeNext(params.get('next')), { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">💰</div>
        <h1>نظام الكاشير</h1>
        <p className="login-subtitle">سجّل الدخول للمتابعة</p>
        <form onSubmit={handleSubmit}>
          <label>
            اسم المستخدم
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label>
            كلمة السر
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'جارٍ الدخول...' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  )
}