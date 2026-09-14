import bcrypt from 'bcryptjs'

const migrations = [
  {
    id: 1,
    name: 'create_users_table',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
    },
  },
  {
    id: 2,
    name: 'add_user_roles_and_shift',
    up(db) {
      const columns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
      if (!columns.includes('role')) {
        db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'employee'`)
      }
      if (!columns.includes('name')) {
        db.exec(`ALTER TABLE users ADD COLUMN name TEXT`)
      }
      if (!columns.includes('shift_start')) {
        db.exec(`ALTER TABLE users ADD COLUMN shift_start TEXT`)
      }
      if (!columns.includes('shift_end')) {
        db.exec(`ALTER TABLE users ADD COLUMN shift_end TEXT`)
      }
    },
  },
  {
    id: 3,
    name: 'seed_admin',
    up(db) {
      const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin')
      if (!admin) {
        const hash = bcrypt.hashSync('admin', 10)
        db.prepare(
          'INSERT INTO users (username, password_hash, role, name) VALUES (?, ?, ?, ?)'
        ).run('admin', hash, 'admin', 'مدير النظام')
      }
      db.prepare(`UPDATE users SET role = 'admin', name = COALESCE(name, 'مدير النظام') WHERE username = 'admin'`).run()
    },
  },
]

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((row) => row.id))
  const sorted = [...migrations].sort((a, b) => a.id - b.id)
  const tx = db.transaction(() => {
    for (const migration of sorted) {
      if (applied.has(migration.id)) continue
      migration.up(db)
      db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(
        migration.id,
        migration.name
      )
    }
  })
  tx()
}