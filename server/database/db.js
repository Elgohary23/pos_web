import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { runMigrations } from './migrations.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database.sqlite')

const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

runMigrations(db)

export default db