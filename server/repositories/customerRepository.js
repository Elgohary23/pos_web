import db from '../database/db.js'

export const CustomerRepository = {
  findById(id) {
    return db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(id)
  },

  findByNameAndPhone(name, phone) {
    if (phone) {
      return db.prepare('SELECT * FROM customers WHERE name = ? AND phone = ?').get(name, phone)
    }
    return db.prepare('SELECT * FROM customers WHERE name = ? AND phone IS NULL').get(name)
  },

  getOrCreate(name, phone = null) {
    const existing = this.findByNameAndPhone(name, phone || null)
    if (existing) return existing
    const result = db
      .prepare('INSERT INTO customers (name, phone) VALUES (?, ?)')
      .run(name, phone || null)
    return this.findById(result.lastInsertRowid)
  },

  list({ q = '', limit = null } = {}) {
    let sql = 'SELECT * FROM customers'
    const params = []
    if (q) {
      sql += ' WHERE name LIKE ? OR phone LIKE ?'
      params.push(`%${q}%`, `%${q}%`)
    }
    sql += ' ORDER BY customer_id DESC'
    if (limit) {
      sql += ' LIMIT ?'
      params.push(limit)
    }
    return db.prepare(sql).all(...params)
  },
}
