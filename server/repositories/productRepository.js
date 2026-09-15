import db from '../database/db.js'

export const ProductRepository = {
  findById(id) {
    return db
      .prepare(
        `SELECT p.*, c.name AS category_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.id = ?`
      )
      .get(id)
  },

  findByBarcode(barcode) {
    return db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode)
  },

  findByName(name) {
    return db.prepare('SELECT * FROM products WHERE name = ? COLLATE NOCASE').get(name)
  },

  list({ q = '', categoryId = null, active = false, limit = null } = {}) {
    let sql = `SELECT p.*, c.name AS category_name
               FROM products p
               LEFT JOIN categories c ON c.id = p.category_id`
    const where = []
    const params = []

    if (categoryId !== null) {
      where.push('p.category_id = ?')
      params.push(categoryId)
    }
    if (active) {
      where.push('p.is_active = 1')
    }
    if (q) {
      where.push('(p.name LIKE ? OR p.barcode LIKE ?)')
      params.push(`%${q}%`, `%${q}%`)
    }
    if (where.length) {
      sql += ' WHERE ' + where.join(' AND ')
    }
    sql += ' ORDER BY p.id DESC'
    if (limit !== null && Number.isInteger(Number(limit)) && Number(limit) > 0) {
      sql += ' LIMIT ?'
      params.push(Number(limit))
    }
    return db.prepare(sql).all(...params)
  },

  countInCategory(categoryId) {
    return db.prepare('SELECT COUNT(*) AS c FROM products WHERE category_id = ?').get(categoryId).c
  },

  create({ name, wholesalePrice, retailPrice, barcode, imageUrl, categoryId, quantity, costPrice }) {
    const result = db
      .prepare(
        `INSERT INTO products (name, wholesale_price, retail_price, cost_price, barcode, image_url, category_id, quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(name, wholesalePrice, retailPrice, costPrice ?? wholesalePrice, barcode, imageUrl, categoryId, quantity)
    return this.findById(result.lastInsertRowid)
  },

  createFromSupply({ name, barcode, costPrice, wholesalePrice, retailPrice, categoryId }) {
    const result = db
      .prepare(
        `INSERT INTO products (name, wholesale_price, retail_price, cost_price, barcode, category_id, quantity)
         VALUES (?, ?, ?, ?, ?, ?, 0)`
      )
      .run(name, wholesalePrice, retailPrice, costPrice, barcode, categoryId)
    return this.findById(result.lastInsertRowid)
  },

  reactivate(id) {
    db.prepare(`UPDATE products SET is_active = 1, updated_at = datetime('now') WHERE id = ?`).run(id)
  },

  updateCategory(id, categoryId) {
    db.prepare(`UPDATE products SET category_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
      categoryId,
      id
    )
  },

  updateStockAndPrices(id, { quantity, costPrice, retailPrice }) {
    const updates = ['quantity = ?', 'cost_price = ?', "updated_at = datetime('now')"]
    const params = [quantity, costPrice]
    if (retailPrice !== null && retailPrice !== undefined) {
      updates.splice(2, 0, 'retail_price = ?')
      params.push(retailPrice)
    }
    params.push(id)
    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  },

  decreaseStock(id, quantity) {
    return db
      .prepare(`UPDATE products SET quantity = quantity - ?, updated_at = datetime('now') WHERE id = ? AND quantity >= ?`)
      .run(quantity, id, quantity)
  },

  update(id, { name, wholesalePrice, retailPrice, barcode, imageUrl, categoryId, quantity }) {
    db.prepare(
      `UPDATE products
       SET name = ?, wholesale_price = ?, retail_price = ?, barcode = ?, image_url = ?, category_id = ?,
           quantity = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(name, wholesalePrice, retailPrice, barcode, imageUrl, categoryId, quantity, id)
    return this.findById(id)
  },

  delete(id) {
    db.prepare('DELETE FROM products WHERE id = ?').run(id)
  },
}