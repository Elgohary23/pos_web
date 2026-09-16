import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const barcodesDir = path.join(__dirname, '..', 'public', 'barcodes')
const tempDb = path.join(os.tmpdir(), `transactions_test-${process.pid}.sqlite`)

process.env.DB_PATH = tempDb

for (const suffix of ['', '-wal', '-shm']) {
  const file = `${tempDb}${suffix}`
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

const { default: db } = await import('../database/db.js')
const { SupplyService } = await import('../services/supplyService.js')
const { UserService } = await import('../services/userService.js')
const { TransactionLogService } = await import('../services/transactionLogService.js')
const { CategoryRepository } = await import('../repositories/categoryRepository.js')
const { ProductRepository } = await import('../repositories/productRepository.js')
const { AppError } = await import('../utils/errors.js')

const pngsCreated = []
const DAY = '2026-09-16'

let passed = 0
let failed = 0
function ok(name, cond) {
  if (cond) { passed += 1; console.log(`  ✔ ${name}`) }
  else { failed += 1; console.error(`  ✘ ${name}`) }
}
function nearly(a, b) {
  return Math.abs(Number(a) - Number(b)) < 1e-6
}
async function expectError(fn, code, label) {
  try {
    await fn()
    console.error(`  ✘ ${label} — لم يحدث خطأ`)
    failed += 1
  } catch (err) {
    ok(`${label} -> [${err.code}]`, err.code === code)
  }
}

function setInvoiceTime(invoiceId, hhmm, day = DAY) {
  db.prepare('UPDATE supply_invoices SET created_at = ? WHERE invoice_id = ?').run(`${day} ${hhmm}:00`, invoiceId)
}

const admin = { id: 1, username: 'admin' }
const defaultCat = CategoryRepository.findByName('عام')

// ---------- Setup employees ----------
console.log('\nSetup: الموظفون')
const empDay = UserService.createEmployee({ username: 'emp_day', password: 'secret123', name: 'أحمد', shiftStart: '09:00', shiftEnd: '17:00' })
const empNoShift = UserService.createEmployee({ username: 'emp_noshift', password: 'secret123', name: 'محمد' })
const empNight = UserService.createEmployee({ username: 'emp_night', password: 'secret123', name: 'ليل', shiftStart: '22:00', shiftEnd: '06:00' })
ok('موظف يومي بشيفت', empDay.shift_start === '09:00' && empDay.shift_end === '17:00')
ok('موظف بدون شيفت', empNoShift.shift_start === null)
ok('موظف شيفت ليلي', empNight.shift_start === '22:00' && empNight.shift_end === '06:00')

// ---------- Scenario 1: snapshot capture ----------
console.log('\nScenario 1: التقاط السناپ شوت')
const pen = ProductRepository.create({ name: 'منتج قديم', wholesalePrice: 6, retailPrice: 6, barcode: '100000000010', categoryId: defaultCat.id, quantity: 0, costPrice: 6 })

const a1 = await SupplyService.createSupplyInvoice({
  kind: 'supply',
  notes: 'شحنة سبتمبر',
  items: [
    { name: 'منتج قديم', unit_cost: 5, quantity: 10 },
    { name: 'منتج جديد', unit_cost: 8, retail_price: 15, quantity: 4, category_name: 'أدوات مكتبية' },
  ],
}, admin)
setInvoiceTime(a1.invoice_id, '09:15')

const a1Items = db.prepare('SELECT * FROM supply_invoice_items WHERE invoice_id = ? ORDER BY item_id ASC').all(a1.invoice_id)
ok('بندان محفوظان بالسناپ شوت', a1Items.length === 2)
const oldItem = a1Items[0]
const newItem = a1Items[1]
ok('product_name القديم = منتج قديم', oldItem.product_name === 'منتج قديم')
ok('category_name القديم = عام', oldItem.category_name === 'عام')
ok('retail_price القديم = 6 (لقطة بلا تحديث)', nearly(oldItem.retail_price, 6))
ok('barcode القديم منقول', oldItem.barcode === '100000000010')
ok('is_new_product القديم = 0', Number(oldItem.is_new_product) === 0)
ok('product_name الجديد = منتج جديد', newItem.product_name === 'منتج جديد')
ok('category_name الجديد = أدوات مكتبية', newItem.category_name === 'أدوات مكتبية')
ok('retail_price الجديد = 15', nearly(newItem.retail_price, 15))
ok('barcode الجديد 12 HEX', /^[0-9A-F]{12}$/.test(newItem.barcode))
ok('is_new_product الجديد = 1', Number(newItem.is_new_product) === 1)
const newPng = path.join(barcodesDir, `${newItem.barcode}.png`)
pngsCreated.push(newPng)

// update retail of an existing product → snapshot must keep the old value row
const a2 = await SupplyService.createSupplyInvoice({
  kind: 'supply',
  items: [{ name: 'منتج قديم', unit_cost: 5, retail_price: 9, quantity: 1 }],
}, admin)
setInvoiceTime(a2.invoice_id, '09:30')
const a2Item = db.prepare('SELECT * FROM supply_invoice_items WHERE invoice_id = ?').get(a2.invoice_id)
ok('سناپ شوت سعر البيع بعد تحديثه = 9', nearly(a2Item.retail_price, 9))
ok('سعر المنتج نفسه تحدث = 9', nearly(ProductRepository.findById(pen.id).retail_price, 9))

// ---------- Scenario 2: daily grouping + shift/out-of-hours ----------
console.log('\nScenario 2: سجل اليوم — شيفتات وخارج ساعات العمل')
const ahmedDay = { id: empDay.id, username: empDay.username }
const ah1 = await SupplyService.createSupplyInvoice({
  kind: 'supply',
  supplier_name: 'مكتبة الليل',
  shipping_cost: 0,
  items: [{ name: 'صندوق', unit_cost: 10, quantity: 10, retail_price: 20 }],
}, ahmedDay)
setInvoiceTime(ah1.invoice_id, '10:30')
pngsCreated.push(path.join(barcodesDir, `${db.prepare('SELECT barcode FROM supply_invoice_items WHERE invoice_id = ?').get(ah1.invoice_id).barcode}.png`))

const ah2 = await SupplyService.createSupplyInvoice({
  kind: 'return',
  items: [{ name: 'صندوق', unit_cost: 10, quantity: 2 }],
}, ahmedDay)
setInvoiceTime(ah2.invoice_id, '18:00')
ok('مرتجع خارج الشيفت سالب', ah2.total === -20)

const m1 = await SupplyService.createSupplyInvoice({
  kind: 'supply',
  items: [{ name: 'منتج محمد', unit_cost: 2, quantity: 4, retail_price: 5 }],
}, { id: empNoShift.id, username: empNoShift.username })
setInvoiceTime(m1.invoice_id, '14:00')
pngsCreated.push(path.join(barcodesDir, `${db.prepare('SELECT barcode FROM supply_invoice_items WHERE invoice_id = ?').get(m1.invoice_id).barcode}.png`))

const nightUser = { id: empNight.id, username: empNight.username }
const l1 = await SupplyService.createSupplyInvoice({
  kind: 'supply',
  items: [{ name: 'منتج ليلي', unit_cost: 3, quantity: 6, retail_price: 7 }],
}, nightUser)
setInvoiceTime(l1.invoice_id, '23:30')
pngsCreated.push(path.join(barcodesDir, `${db.prepare('SELECT barcode FROM supply_invoice_items WHERE invoice_id = ?').get(l1.invoice_id).barcode}.png`))

const l2 = await SupplyService.createSupplyInvoice({
  kind: 'supply',
  items: [{ name: 'منتج ليلي 2', unit_cost: 4, quantity: 5, retail_price: 9 }],
}, nightUser)
setInvoiceTime(l2.invoice_id, '12:00')
pngsCreated.push(path.join(barcodesDir, `${db.prepare('SELECT barcode FROM supply_invoice_items WHERE invoice_id = ?').get(l2.invoice_id).barcode}.png`))

const day = TransactionLogService.getDailyTransactions(DAY)
ok('count = 7', day.summary.count === 7)
ok('supply_count = 6', day.summary.supply_count === 6)
ok('return_count = 1', day.summary.return_count === 1)
ok('إجمالي التوريد = 233', nearly(day.summary.supply_total, 233))
ok('إجمالي المرتجع = -20', nearly(day.summary.return_total, -20))
ok('الصافي = 213', nearly(day.summary.net, 213))

const dayGroup = day.shift_view.groups.find((g) => g.shift_start === '09:00' && g.shift_end === '17:00')
ok('مجموعة شيفت 09:00-17:00', !!dayGroup)
ok('تحتوي فاتورة أحمد داخل الشيفت', dayGroup && dayGroup.invoices.some((i) => i.id === ah1.invoice_id && i.in_shift))
ok('إجمالي مجموعة النهار = 100', dayGroup && nearly(dayGroup.subtotal, 100))
ok('أسماء المستخدمين داخل الشيفت', dayGroup && dayGroup.users.some((u) => u.includes('أحمد')))

const nightGroup = day.shift_view.groups.find((g) => g.shift_start === '22:00' && g.shift_end === '06:00')
ok('مجموعة شيفت ليلي (عابر منتصف الليل)', !!nightGroup)
ok('فاتورة 23:30 داخل الشيفت الليلي', nightGroup && nightGroup.invoices.some((i) => i.id === l1.invoice_id))

const outside = day.shift_view.out_of_hours
ok('خارج ساعات العمل = فاتورتان', outside.invoices.length === 2)
ok('تشمل المرتجع 18:00', outside.invoices.some((i) => i.id === ah2.invoice_id && !i.in_shift))
ok('تشمل شحن 12:00 (خارج شيفت ليلي)', outside.invoices.some((i) => i.id === l2.invoice_id && !i.in_shift))
ok('صافي خارج ساعات = 0 (20 + -20)', nearly(outside.subtotal, 0))

const noShiftBlock = day.shift_view.no_shift
ok('بدون شيفت مسجل = 3 فواتير (admins + محمد)', noShiftBlock.invoices.length === 3)
ok('إجمالي بدون شيفت = 95', nearly(noShiftBlock.subtotal, 95))

// ---------- Scenario 3: account view ----------
console.log('\nScenario 3: العرض حسب الأكونت')
ok('4 حسابات', day.account_view.length === 4)
const accAhmed = day.account_view.find((a) => a.username === 'emp_day')
ok('أحمد: فاتورتان 80', accAhmed && accAhmed.count === 2 && nearly(accAhmed.subtotal, 80))
const accAdmin = day.account_view.find((a) => a.username === 'admin')
ok('admin: فاتورتان 87', accAdmin && accAdmin.count === 2 && nearly(accAdmin.subtotal, 87))
ok('محمد: فاتورة 8', day.account_view.find((a) => a.username === 'emp_noshift')?.subtotal === 8)
ok('ليل: فاتورتان 38', day.account_view.find((a) => a.username === 'emp_night')?.subtotal === 38)

// ---------- Scenario 4: invoice details ----------
console.log('\nScenario 4: تفاصيل الفاتورة')
const detail = TransactionLogService.getInvoiceDetails(ah1.invoice_id)
ok('الفاتورة = توريد', detail.invoice.kind === 'supply')
ok('القائم = أحمد', detail.invoice.user_name === 'أحمد' && detail.invoice.username === 'emp_day')
ok('المورد مجلوب', detail.invoice.supplier_name === 'مكتبة الليل')
ok('داخل ساعات العمل', detail.invoice.in_shift === true)
ok('بندان مفصلان', detail.items.length === 1 && detail.items[0].quantity === 10 && nearly(detail.items[0].unit_cost, 10))
ok('سعر البيع snapshot', nearly(detail.items[0].retail_price, 20))

const detailReturn = TransactionLogService.getInvoiceDetails(ah2.invoice_id)
ok('المرتجع خارج ساعات العمل', detailReturn.invoice.in_shift === false)
ok('إجمالي المرتجع سالب', nearly(detailReturn.invoice.total_amount, -20))

const detailAdmin = TransactionLogService.getInvoiceDetails(a1.invoice_id)
ok('admin بدون شيفت → داخل ساعات', detailAdmin.invoice.in_shift === true)
ok('بدون مورد → null', detailAdmin.invoice.supplier_name === null)

// ---------- Scenario 5: validation ----------
console.log('\nScenario 5: تحققات')
expectError(() => TransactionLogService.getDailyTransactions('2026-99-99'), 'VALIDATION_ERROR', 'تاريخ خاطئ')
expectError(() => TransactionLogService.getDailyTransactions('abc'), 'VALIDATION_ERROR', 'تاريخ غير صالح')
expectError(() => TransactionLogService.getDailyTransactions('2026-02-30'), 'VALIDATION_ERROR', 'يوم غير موجود')
expectError(() => TransactionLogService.getDailyTransactions(''), 'VALIDATION_ERROR', 'تاريخ فارغ')
expectError(() => TransactionLogService.getInvoiceDetails(0), 'VALIDATION_ERROR', 'رقم فاتورة صفر')
expectError(() => TransactionLogService.getInvoiceDetails('x7'), 'VALIDATION_ERROR', 'رقم فاتورة نصي')
expectError(() => TransactionLogService.getInvoiceDetails(999999), 'NOT_FOUND', 'فاتورة غير موجودة')

// ---------- Scenario 6: empty day ----------
console.log('\nScenario 6: يوم فارغ')
const empty = TransactionLogService.getDailyTransactions('2025-01-01')
ok('لا فواتير', empty.summary.count === 0)
ok('لا مجموعات', empty.shift_view.groups.length === 0 && empty.shift_view.out_of_hours.invoices.length === 0 && empty.shift_view.no_shift.invoices.length === 0)
ok('لا حسابات', empty.account_view.length === 0)

// cleanup temp artifacts
for (const f of pngsCreated) { if (fs.existsSync(f)) fs.unlinkSync(f) }
db.close()
for (const suffix of ['', '-wal', '-shm']) {
  const file = `${tempDb}${suffix}`
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

console.log(`\nالنتيجة: ${passed} ناجح، ${failed} فاشل`)
process.exit(failed > 0 ? 1 : 0)