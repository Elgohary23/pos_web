import db from '../database/db.js'

export const TransactionLogRepository = {
  listInvoicesForDate(dateStr) {
    return db
      .prepare(
        `SELECT
           si.invoice_id,
           si.invoice_kind AS kind,
           si.user_id,
           si.shipping_cost,
           si.total_amount,
           si.notes,
           si.created_at,
           u.name AS user_name,
           u.username AS username,
           u.role AS user_role,
           u.shift_start,
           u.shift_end,
           sup.name AS supplier_name
         FROM supply_invoices si
         JOIN users u ON u.id = si.user_id
         LEFT JOIN suppliers sup ON sup.supplier_id = si.supplier_id
         WHERE date(si.created_at) = ?
         ORDER BY si.created_at ASC, si.invoice_id ASC`
      )
      .all(dateStr)
  },

  getInvoiceHeader(invoiceId) {
    return db
      .prepare(
        `SELECT
           si.invoice_id,
           si.invoice_kind AS kind,
           si.user_id,
           si.shipping_cost,
           si.total_amount,
           si.notes,
           si.created_at,
           u.name AS user_name,
           u.username AS username,
           u.role AS user_role,
           u.shift_start,
           u.shift_end,
           sup.name AS supplier_name
         FROM supply_invoices si
         JOIN users u ON u.id = si.user_id
         LEFT JOIN suppliers sup ON sup.supplier_id = si.supplier_id
         WHERE si.invoice_id = ?`
      )
      .get(invoiceId)
  },

  getItemsForInvoice(invoiceId) {
    return db
      .prepare(
        `SELECT item_id, product_id, product_name, category_name, quantity,
                unit_cost, retail_price, line_total, barcode, is_new_product
         FROM supply_invoice_items
         WHERE invoice_id = ?
         ORDER BY item_id ASC`
      )
      .all(invoiceId)
  },
}