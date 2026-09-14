import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, 'database.sqlite')

const db = new Database(dbPath)

db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin')
if (!admin) {
  const hash = bcrypt.hashSync('admin', 10)
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', hash)
  console.log('تم إنشاء مستخدم admin بكلمة السر الافتراضية: admin/admin')
}

export default db