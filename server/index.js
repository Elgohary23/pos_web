import express from 'express'
import session from 'express-session'
import connectSqlite3 from 'connect-sqlite3'
import authRoutes from './routes/authRoutes.js'
import userRoutes from './routes/userRoutes.js'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'

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

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)

app.get('/', (req, res) => {
  res.send('نظام الكاشير - الخادم يعمل')
})

app.use(notFoundHandler)
app.use(errorHandler)

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})