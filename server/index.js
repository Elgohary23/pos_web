import express from 'express'
import session from 'express-session'
import connectSqlite3 from 'connect-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import authRoutes from './routes/authRoutes.js'
import userRoutes from './routes/userRoutes.js'
import categoryRoutes from './routes/categoryRoutes.js'
import productRoutes from './routes/productRoutes.js'
import supplierRoutes from './routes/supplierRoutes.js'
import supplyInvoiceRoutes from './routes/supplyInvoiceRoutes.js'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, 'uploads')
const barcodesDir = path.join(__dirname, 'public', 'barcodes')

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}
if (!fs.existsSync(barcodesDir)) {
  fs.mkdirSync(barcodesDir, { recursive: true })
}

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

app.use('/uploads', express.static(uploadsDir))
app.use('/barcodes', express.static(barcodesDir))

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/products', productRoutes)
app.use('/api/suppliers', supplierRoutes)
app.use('/api/supply-invoices', supplyInvoiceRoutes)

app.get('/', (req, res) => {
  res.send('نظام الكاشير - الخادم يعمل')
})

app.use(notFoundHandler)
app.use(errorHandler)

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})