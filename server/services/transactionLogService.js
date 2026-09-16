import { TransactionLogRepository } from '../repositories/transactionLogRepository.js'
import { ValidationError } from '../utils/errors.js'
import { AppError } from '../utils/AppError.js'
import { money, round2, plus, minus } from '../utils/money.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(dateStr) {
  if (!DATE_RE.test(dateStr)) return false
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + (m || 0)
}

function isTimeInShift(time, start, end) {
  if (!start || !end) return true
  const t = toMinutes(time)
  const s = toMinutes(start)
  const e = toMinutes(end)
  if (s === e) return true
  if (e > s) return t >= s && t <= e
  return t >= s || t <= e
}

function timeOf(createdAt) {
  return String(createdAt || '').slice(11, 16)
}

function mapInvoiceRow(row) {
  const time = timeOf(row.created_at)
  return {
    id: row.invoice_id,
    kind: row.kind,
    total: Number(row.total_amount),
    time,
    created_at: row.created_at,
    user_id: row.user_id,
    user_name: row.user_name,
    username: row.username,
    user_role: row.user_role,
    shift_start: row.shift_start || null,
    shift_end: row.shift_end || null,
    in_shift: isTimeInShift(time, row.shift_start, row.shift_end),
  }
}

export const TransactionLogService = {
  getDailyTransactions(dateStr) {
    if (!isValidDate(dateStr)) {
      throw new ValidationError('التاريخ غير صالح — استخدم صيغة YYYY-MM-DD')
    }

    const rows = TransactionLogRepository.listInvoicesForDate(dateStr)
    const invoices = rows.map(mapInvoiceRow)

    let supplyTotal = money(0)
    let returnTotal = money(0)
    let supplyCount = 0
    let returnCount = 0
    for (const inv of invoices) {
      if (inv.kind === 'return') {
        returnTotal = plus(returnTotal, inv.total)
        returnCount += 1
      } else {
        supplyTotal = plus(supplyTotal, inv.total)
        supplyCount += 1
      }
    }
    const net = round2(plus(supplyTotal, returnTotal).toNumber())
    const summary = {
      count: invoices.length,
      supply_count: supplyCount,
      return_count: returnCount,
      supply_total: round2(supplyTotal.toNumber()),
      return_total: round2(returnTotal.toNumber()),
      net,
    }

    // ---- view 1: by shift (with out-of-hours catch-all) ----
    const groupMap = new Map()
    const noShift = []
    const outOfHours = []

    for (const inv of invoices) {
      if (inv.in_shift) {
        if (inv.shift_start && inv.shift_end) {
          const key = `${inv.shift_start}~${inv.shift_end}`
          if (!groupMap.has(key)) {
            groupMap.set(key, {
              key,
              shift_start: inv.shift_start,
              shift_end: inv.shift_end,
              users: new Map(),
              invoices: [],
              subtotal: money(0),
            })
          }
          const group = groupMap.get(key)
          group.invoices.push(inv)
          group.users.set(inv.user_id, `${inv.user_name} (${inv.username})`)
          group.subtotal = plus(group.subtotal, inv.total)
        } else {
          noShift.push(inv)
        }
      } else {
        outOfHours.push(inv)
      }
    }

    const groups = [...groupMap.values()]
      .map((g) => ({
        key: g.key,
        shift_start: g.shift_start,
        shift_end: g.shift_end,
        users: [...g.users.values()],
        invoices: g.invoices,
        subtotal: round2(g.subtotal.toNumber()),
      }))
      .sort((a, b) => (a.shift_start < b.shift_start ? -1 : a.shift_start > b.shift_start ? 1 : 0))

    const noShiftBlock = {
      invoices: noShift,
      subtotal: round2(noShift.reduce((s, i) => s + i.total, 0)),
    }
    const outOfHoursBlock = {
      invoices: outOfHours,
      subtotal: round2(outOfHours.reduce((s, i) => s + i.total, 0)),
    }

    // ---- view 2: by account ----
    const accountMap = new Map()
    for (const inv of invoices) {
      if (!accountMap.has(inv.user_id)) {
        accountMap.set(inv.user_id, {
          user_id: inv.user_id,
          user_name: inv.user_name,
          username: inv.username,
          user_role: inv.user_role,
          invoices: [],
          subtotal: money(0),
        })
      }
      const acc = accountMap.get(inv.user_id)
      acc.invoices.push(inv)
      acc.subtotal = plus(acc.subtotal, inv.total)
    }

    const account_view = [...accountMap.values()]
      .map((acc) => ({
        user_id: acc.user_id,
        user_name: acc.user_name,
        username: acc.username,
        user_role: acc.user_role,
        count: acc.invoices.length,
        subtotal: round2(acc.subtotal.toNumber()),
        invoices: acc.invoices,
      }))
      .sort((a, b) => {
        const cmp = (a.user_name || '').localeCompare(b.user_name || '', 'ar')
        return cmp !== 0 ? cmp : String(a.username).localeCompare(String(b.username))
      })

    return {
      date: dateStr,
      summary,
      shift_view: { groups, no_shift: noShiftBlock, out_of_hours: outOfHoursBlock },
      account_view,
    }
  },

  getInvoiceDetails(id) {
    const idNum = Number(id)
    if (!Number.isInteger(idNum) || idNum < 1) {
      throw new ValidationError('رقم الفاتورة غير صالح')
    }
    const header = TransactionLogRepository.getInvoiceHeader(idNum)
    if (!header) {
      throw new AppError('NOT_FOUND', 'الفاتورة غير موجودة', 404)
    }
    const items = TransactionLogRepository.getItemsForInvoice(idNum)

    const time = timeOf(header.created_at)
    return {
      invoice: {
        id: header.invoice_id,
        kind: header.kind,
        created_at: header.created_at,
        time,
        in_shift: isTimeInShift(time, header.shift_start, header.shift_end),
        user_id: header.user_id,
        user_name: header.user_name,
        username: header.username,
        user_role: header.user_role,
        supplier_name: header.supplier_name || null,
        shipping_cost: Number(header.shipping_cost),
        total_amount: Number(header.total_amount),
        notes: header.notes || null,
      },
      items: items.map((it) => ({
        item_id: it.item_id,
        product_id: it.product_id,
        product_name: it.product_name || 'منتج محذوف',
        category_name: it.category_name || '—',
        quantity: Number(it.quantity),
        unit_cost: Number(it.unit_cost),
        retail_price: it.retail_price === null || it.retail_price === undefined ? null : Number(it.retail_price),
        line_total: Number(it.line_total),
        barcode: it.barcode || null,
        is_new_product: Boolean(it.is_new_product),
      })),
    }
  },
}