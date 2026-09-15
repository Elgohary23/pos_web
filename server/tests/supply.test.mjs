import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const barcodesDir = path.join(__dirname, '..', 'public', 'barcodes')
const tempDb = path.join(os.tmpdir(), `supply_test-${process.pid}.sqlite`)

process.env.DB_PATH = tempDb

for (const suffix of ['', '-wal', '-shm']) {
  const file = `${tempDb}${suffix}`
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

const { default: db } = await import('../database/db.js')
const { SupplyService } = await import('../services/supplyService.js')
const { ProductRepository } = await import('../repositories/productRepository.js')
const { CategoryRepository } = await import('../repositories/categoryRepository.js')
const { round2 } = await import('../utils/money.js')
const { requirePermission } = await import('../middleware/permission.js')

const pngsCreated = []

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

const admin = { id: 1, username: 'admin' }
const defaultCat = CategoryRepository.findByName('عام')

// ---------- Scenario 1: supply with existing + new product + shipping ----------
console.log('\nScenario 1: توريد مختلط')
const pen = ProductRepository.create({ name: 'قلم جاف', wholesalePrice: 3, retailPrice: 5, barcode: '100000000001', categoryId: defaultCat.id, quantity: 0, costPrice: 3 })
const beforePenQty = Number(pen.quantity)

const res1 = await SupplyService.createSupplyInvoice({
  kind: 'supply',
  supplier_name: 'مكتبة النور',
  shipping_cost: 20,
  notes: 'شحنة سبتمبر',
  items: [
    { name: 'قلم جاف', unit_cost: 3, quantity: 50, category_name: 'أدوات مكتبية' },
    { name: 'دفتر 100 ورقة', unit_cost: 8, retail_price: 15, quantity: 30, category_name: 'كتب ودفاتر' },
  ],
}, admin)

ok('الإجمالي = 410.00', res1.total === 410)
ok('invoice_id صحيح', Number.isInteger(res1.invoice_id) && res1.invoice_id > 0)
ok('kind = supply', res1.kind === 'supply')
ok('منتج جديد واحد', res1.new_products.length === 1)
const newDefter = res1.new_products[0]
ok('باركود 12 HEX', /^[0-9A-F]{12}$/.test(newDefter.barcode))
const pngPath = path.join(barcodesDir, `${newDefter.barcode}.png`)
ok('صورة الباركود موجودة بعد الـ commit', fs.existsSync(pngPath))
pngsCreated.push(pngPath)
const defterRow = ProductRepository.findById(newDefter.product_id)
ok('سعر بيع الدفتر = 15.00', defterRow.retail_price === 15)
ok('تكلفة الدفتر = 8.00', defterRow.cost_price === 8)
ok('مخزون قلم جاف زاد 50', Number(ProductRepository.findById(pen.id).quantity) === Number(beforePenQty) + 50)
ok('مورد أنشئ', !!db.prepare(`SELECT * FROM suppliers WHERE name = 'مكتبة النور'`).get())
const header = db.prepare('SELECT * FROM supply_invoices WHERE invoice_id = ?').get(res1.invoice_id)
ok('رأس الفاتورة محفوظ', header && header.supplier_id && header.total_amount === 410)
ok('بندان محفوظان', db.prepare('SELECT COUNT(*) c FROM supply_invoice_items WHERE invoice_id = ?').get(res1.invoice_id).c === 2)
ok('Audit SUPPLY_SUPPLY', !!db.prepare(`SELECT 1 FROM audit_log WHERE entity_id = ? AND action = 'SUPPLY_SUPPLY'`).get(res1.invoice_id))

// ---------- Scenario 2: cost overwrite ----------
console.log('\nScenario 2: تحديث سعر التكلفة')
const avg = ProductRepository.create({ name: 'دفتر متوسط', wholesalePrice: 5, retailPrice: 9, barcode: '100000000002', categoryId: defaultCat.id, quantity: 10, costPrice: 5 })
await SupplyService.createSupplyInvoice({ kind: 'supply', items: [{ name: 'دفتر متوسط', unit_cost: 7, quantity: 10 }] }, admin)
const avgRow = ProductRepository.findById(avg.id)
ok('التكلفة الجديدة = 7.00', Number(avgRow.cost_price) === 7 && Number(avgRow.quantity) === 20)

// ---------- Scenario 3: return more than stock → rollback ----------
console.log('\nScenario 3: مرتجع كمية أكبر من المخزون')
const invBefore = db.prepare('SELECT COUNT(*) c FROM supply_invoices').get().c
const auditBefore = db.prepare('SELECT COUNT(*) c FROM audit_log').get().c
const qtyBefore = Number(ProductRepository.findById(pen.id).quantity)
let err3 = null
try { await SupplyService.createSupplyInvoice({ kind: 'return', items: [{ name: 'قلم جاف', unit_cost: 3, quantity: 9999 }] }, admin) }
catch (e) { err3 = e }
ok('خطأ INSUFFICIENT_STOCK', err3?.code === 'INSUFFICIENT_STOCK')
ok('رسالة واضحة', err3 && /غير كافٍ/.test(err3.message))
ok('لا فاتورة جديدة (rollback)', db.prepare('SELECT COUNT(*) c FROM supply_invoices').get().c === invBefore)
ok('الكمية لم تتغير', Number(ProductRepository.findById(pen.id).quantity) === qtyBefore)
ok('لا Audit جديد', db.prepare('SELECT COUNT(*) c FROM audit_log').get().c === auditBefore)

// ---------- Scenario 4: return service ----------
console.log('\nScenario 4: مرتجع خدمة')
db.prepare(`INSERT INTO products (name, wholesale_price, retail_price, cost_price, barcode, category_id, quantity, is_service) VALUES ('استشارة فنية', 0, 50, 0, '100000000003', ?, 5, 1)`).run(defaultCat.id)
expectError(async () => SupplyService.createSupplyInvoice({ kind: 'return', items: [{ name: 'استشارة فنية', unit_cost: 0, quantity: 1 }] }, admin), 'BUSINESS_RULE', 'مرتجع خدمة')

// ---------- Scenario 5: empty items ----------
console.log('\nScenario 5: فاتورة بدون بنود')
expectError(async () => SupplyService.createSupplyInvoice({ kind: 'supply', items: [] }, admin), 'VALIDATION_ERROR', 'بنود فارغة')
expectError(async () => SupplyService.createSupplyInvoice({ kind: 'supply' }, admin), 'VALIDATION_ERROR', 'لا بنود')

// ---------- Other validation ----------
console.log('\nScenario 6: تحققات إضافية')
expectError(async () => SupplyService.createSupplyInvoice({ kind: 'discount', items: [{ name: 'x', unit_cost: 1, quantity: 1 }] }, admin), 'VALIDATION_ERROR', 'نوع غير صالح')
expectError(async () => SupplyService.createSupplyInvoice({ kind: 'supply', items: [{ name: 'x', unit_cost: -5, quantity: 1 }] }, admin), 'VALIDATION_ERROR', 'تكلفة سالبة')
expectError(async () => SupplyService.createSupplyInvoice({ kind: 'supply', items: [{ name: 'x', unit_cost: 1, quantity: 0 }] }, admin), 'VALIDATION_ERROR', 'كمية صفر')
expectError(async () => SupplyService.createSupplyInvoice({ kind: 'supply', items: [{ name: 'x', unit_cost: 1, quantity: 1.5 }] }, admin), 'VALIDATION_ERROR', 'كمية كسرية')
expectError(async () => SupplyService.createSupplyInvoice({ kind: 'return', items: [{ name: 'منتج غير موجود', unit_cost: 1, quantity: 1 }] }, admin), 'VALIDATION_ERROR', 'مرتجع منتج غير موجود')
expectError(async () => SupplyService.createSupplyInvoice({ kind: 'supply', shipping_cost: -10, items: [{ name: 'x', unit_cost: 1, quantity: 1 }] }, admin), 'VALIDATION_ERROR', 'شحن سالب')
expectError(async () => SupplyService.createSupplyInvoice({ kind: 'supply', items: [{ name: 'منتج جديد بلا سعر بيع', unit_cost: 5, quantity: 1 }] }, admin), 'VALIDATION_ERROR', 'منتج جديد بدون سعر بيع')
expectError(async () => SupplyService.createSupplyInvoice({ kind: 'supply', items: [{ name: 'x', unit_cost: 5, retail_price: -10, quantity: 1 }] }, admin), 'VALIDATION_ERROR', 'سعر بيع سالب')

// ---------- Scenario 7: new supplier auto-created ----------
console.log('\nScenario 7: مورد جديد تلقائي')
const res7 = await SupplyService.createSupplyInvoice({ kind: 'supply', supplier_name: 'مورد جديد تلقائي', items: [{ name: 'قلم جاف', unit_cost: 3, quantity: 5 }] }, admin)
const sup7 = db.prepare(`SELECT * FROM suppliers WHERE name = 'مورد جديد تلقائي'`).get()
ok('مورد أنشئ وارتبط', !!sup7 && db.prepare('SELECT supplier_id FROM supply_invoices WHERE invoice_id = ?').get(res7.invoice_id).supplier_id === sup7.supplier_id)

// ---------- Scenario 8: two sequential supplies, no data race ----------
console.log('\nScenario 8: توريدان متتاليان لنفس المنتج')
const seq = ProductRepository.create({ name: 'منتج متتابع', wholesalePrice: 2, retailPrice: 4, barcode: '100000000004', categoryId: defaultCat.id, quantity: 0, costPrice: 2 })
await SupplyService.createSupplyInvoice({ kind: 'supply', items: [{ name: 'منتج متتابع', unit_cost: 2, quantity: 5 }] }, admin)
await SupplyService.createSupplyInvoice({ kind: 'supply', items: [{ name: 'منتج متتابع', unit_cost: 3, quantity: 7 }] }, admin)
const seqRow = ProductRepository.findById(seq.id)
ok('الكمية = 12', Number(seqRow.quantity) === 12)
ok('التكلفة = 3.00', Number(seqRow.cost_price) === 3)

// ---------- Scenario 9: float safety ----------
console.log('\nScenario 9: دقة الأرقام')
ok('0.1 + 0.2 = 0.3', round2(0.1 + 0.2) === 0.3)
const penQtyBeforeReturn = Number(ProductRepository.findById(pen.id).quantity)
const res9 = await SupplyService.createSupplyInvoice({ kind: 'return', items: [{ name: 'قلم جاف', unit_cost: 3, quantity: 2 }] }, admin)
ok('إجمالي المرتجع سالب', res9.total === -6)
ok('new_products = [] في المرتجع', Array.isArray(res9.new_products) && res9.new_products.length === 0)
ok('Audit SUPPLY_RETURN', !!db.prepare(`SELECT 1 FROM audit_log WHERE entity_id = ? AND action = 'SUPPLY_RETURN'`).get(res9.invoice_id))
ok('المخزون نقص', Number(ProductRepository.findById(pen.id).quantity) === penQtyBeforeReturn - 2)

// ---------- Scenario 10: permission denied ----------
console.log('\nScenario 10: صلاحية مرفوضة')
const viewerId = Number(db.prepare(`INSERT INTO users (username, password_hash, role, name) VALUES ('viewer_perm', 'x', 'viewer', 'مشاهد')`).run().lastInsertRowid)
const auditBeforePerm = db.prepare('SELECT COUNT(*) c FROM audit_log').get().c
let permErr = null
const fakeRes = { status(c) { this.statusCode = c; return this }, json() { return this } }
const fakeNext = (e) => { permErr = e }
requirePermission('CREATE_SUPPLY_INVOICE')({ session: { userId: viewerId } }, fakeRes, fakeNext)
ok('403 FORBIDDEN', permErr && permErr.status === 403 && permErr.code === 'FORBIDDEN')
ok('audit PERMISSION_DENIED', db.prepare(`SELECT 1 FROM audit_log WHERE action = 'PERMISSION_DENIED' AND user_id = ?`).get(viewerId) && db.prepare('SELECT COUNT(*) c FROM audit_log').get().c === auditBeforePerm + 1)

// cleanup temp artifacts
for (const f of pngsCreated) { if (fs.existsSync(f)) fs.unlinkSync(f) }
db.close()
for (const suffix of ['', '-wal', '-shm']) {
  const file = `${tempDb}${suffix}`
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

console.log(`\nالنتيجة: ${passed} ناجح، ${failed} فاشل`)
process.exit(failed > 0 ? 1 : 0)