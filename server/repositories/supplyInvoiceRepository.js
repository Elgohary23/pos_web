import db from '../database/db.js'

export const SupplyInvoiceRepository = {
  createInvoice({ invoiceKind, userId, supplierId, shippingCost, totalAmount, notes }) {
    const result = db
      .prepare(
        `INSERT INTO supply_invoices (invoice_kind, user_id, supplier_id, shipping_cost, total_amount, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(invoiceKind, userId, supplierId, shippingCost, totalAmount, notes)
    return Number(result.lastInsertRowid)
  },

  insertItems(invoiceId, items) {
    const stmt = db.prepare(
      `INSERT INTO supply_invoice_items
         (invoice_id, product_id, quantity, unit_cost, line_total, product_name, category_name, retail_price, barcode, is_new_product)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const item of items) {
      stmt.run(
        invoiceId,
        item.product_id,
        item.quantity,
        item.unit_cost,
        item.line_total,
        item.product_name,
        item.category_name,
        item.retail_price,
        item.barcode,
        item.is_new_product
      )
    }
  },
}