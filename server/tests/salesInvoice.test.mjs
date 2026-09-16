import fs from 'fs'
import os from 'os'
import path from 'path'

const tempDb = path.join(os.tmpdir(), `sales_test-${process.pid }.sqlite`)

process.env.DB_PATH = tempDb

for (const suffix of ['', '-wal', '-shm']) {
  const file = `${tempDb}${suffix}`
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

const { default: db } = await import('../database/db.js')
const { SalesInvoiceService } = await import('../services/salesInvoiceService.js')
const { SalesInvoiceRepository } = await import('../repositories/salesInvoiceRepository.js')
const { CustomerRepository } = await import('../repositories/customerRepository.js')
const { ProductRepository } = await import('../repositories/productRepository.js')
const { SupplyService } = await import('../services/supplyService.js')
const { TransactionLogService } = await import('../services/transactionLogService.js')
const { round2 } = await import('../utils/money.js')

let passed = 0
let failed = 0
function ok(name, cond) {
  if (cond) { passed += 1; console.log(`  ✔ ${name}`) }
  else { failed += 1; console.error(`  ✘ ${name}`) }
}
async function expectError(fn, code, label) {
  try {
    await fn()
    console.error(`  ✘ ${label} — لم يحدث خطأ`)
    failed += 1
  } catch (err) {
    const okCode = err.code === code
    ok(`${label} -> [${err.code}] ${err.message}`, okCode)
  }
}

const admin = { id: 1, username: 'admin', role: 'admin' }
db.prepare(
  `INSERT INTO users (username, password_hash, role, name, shift_start, shift_end) VALUES (?, ?, 'employee', 'موظف معملي', '09:00', '17:00')`
).run('emp', 'x')
const employee = db.prepare("SELECT id, username, role, name FROM users WHERE username = 'emp'").get()

const defaultCat = db.prepare("SELECT id FROM categories WHERE name = 'عام'").get()

// ---------- Scenario 1: create products with stock via supply ----------
console.log('\nScenario 1: تجهيز مخزون')
await SupplyService.createSupplyInvoice({
  kind: 'supply',
  items: [
    { name: 'كتاب الرياضيات', unit_cost: 20, retail_price: 35, quantity: 50 },
    { name: 'دفتر سلك', unit_cost: 8, retail_price: 15, quantity: 100 },
    { name: 'قلم حبر', unit_cost: 3, retail_price: 7, quantity: 200 },
  ],
}, admin)

const book = ProductRepository.findByName('كتاب الرياضيات')
const notebook = ProductRepository.findByName('دفتر سلك')
const pen = ProductRepository.findByName('قلم حبر')
const service = ProductRepository.create({
  name: 'استشارة دراسية',
  wholesalePrice: 0,
  retailPrice: 50,
  costPrice: 0,
  categoryId: defaultCat.id,
  quantity: 0,
  barcode: '999999999999',
})
db.prepare("UPDATE products SET is_service = 1 WHERE id = ?").run(service.id)

ok('مخزون الكتاب = 50', Number(ProductRepository.findById(book.id).quantity) === 50)
ok('مخزون الدفتر = 100', Number(ProductRepository.findById(notebook.id).quantity) === 100)

// ---------- Scenario 2: basic sale with variable discount ----------
console.log('\nScenario 2: بيع بخصم متغير')
const res = SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  customer_name: 'أحمد محمد',
  customer_phone: '01000000000',
  discount_type: 'variable',
  discount_percent: 10,
  paid_amount: 60,
  items: [
    { product_id: book.id, quantity: 2 },
    { product_id: notebook.id, quantity: 3 },
  ],
}, admin)

ok('invoice_id صحيح', Number.isInteger(res.invoice_id) && res.invoice_id > 0)
ok('إجمالي قبل الخصم = 115', res.total_before_discount === 115)
ok('قيمة الخصم = 11.5', res.discount_value === 11.5)
ok('إجمالي بعد الخصم = 103.5', res.total_after_discount === 103.5)
ok('المدفوع = 60', res.paid_amount === 60)
ok('المتبقي = 43.5', res.remaining_amount === 43.5)

// ---------- Scenario 3: stock deducted ----------
console.log('\nScenario 3: خصم المخزون')
ok('مخزون الكتاب نقص لـ 48', Number(ProductRepository.findById(book.id).quantity) === 48)
ok('مخزون الدفتر نقص لـ 97', Number(ProductRepository.findById(notebook.id).quantity) === 97)

// ---------- Scenario 4: items snapshot ----------
console.log('\nScenario 4: التقاط الأسعار')
const items = SalesInvoiceRepository.findItemsByInvoiceId(res.invoice_id)
ok('بندان محفوظان', items.length === 2)
const bookLine = items.find((i) => i.product_id === book.id)
ok('original_price = 35', Number(bookLine.original_price) === 35)
ok('unit_price = 35 (بدون تعديل)', Number(bookLine.unit_price) === 35)
ok('cost_price_at_sale = 20', Number(bookLine.cost_price_at_sale) === 20)
ok('line_total = 70', Number(bookLine.line_total) === 70)
ok('product_name snapshot = كتاب الرياضيات', bookLine.product_name === 'كتاب الرياضيات')

// ---------- Scenario 5: едит price override ----------
console.log('\nScenario 5: تعديل سعر الوحدة يدويًا')
const res5 = SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  items: [
    { product_id: pen.id, quantity: 5, unit_price: 6 },
  ],
}, admin)
const penLine = SalesInvoiceRepository.findItemsByInvoiceId(res5.invoice_id)
ok('unit_price = 6 (تعديل)', Number(penLine[0].unit_price) === 6)
ok('original_price = 7', Number(penLine[0].original_price) === 7)
ok('line_total = 30', Number(penLine[0].line_total) === 30)
ok('المخزون نقص لـ 195', Number(ProductRepository.findById(pen.id).quantity) === 195)

// ---------- Scenario 6: service sale (no stock deduction) ----------
console.log('\nScenario 6: بيع خدمة — لا خصم مخزون')
const svcQtyBefore = Number(ProductRepository.findById(service.id).quantity)
SalesInvoiceService.createSaleInvoice({
  invoice_type: 'service_sale',
  customer_name: 'سارة',
  items: [{ product_id: service.id, quantity: 1 }],
}, admin)
ok('مخزون الخدمة لم يتغير', Number(ProductRepository.findById(service.id).quantity) === svcQtyBefore)

// ---------- Scenario 7: insufficient stock ----------
console.log('\nScenario 7: مخزون غير كافٍ')
const invBefore = db.prepare('SELECT COUNT(*) c FROM sales_invoices').get().c
expectError(async () => SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  items: [{ product_id: book.id, quantity: 9999 }],
}, admin), 'INSUFFICIENT_STOCK', 'كمية أكبر من المخزون')
ok('لا فاتورة جديدة (rollback)', db.prepare('SELECT COUNT(*) c FROM sales_invoices').get().c === invBefore)
ok('المخزون لم يتغير', Number(ProductRepository.findById(book.id).quantity) === 48)

// ---------- Scenario 8: employee variable discount requires name + notes ----------
console.log('\nScenario 8: قيد الموظف على الخصم المتغير')
expectError(async () => SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  discount_type: 'variable',
  discount_percent: 5,
  items: [{ product_id: pen.id, quantity: 1 }],
}, employee), 'VALIDATION_ERROR', 'موظف بخصم متغير بدون اسم عميل')
expectError(async () => SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  customer_name: 'عميل',
  discount_type: 'variable',
  discount_percent: 5,
  items: [{ product_id: pen.id, quantity: 1 }],
}, employee), 'VALIDATION_ERROR', 'موظف بخصم متغير بدون ملاحظات')
ok('موظف بخصم متغير مع الاسم والملاحظات ينجح', (() => {
  try {
    SalesInvoiceService.createSaleInvoice({
      invoice_type: 'product_sale',
      customer_name: 'عميل محدد',
      discount_type: 'variable',
      discount_percent: 5,
      notes: 'خصم بمناسبة العرض',
      items: [{ product_id: pen.id, quantity: 1 }],
    }, employee)
    return true
  } catch { return false }
})())
ok('موظف بدون خصم متغير لا يحتاج اسم/ملاحظات', (() => {
  try {
    SalesInvoiceService.createSaleInvoice({
      invoice_type: 'product_sale',
      items: [{ product_id: pen.id, quantity: 1 }],
    }, employee)
    return true
  } catch { return false }
})())

// ---------- Scenario 9: free invoice ----------
console.log('\nScenario 9: فاتورة مجانية')
const res9 = SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  customer_name: 'عميل VIP',
  discount_type: 'free',
  items: [{ product_id: notebook.id, quantity: 1 }],
}, admin)
ok('discount_percent = 100', res9.discount_percent === 100)
ok('إجمالي بعد الخصم = 0', res9.total_after_discount === 0)
ok('المتبقي = 0', res9.remaining_amount === 0)

// ---------- Scenario 9b: employee cannot create free invoice ----------
console.log('\nScenario 9b: منع الموظف من الفاتورة المجانية')
await expectError(async () => SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  customer_name: 'عميل',
  discount_type: 'free',
  items: [{ product_id: pen.id, quantity: 1 }],
}, employee), 'VALIDATION_ERROR', 'موظف يحاول إنشاء فاتورة مجانية')

// ---------- Scenario 9c: fixed discount ----------
console.log('\nScenario 9c: خصم قيمة ثابتة')
const res9c = SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  discount_type: 'fixed',
  discount_value: 5,
  items: [{ product_id: pen.id, quantity: 2 }],
}, admin)
ok('إجمالي قبل الخصم = 14', res9c.total_before_discount === 14)
ok('قيمة الخصم = 5', res9c.discount_value === 5)
ok('إجمالي بعد الخصم = 9', res9c.total_after_discount === 9)
ok('discount_percent = 0 (fixed لا نسبة)', res9c.discount_percent === 0)

// ---------- Scenario 9c-employee: fixed discount restriction for employee ----------
console.log('\nScenario 9c-employee: قيد الموظف على خصم القيمة')
await expectError(async () => SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  discount_type: 'fixed',
  discount_value: 2,
  items: [{ product_id: pen.id, quantity: 1 }],
}, employee), 'VALIDATION_ERROR', 'موظف بخصم قيمة بدون اسم عميل')
await expectError(async () => SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  customer_name: 'عميل نقدي',
  discount_type: 'fixed',
  discount_value: 2,
  items: [{ product_id: pen.id, quantity: 1 }],
}, employee), 'VALIDATION_ERROR', 'موظف بخصم قيمة بدون ملاحظات')
const res9cEmp = SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  customer_name: 'عميل نقدي',
  discount_type: 'fixed',
  discount_value: 2,
  notes: 'خصم نقدي',
  items: [{ product_id: pen.id, quantity: 1 }],
}, employee)
ok('موظف يستخدم خصم قيمة بالاسم والملاحظات', res9cEmp.discount_value === 2)
ok('إجمالي بعد الخصم = 5', res9cEmp.total_after_discount === 5)

// ---------- Scenario 9d: fixed discount exceeds total ----------
console.log('\nScenario 9d: قيمة خصم أكبر من الإجمالي')
await expectError(async () => SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  discount_type: 'fixed',
  discount_value: 9999,
  items: [{ product_id: pen.id, quantity: 1 }],
}, admin), 'VALIDATION_ERROR', 'قيمة خصم أكبر من الإجمالي')

// ---------- Scenario 10: cash sale without customer ----------
console.log('\nScenario 10: بيع نقدي بدون عميل')
const res10 = SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  items: [{ product_id: pen.id, quantity: 1 }],
}, admin)
const h10 = SalesInvoiceRepository.findById(res10.invoice_id)
ok('customer_id = NULL', h10.customer_id === null)
ok('discount_type = none', h10.discount_type === 'none')

// ---------- Scenario 11: customer auto-create ----------
console.log('\nScenario 11: إنشاء عميل تلقائي')
const cus = CustomerRepository.getOrCreate('محمد أحمد', '01111111111')
ok('عميل أنشئ', cus.customer_id > 0)
const cus2 = CustomerRepository.getOrCreate('محمد أحمد', '01111111111')
ok('عميل موجود يُعاد استخدامه', cus2.customer_id === cus.customer_id)

// ---------- Scenario 12: validation ----------
console.log('\nScenario 12: تحققات')
expectError(async () => SalesInvoiceService.createSaleInvoice({ invoice_type: 'bad', items: [{ product_id: book.id, quantity: 1 }] }, admin), 'VALIDATION_ERROR', 'نوع فاتورة غير صالح')
expectError(async () => SalesInvoiceService.createSaleInvoice({ invoice_type: 'product_sale', items: [] }, admin), 'VALIDATION_ERROR', 'بنود فارغة')
expectError(async () => SalesInvoiceService.createSaleInvoice({ invoice_type: 'product_sale', items: [{ product_id: book.id, quantity: 0 }] }, admin), 'VALIDATION_ERROR', 'كمية صفر')
expectError(async () => SalesInvoiceService.createSaleInvoice({ invoice_type: 'product_sale', items: [{ product_id: book.id, quantity: 1.5 }] }, admin), 'VALIDATION_ERROR', 'كمية كسرية')
expectError(async () => SalesInvoiceService.createSaleInvoice({ invoice_type: 'product_sale', items: [{ product_id: 99999, quantity: 1 }] }, admin), 'VALIDATION_ERROR', 'منتج غير موجود')
expectError(async () => SalesInvoiceService.createSaleInvoice({ invoice_type: 'product_sale', discount_type: 'custom', items: [{ product_id: book.id, quantity: 1 }] }, admin), 'VALIDATION_ERROR', 'نوع خصم غير صالح')
expectError(async () => SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  paid_amount: 99999,
  items: [{ product_id: book.id, quantity: 1 }],
}, admin), 'VALIDATION_ERROR', 'مدفوع أكبر من الإجمالي')

// ---------- Scenario 13: float precision ----------
console.log('\nScenario 13: دقة الأرقام')
ok('0.1 + 0.2 = 0.3', round2(0.1 + 0.2) === 0.3)

// ---------- Scenario 14: transaction log integration ----------
console.log('\nScenario 14: ظهور فاتورة البيع في سجل المعاملات')
SalesInvoiceService.createSaleInvoice({
  invoice_type: 'product_sale',
  customer_name: 'عميل شيفت',
  items: [{ product_id: pen.id, quantity: 1 }],
}, employee)

const todayLocal = new Date()
const dateStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`

const log = TransactionLogService.getDailyTransactions(dateStr)
ok('الملخص يتضمن مبيعات', typeof log.summary.sale_count === 'number')
ok('بها فواتير بيع', log.summary.sale_count >= 6)
const allBlocks = [
  ...log.shift_view.groups.flatMap((g) => g.invoices),
  ...log.shift_view.no_shift.invoices,
  ...log.shift_view.out_of_hours.invoices,
]
ok('فواتير البيع تظهر في سجل الشيفت', allBlocks.filter((i) => i.kind === 'sale').length >= 2)
const saleInNoShift = log.shift_view.no_shift.invoices.some((i) => i.kind === 'sale')
ok('تظهر ضمن بدون شيفت (admin)', saleInNoShift)
ok('shift_aggregate إجمالي موجود', typeof log.shift_aggregate === 'number')

// ---------- Scenario 15: invoice details ----------
console.log('\nScenario 15: تفاصيل فاتورة البيع')
const details = TransactionLogService.getInvoiceDetails(res10.invoice_id)
ok('kind = sale', details.invoice.kind === 'sale')
ok('status موجود', details.invoice.status === 'completed')
ok('total_after_discount = 7', details.invoice.total_after_discount === 7)
ok('discount_value محسوب', Number.isFinite(details.invoice.discount_value))
ok('البند يحمل unit_price', details.items[0].unit_price === 7)
ok('البند يحمل cost_price_at_sale', Number.isFinite(details.items[0].cost_price_at_sale))

// cleanup generated barcode pngs
try {
  const pngDir = path.join(path.dirname(tempDb), '..', 'POS_WEB', 'server', 'public', 'barcodes')
  if (fs.existsSync(pngDir)) {
    for (const f of fs.readdirSync(pngDir)) fs.unlinkSync(path.join(pngDir, f))
  }
} catch { /* ignore */ }

db.close()

for (const suffix of ['', '-wal', '-shm']) {
  const file = `${tempDb}${suffix}`
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

console.log(`\nالنتيجة: ${passed} ناجح، ${failed} فاشل`)
process.exit(failed === 0 ? 0 : 1)