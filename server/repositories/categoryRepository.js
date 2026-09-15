import db from '../database/db.js'

export const CategoryRepository = {
  findById(id) {
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id)
  },

  findByName(name) {
    return db.prepare('SELECT * FROM categories WHERE name = ? COLLATE NOCASE').get(name)
  },

  getOrCreate(name) {
    return this.findByName(name) || this.create({ name, parentId: null })
  },

  listAll() {
    return db.prepare('SELECT * FROM categories ORDER BY name').all()
  },

  childrenOf(id) {
    return db.prepare('SELECT * FROM categories WHERE parent_id = ? ORDER BY name').all(id)
  },

  countChildren(id) {
    return db.prepare('SELECT COUNT(*) AS c FROM categories WHERE parent_id = ?').get(id).c
  },

  create({ name, parentId }) {
    const result = db
      .prepare('INSERT INTO categories (name, parent_id) VALUES (?, ?)')
      .run(name, parentId ?? null)
    return this.findById(result.lastInsertRowid)
  },

  update(id, { name, parentId }) {
    db.prepare(
      `UPDATE categories SET name = ?, parent_id = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(name, parentId ?? null, id)
    return this.findById(id)
  },

  delete(id) {
    db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  },
}