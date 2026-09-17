import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { runMigrations } from './migrations.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database.sqlite')

function configure(instance) {
  instance.pragma('journal_mode = WAL')
  instance.pragma('foreign_keys = ON')
  runMigrations(instance)
}

function open() {
  const instance = new Database(dbPath)
  configure(instance)
  return instance
}

let db = open()

export function reconnectDatabase() {
  db = open()
  return db
}

export function closeDatabase() {
  if (db && db.open) db.close()
}

export { db as default }
