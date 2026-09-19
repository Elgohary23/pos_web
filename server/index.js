import express from 'express'
import session from 'express-session'
import connectSqlite3 from 'connect-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import authRoutes from './routes/authRoutes.js'
import userRoutes from './routes/userRoutes.js'
import categoryRoutes from './routes/categoryRoutes.js'
import productRoutes from './routes/productRoutes.js'
import supplierRoutes from './routes/supplierRoutes.js'
import supplyInvoiceRoutes from './routes/supplyInvoiceRoutes.js'
import transactionRoutes from './routes/transactionRoutes.js'
import salesInvoiceRoutes from './routes/salesInvoiceRoutes.js'
import customerRoutes from './routes/customerRoutes.js'
import backupRoutes from './routes/backupRoutes.js'
import barcodeRoutes from './routes/barcodeRoutes.js'
import systemRoutes from './routes/systemRoutes.js'
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, 'uploads')
const barcodesDir = path.join(__dirname, 'public', 'barcodes')
const backupsDir = path.join(__dirname, 'backups')
const clientDist = process.env.CLIENT_DIST || path.join(__dirname, '..', 'client', 'dist')
const clientIndex = path.join(clientDist, 'index.html')
const hasClientBuild = fs.existsSync(clientIndex)

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}
if (!fs.existsSync(barcodesDir)) {
  fs.mkdirSync(barcodesDir, { recursive: true })
}
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true })
}

const app = express()
const port = process.env.PORT || 3000
const sessionSecret = process.env.SESSION_SECRET || 'kasabi-dev-secret-change-in-production'

const SqliteStore = connectSqlite3(session)

app.use(express.json())

app.use(
  session({
    store: new SqliteStore({ db: 'sessions.sqlite', dir: process.env.SESSION_DIR || '.' }),
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
app.use('/api/transactions', transactionRoutes)
app.use('/api/sales-invoices', salesInvoiceRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/backup', backupRoutes)
app.use('/api/barcodes', barcodeRoutes)
app.use('/api/system', systemRoutes)

if (hasClientBuild) {
  app.use(express.static(clientDist))
  app.use((req, res, next) => {
    const hasExtension = Boolean(path.extname(req.path).toLowerCase())
    if (req.method === 'GET' && !req.path.startsWith('/api') && !hasExtension) {
      return res.sendFile(clientIndex)
    }
    next()
  })
} else {
  app.get('/', (req, res) => {
    res.send('نظام الكاشير - الخادم يعمل')
  })
}

app.use(notFoundHandler)
app.use(errorHandler)

const lanAddresses = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address)

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
  for (const address of [...new Set(lanAddresses())]) {
    console.log(`LAN: http://${address}:${port}`)
  }
})