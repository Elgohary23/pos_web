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
  {
    id: 4,
    name: 'create_categories_and_products',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          parent_id INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE RESTRICT
        );

        CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          wholesale_price REAL NOT NULL DEFAULT 0,
          retail_price REAL NOT NULL DEFAULT 0,
          barcode TEXT UNIQUE,
          image_url TEXT,
          category_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
        CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
      `)
    },
  },
  {
    id: 5,
    name: 'add_products_quantity',
    up(db) {
      const columns = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name)
      if (!columns.includes('quantity')) {
        db.exec(`ALTER TABLE products ADD COLUMN quantity REAL NOT NULL DEFAULT 0`)
      }
    },
  },
  {
    id: 6,
    name: 'add_supply_invoices_and_audit',
    up(db) {
      const pcols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name)
      if (!pcols.includes('cost_price')) {
        db.exec(`ALTER TABLE products ADD COLUMN cost_price REAL NOT NULL DEFAULT 0`)
      }
      if (!pcols.includes('is_service')) {
        db.exec(`ALTER TABLE products ADD COLUMN is_service INTEGER NOT NULL DEFAULT 0`)
      }
      if (!pcols.includes('is_active')) {
        db.exec(`ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`)
      }
      db.prepare(`UPDATE products SET cost_price = wholesale_price WHERE cost_price = 0 AND wholesale_price != 0`).run()
      db.prepare(
        `INSERT INTO categories (name, parent_id) SELECT 'عام', NULL
         WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'عام' COLLATE NOCASE)`
      ).run()

      db.exec(`
        CREATE TABLE IF NOT EXISTS suppliers (
          supplier_id INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
          phone       TEXT,
          notes       TEXT,
          is_active   INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS supply_invoices (
          invoice_id    INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_kind  TEXT NOT NULL CHECK (invoice_kind IN ('supply','return')),
          user_id       INTEGER NOT NULL REFERENCES users(id),
          supplier_id   INTEGER REFERENCES suppliers(supplier_id),
          shipping_cost REAL NOT NULL DEFAULT 0,
          total_amount  REAL NOT NULL DEFAULT 0,
          notes         TEXT,
          created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS supply_invoice_items (
          item_id    INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_id INTEGER NOT NULL REFERENCES supply_invoices(invoice_id) ON DELETE CASCADE,
          product_id INTEGER NOT NULL REFERENCES products(id),
          quantity   INTEGER NOT NULL CHECK (quantity > 0),
          unit_cost  REAL NOT NULL,
          line_total REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          log_id     INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id    INTEGER REFERENCES users(id),
          action     TEXT NOT NULL,
          entity     TEXT,
          entity_id  INTEGER,
          details    TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
      `)
    },
  },
  {
    id: 7,
    name: 'add_invoice_item_snapshots',
    up(db) {
      const cols = db.prepare('PRAGMA table_info(supply_invoice_items)').all().map((c) => c.name)
      if (!cols.includes('product_name')) {
        db.exec(`ALTER TABLE supply_invoice_items ADD COLUMN product_name TEXT`)
      }
      if (!cols.includes('category_name')) {
        db.exec(`ALTER TABLE supply_invoice_items ADD COLUMN category_name TEXT`)
      }
      if (!cols.includes('retail_price')) {
        db.exec(`ALTER TABLE supply_invoice_items ADD COLUMN retail_price REAL`)
      }
      if (!cols.includes('barcode')) {
        db.exec(`ALTER TABLE supply_invoice_items ADD COLUMN barcode TEXT`)
      }
      if (!cols.includes('is_new_product')) {
        db.exec(`ALTER TABLE supply_invoice_items ADD COLUMN is_new_product INTEGER NOT NULL DEFAULT 0`)
      }
      db.exec(`
        UPDATE supply_invoice_items
        SET product_name = COALESCE(
              (SELECT p.name FROM products p WHERE p.id = supply_invoice_items.product_id),
              product_name
            ),
            category_name = COALESCE(
              (SELECT c.name FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = supply_invoice_items.product_id),
              category_name
            ),
            retail_price = COALESCE(
              (SELECT p.retail_price FROM products p WHERE p.id = supply_invoice_items.product_id),
              retail_price
            ),
            barcode = COALESCE(
              (SELECT p.barcode FROM products p WHERE p.id = supply_invoice_items.product_id),
              barcode
            )
        WHERE product_name IS NULL
      `)
      db.exec(`UPDATE supply_invoice_items SET product_name = 'منتج محذوف' WHERE product_name IS NULL OR product_name = ''`)
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