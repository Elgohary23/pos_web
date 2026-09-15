import db from '../database/db.js'

export const SupplierRepository = {
  list() {
    return db.prepare('SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name').all()
  },

  findByName(name) {
    return db.prepare('SELECT * FROM suppliers WHERE name = ? COLLATE NOCASE').get(name)
  },

  create(name) {
    const result = db.prepare('INSERT INTO suppliers (name) VALUES (?)').run(name)
    return { supplier_id: Number(result.lastInsertRowid), name }
  },

  getOrCreate(name) {
    return this.findByName(name) || this.create(name)
  },
}