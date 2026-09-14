import express from 'express'
import session from 'express-session'
import connectSqlite3 from 'connect-sqlite3'
import bcrypt from 'bcryptjs'
import db from './db.js'

const app = express()
const port = process.env.PORT || 3000
const sessionSecret = process.env.SESSION_SECRET || 'kasabi-dev-secret-change-in-production'

const SqliteStore = connectSqlite3(session)

app.use(express.json())

app.use(
  session({
    store: new SqliteStore({ db: 'sessions.sqlite', dir: '.' }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
)

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    isDefaultPassword: bcrypt.compareSync('admin', user.password_hash),
  }
}

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'غير مسجل الدخول' })
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId)
  if (!user) {
    return res.status(401).json({ message: 'غير مسجل الدخول' })
  }
  res.json({ user: publicUser(user) })
})

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ message: 'اسم المستخدم وكلمة السر مطلوبان' })
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username))
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ message: 'اسم المستخدم أو كلمة السر غير صحيحة' })
  }
  req.session.userId = user.id
  req.session.username = user.username
  res.json({ user: publicUser(user) })
})

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid')
    res.json({ message: 'تم تسجيل الخروج' })
  })
})

app.post('/api/auth/change-password', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'غير مسجل الدخول' })
  }
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'كلمة السر الحالية والجديدة مطلوبتان' })
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ message: 'كلمة السر الجديدة يجب أن تكون 6 أحرف على الأقل' })
  }
  if (String(newPassword) === String(currentPassword)) {
    return res.status(400).json({ message: 'كلمة السر الجديدة يجب أن تختلف عن الحالية' })
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId)
  if (!user || !bcrypt.compareSync(String(currentPassword), user.password_hash)) {
    return res.status(400).json({ message: 'كلمة السر الحالية غير صحيحة' })
  }
  const hash = bcrypt.hashSync(String(newPassword), 10)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id)
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
  res.json({ user: publicUser(updated) })
})

app.get('/', (req, res) => {
  res.send('نظام الكاشير - الخادم يعمل')
})

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})