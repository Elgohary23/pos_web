import db from '../database/db.js'

export const SalesInvoiceRepository = {
  createInvoice({
    invoiceType, customerId, userId, totalBeforeDiscount, discountType,
    discountPercent, discountValue, totalAfterDiscount, paidAmount,
    remainingAmount, status, notes,
  }) {
    const result = db
      .prepare(
        `INSERT INTO sales_invoices
          (invoice_type, customer_id, user_id, total_before_discount, discount_type,
           discount_percent, discount_value, total_after_discount, paid_amount,
           remaining_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        invoiceType, customerId || null, userId, totalBeforeDiscount, discountType,
        discountPercent, discountValue, totalAfterDiscount, paidAmount,
        remainingAmount, status || 'completed', notes || null,
      )
    return Number(result.lastInsertRowid)
  },

  insertItems(invoiceId, items) {
    const stmt = db.prepare(
      `INSERT INTO sales_invoice_items
        (invoice_id, product_id, quantity, original_price, unit_price,
         cost_price_at_sale, line_total, product_name, category_name, barcode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const item of items) {
      stmt.run(
        invoiceId, item.product_id, item.quantity, item.original_price,
        item.unit_price, item.cost_price_at_sale, item.line_total,
        item.product_name, item.category_name, item.barcode,
      )
    }
  },

  findById(invoiceId) {
    return db
      .prepare(
        `SELECT si.*, c.name AS customer_name, c.phone AS customer_phone,
                u.name AS user_name, u.username AS username
         FROM sales_invoices si
         LEFT JOIN customers c ON c.customer_id = si.customer_id
         JOIN users u ON u.id = si.user_id
         WHERE si.invoice_id = ?`
      )
      .get(invoiceId)
  },

  findItemsByInvoiceId(invoiceId) {
    return db
      .prepare(
        `SELECT sii.*, p.name AS product_current_name
         FROM sales_invoice_items sii
         LEFT JOIN products p ON p.id = sii.product_id
         WHERE sii.invoice_id = ?
         ORDER BY sii.item_id ASC`
      )
      .all(invoiceId)
  },
}
