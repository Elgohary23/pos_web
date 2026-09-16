import db from '../database/db.js'

export const TransactionLogRepository = {
  listInvoicesForDate(dateStr) {
    return db
      .prepare(
        `WITH all_invoices AS (
           SELECT
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
             sup.name AS supplier_name,
             NULL AS customer_id,
             NULL AS customer_name,
             NULL AS invoice_type,
             NULL AS discount_type,
             NULL AS discount_value,
             NULL AS paid_amount,
             NULL AS remaining_amount,
             NULL AS status,
             0 AS is_sale,
             0 AS row_order
           FROM supply_invoices si
           JOIN users u ON u.id = si.user_id
           LEFT JOIN suppliers sup ON sup.supplier_id = si.supplier_id
           WHERE date(si.created_at) = ?

           UNION ALL

           SELECT
             sli.invoice_id,
             'sale' AS kind,
             sli.user_id,
             0 AS shipping_cost,
             sli.paid_amount AS total_amount,
             sli.notes,
             sli.created_at,
             u.name AS user_name,
             u.username AS username,
             u.role AS user_role,
             u.shift_start,
             u.shift_end,
             NULL AS supplier_name,
             sli.customer_id,
             c.name AS customer_name,
             sli.invoice_type,
             sli.discount_type,
             sli.discount_value,
             sli.paid_amount,
             sli.remaining_amount,
             sli.status,
             1 AS is_sale,
             1 AS row_order
           FROM sales_invoices sli
           JOIN users u ON u.id = sli.user_id
           LEFT JOIN customers c ON c.customer_id = sli.customer_id
           WHERE date(sli.created_at) = ?
         )
         SELECT * FROM all_invoices
         ORDER BY created_at ASC, row_order ASC, invoice_id ASC`
      )
      .all(dateStr, dateStr)
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
           sup.name AS supplier_name,
           NULL AS customer_name,
           NULL AS invoice_type,
           NULL AS discount_type,
           NULL AS discount_percent,
           NULL AS discount_value,
           NULL AS total_before_discount,
           NULL AS total_after_discount,
           NULL AS paid_amount,
           NULL AS remaining_amount,
           NULL AS status,
           0 AS is_sale
         FROM supply_invoices si
         JOIN users u ON u.id = si.user_id
         LEFT JOIN suppliers sup ON sup.supplier_id = si.supplier_id
         WHERE si.invoice_id = ?`
      )
      .get(invoiceId)
  },

  getSalesInvoiceHeader(invoiceId) {
    return db
      .prepare(
        `SELECT
           sli.invoice_id,
           'sale' AS kind,
           sli.user_id,
           0 AS shipping_cost,
           sli.paid_amount AS total_amount,
           sli.notes,
           sli.created_at,
           u.name AS user_name,
           u.username AS username,
           u.role AS user_role,
           u.shift_start,
           u.shift_end,
           NULL AS supplier_name,
           c.name AS customer_name,
           sli.invoice_type,
           sli.discount_type,
           sli.discount_percent,
           sli.discount_value,
           sli.total_before_discount,
           sli.total_after_discount,
           sli.paid_amount,
           sli.remaining_amount,
           sli.status,
           1 AS is_sale
         FROM sales_invoices sli
         JOIN users u ON u.id = sli.user_id
         LEFT JOIN customers c ON c.customer_id = sli.customer_id
         WHERE sli.invoice_id = ?`
      )
      .get(invoiceId)
  },

  getItemsForInvoice(invoiceId) {
    return db
      .prepare(
        `SELECT item_id, product_id, product_name, category_name, quantity,
                unit_cost, retail_price, line_total, barcode, is_new_product, 0 AS is_sale
         FROM supply_invoice_items
         WHERE invoice_id = ?
         ORDER BY item_id ASC`
      )
      .all(invoiceId)
  },

  getSalesItemsForInvoice(invoiceId) {
    return db
      .prepare(
        `SELECT item_id, product_id, product_name, category_name, quantity,
                original_price, unit_price, cost_price_at_sale, line_total, barcode, 1 AS is_sale
         FROM sales_invoice_items
         WHERE invoice_id = ?
         ORDER BY item_id ASC`
      )
      .all(invoiceId)
  },
}