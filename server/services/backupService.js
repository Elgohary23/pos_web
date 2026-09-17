import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import db, { dbPath, closeDatabase, reconnectDatabase } from '../database/db.js'
import { ValidationError } from '../utils/errors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backupsDir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups')

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true })
}

const SQLITE_HEADER = 'SQLite format 3'

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

function isSqliteFile(filePath) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(16)
    const read = fs.readSync(fd, buf, 0, 16, 0)
    return read === 16 && buf.toString('latin1', 0, SQLITE_HEADER.length) === SQLITE_HEADER
  } finally {
    fs.closeSync(fd)
  }
}

function assertValidDatabase(filePath) {
  let probe
  try {
    probe = new Database(filePath, { readonly: true, fileMustExist: true })
    const result = probe.pragma('integrity_check')
    const value = Array.isArray(result) && result[0] ? Object.values(result[0])[0] : null
    if (value !== 'ok') {
      throw new ValidationError('ملف النسخة الاحتياطية تالف أو غير مكتمل')
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err
    throw new ValidationError('الملف ليس قاعدة بيانات SQLite صالحة')
  } finally {
    if (probe) {
      try {
        probe.close()
      } catch {
        // ignore
      }
    }
  }
}

function materializeSqlScript(sqlFilePath) {
  const sql = fs.readFileSync(sqlFilePath, 'utf8')
  if (!sql.trim()) throw new ValidationError('ملف الاستعادة فارغ')

  const target = path.join(backupsDir, `restore-${Date.now()}.sqlite`)
  const instance = new Database(target)
  try {
    instance.exec(sql)
  } catch {
    instance.close()
    for (const suffix of ['', '-wal', '-shm']) {
      const file = `${target}${suffix}`
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }
    throw new ValidationError('تعذر تنفيذ ملف SQL — تأكد من صحة الملف')
  }
  instance.close()
  return target
}

function removeSidecars(filePath) {
  for (const suffix of ['-wal', '-shm']) {
    const file = `${filePath}${suffix}`
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }
}

function removeFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // ignore cleanup failures
  }
}

export const BackupService = {
  async createBackup() {
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true })
    const filename = `pos-backup-${timestamp()}.sqlite`
    const filePath = path.join(backupsDir, filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    await db.backup(filePath)
    removeFile(`${filePath}-wal`)
    removeFile(`${filePath}-shm`)

    const stats = fs.statSync(filePath)
    return { filePath, filename, size: stats.size }
  },

  restore(uploadPath) {
    if (!uploadPath || !fs.existsSync(uploadPath)) {
      throw new ValidationError('لم يتم استلام ملف النسخة الاحتياطية')
    }

    let derived = null

    try {
      let candidate = uploadPath

      if (!isSqliteFile(uploadPath)) {
        candidate = materializeSqlScript(uploadPath)
        derived = candidate
      }

      assertValidDatabase(candidate)

      const safetyCopy = `${dbPath}.pre-restore`
      closeDatabase()
      removeSidecars(dbPath)

      if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, safetyCopy)
      fs.copyFileSync(candidate, dbPath)

      try {
        reconnectDatabase()
      } catch (err) {
        if (fs.existsSync(safetyCopy)) fs.copyFileSync(safetyCopy, dbPath)
        reconnectDatabase()
        throw new ValidationError('تعذر تشغيل قاعدة البيانات المستعادة')
      }

      const counts = {
        users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
        products: db.prepare('SELECT COUNT(*) AS c FROM products').get().c,
      }

      return { counts }
    } finally {
      removeFile(uploadPath)
      if (derived) removeFile(derived)
    }
  },

  status() {
    const count = (table) => {
      try {
        return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c
      } catch {
        return 0
      }
    }
    const users = count('users')
    const products = count('products')
    const sales = count('sales_invoices')
    const supply = count('supply_invoices')
    return {
      hasData: products > 0 || sales > 0 || supply > 0,
      counts: { users, products, sales, supply },
    }
  },
}
