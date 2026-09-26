import fs from 'fs'
import os from 'os'
import path from 'path'

const tempDb = path.join(os.tmpdir(), `productLookup_test-${process.pid}.sqlite`)

process.env.DB_PATH = tempDb

for (const suffix of ['', '-wal', '-shm']) {
  const file = `${tempDb}${suffix}`
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

const { default: db } = await import('../database/db.js')
const { ProductService } = await import('../services/productService.js')
const { ProductRepository } = await import('../repositories/productRepository.js')
const { CategoryRepository } = await import('../repositories/categoryRepository.js')
const { BarcodeService } = await import('../services/barcodeService.js')
const { extractScanCode } = await import('../utils/scanCode.js')

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
    ok(`${label} -> [${err.code}] ${err.message}`, err.code === code)
  }
}
async function rejects(fn) {
  try {
    await fn()
    return false
  } catch {
    return true
  }
}

const cat = CategoryRepository.findByName('عام')
const drinks = CategoryRepository.getOrCreate('مشروبات')

const coffee = ProductRepository.create({
  name: 'قهوة سريعة',
  wholesalePrice: 20,
  retailPrice: 35,
  costPrice: 18,
  barcode: '065828401337',
  categoryId: cat.id,
  quantity: 12,
})
const tea = ProductRepository.create({
  name: 'شاي فتلة',
  wholesalePrice: 10,
  retailPrice: 15,
  costPrice: 9,
  barcode: '317297160722',
  categoryId: cat.id,
  quantity: 4,
})
// باركود قصير متداخل مع آخر، لاختبار أن المطابقة الدقيقة لا تخلط بينهما
const shortCode = ProductRepository.create({
  name: 'منتج بكود قصير',
  wholesalePrice: 5,
  retailPrice: 8,
  costPrice: 4,
  barcode: '28241',
  categoryId: cat.id,
  quantity: 2,
})
const prefixCode = ProductRepository.create({
  name: 'منتج بكود مطابق لبادئة',
  wholesalePrice: 6,
  retailPrice: 9,
  costPrice: 5,
  barcode: '2824111',
  categoryId: cat.id,
  quantity: 3,
})
// باركود سداسي عشر بأحرف كبيرة — نفس الشكل الذي يولّده التوريد
const hexProduct = ProductRepository.create({
  name: 'منتج باركود سداسي',
  wholesalePrice: 7,
  retailPrice: 11,
  costPrice: 6,
  barcode: '0658A1B2C3D4',
  categoryId: cat.id,
  quantity: 6,
})

// ---------- Scenario 1: مطابقة الباركود بالضبط ----------
console.log('\nScenario 1: البحث بالباركود بالضبط')
{
  const found = ProductService.list({ active: true, barcode: '065828401337' })
  ok('يرجع المنتج المطابق فقط', found.length === 1 && found[0].id === coffee.id)
  ok('الاسم صحيح', found[0]?.name === 'قهوة سريعة')
  ok('التصنيف مضمّن في النتيجة (category_name)', found[0]?.category_name === cat.name)
  ok('لا يخلط بين كود قصير وبادئة مطابقة له', ProductService.list({ active: true, barcode: '28241' }).length === 1
    && ProductService.list({ active: true, barcode: '28241' })[0].id === shortCode.id)
  ok('البحث الجزئي (q) يخلط الكودين القصير والبادئة', ProductService.list({ active: true, q: '28241' }).length === 2)
  ok('كود غير موجود يرجع قائمة فارغة', ProductService.list({ active: true, barcode: 'NOPE123' }).length === 0)
  ok('مطابقة الباركود السداسي عشر بأحرف كبيرة',
    ProductService.list({ active: true, barcode: '0658A1B2C3D4' })[0]?.id === hexProduct.id)
  ok('مطابقة الباركود السداسي عشر بأحرف صغيرة (NOCASE)',
    ProductService.list({ active: true, barcode: '0658a1b2c3d4' })[0]?.id === hexProduct.id)
}

// ---------- Scenario 2: البحث النصي الجزئي بالاسم أو الباركود ----------
console.log('\nScenario 2: البحث بالاسم أو الباركود (q)')
{
  ok('بحث جزئي بالاسم', ProductService.list({ active: true, q: 'قهوة' }).length === 1)
  ok('بحث جزئي بالاسم存在的问题 (شاي يطابق شاي)', ProductService.list({ active: true, q: 'شاي' }).some((p) => p.id === tea.id))
  ok('بحث جزئي بالباركود', ProductService.list({ active: true, q: '3172971' }).some((p) => p.id === tea.id))
  ok('البحث الجزئي غير حساس لحالة الأحرف في الباركود السداسي',
    ProductService.list({ active: true, q: 'a1b2c3' }).some((p) => p.id === hexProduct.id)
    && ProductService.list({ active: true, q: 'A1B2C3' }).some((p) => p.id === hexProduct.id))
  ok('بحث بدون نتائج', ProductService.list({ active: true, q: 'لاشيءمطلقا' }).length === 0)
  ok('يبدّل بين الباركود والاسم في نفس الفلتر', ProductService.list({ active: true, q: 'منتج' }).length === 3)
}

// ---------- Scenario 3: دمج الفلاتر ----------
console.log('\nScenario 3: دمج الفلاتر معًا')
{
  ok('active + barcode', ProductService.list({ active: true, barcode: '065828401337' }).length === 1)
  ok('active + q + limit', ProductService.list({ active: true, q: 'منتج', limit: 1 }).length === 1)
  ok('barcode + categoryId متوافقان', ProductService.list({ barcode: '065828401337', categoryId: cat.id }).length === 1)
  ok('barcode + categoryId غير متوافق', ProductService.list({ barcode: '065828401337', categoryId: drinks.id }).length === 0)
  ProductRepository.updateStockAndPrices(prefixCode.id, { quantity: 0, costPrice: 5 })
  db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(prefixCode.id)
  ok('المنتج غير النشط يُستبعد مع active=1',
    !ProductService.list({ active: true, q: '2824111' }).some((p) => p.id === prefixCode.id))
  ok('المنتج غير النشط يظهر بدون active', ProductService.list({ q: '2824111' }).some((p) => p.id === prefixCode.id))
  db.prepare('UPDATE products SET is_active = 1 WHERE id = ?').run(prefixCode.id)
}

// ---------- Scenario 4: التحقق من المدخلات ----------
console.log('\nScenario 4: التحقق من مدخلات الفلتر')
{
  ok('باركود فارغ = لا فلتر', ProductService.list({ active: true, barcode: '   ' }).length === 5)
  ok('باركود undefined = لا فلتر', ProductService.list({ active: true }).length === 5)
  ok('باركود بطول 64 مقبول', ProductService.list({ active: true, barcode: 'a'.repeat(64) }).length === 0)
  await expectError(() => ProductService.list({ barcode: 'a'.repeat(65) }), 'VALIDATION_ERROR', 'باركود أطول من 64')
  await expectError(() => ProductService.list({ barcode: 'AB\t12' }), 'VALIDATION_ERROR', 'باركود برموز تحكم')
}

// ---------- Scenario 5: الروابط القادمة من كاميرا الموبايل ----------
// QR المطبوع يحمل رابطًا كاملًا، فيصل الكود إلى الفلتر كـ URL لا كود خام.
console.log('\nScenario 5: تحويل روابط الماسح إلى كود منتج')
{
  const cases = [
    ['كود خام', '065828401337', '065828401337'],
    ['رابط deep link', 'http://192.168.1.5:3000/l/065828401337', '065828401337'],
    ['رابط deep link بدون http', '192.168.1.5:3000/l/28241', ''],
    ['رابط مع كود مشفّر', 'http://10.0.0.4:3000/l/0658A1B2C3D4', '0658A1B2C3D4'],
    ['رابط مع مسار بعد الكود', 'http://10.0.0.4:3000/l/28241/xyz', '28241'],
    ['رابط بصيغة الاستعلام', 'http://10.0.0.4:3000/l?code=317297160722', '317297160722'],
    ['رابط بصيغة الاستعلام (barcode)', 'http://10.0.0.4:3000/?barcode=28241', '28241'],
    ['مخطط مخصص', 'kasabi://product/28241', '28241'],
    ['رابط خارجي غير متعلق بنا', 'https://example.com/some/page', 'page'],
    ['نص عربي', 'منتج', ''],
    ['فارغ', '   ', ''],
    ['null', null, ''],
  ]
  for (const [label, input, expected] of cases) {
    ok(`extractScanCode(${label}) = ${JSON.stringify(expected)}`, extractScanCode(input) === expected)
  }

  ok('الرابط يطابق نفس المنتج مثل الكود الخام',
    ProductService.list({ active: true, barcode: 'http://192.168.1.5:3000/l/065828401337' })[0]?.id === coffee.id)
  ok('رابط deep link بكود مشفّر يلاقي منتج الكود',
    ProductService.list({ active: true, barcode: 'http://10.0.0.4:3000/l/0658A1B2C3D4' })[0]?.id === hexProduct.id)
  ok('رابط برمز تحكم يُرفض كفلتر',
    await rejects(() => ProductService.list({ barcode: 'http://10.0.0.4:3000/l/AB\t12' })))
  ok('رابط طويل جدًا يُرفض كفلتر',
    await rejects(() => ProductService.list({ barcode: `http://10.0.0.4/l/${'a'.repeat(3000)}` })))

  ok('deepLink يبني رابط صحيح', BarcodeService.deepLink('065828401337', 'http://192.168.1.5:3000')
    === 'http://192.168.1.5:3000/l/065828401337')
  ok('deepLink يتجاهل الشرطة الأخيرة', BarcodeService.deepLink('28241', 'http://192.168.1.5:3000/')
    === 'http://192.168.1.5:3000/l/28241')
  ok('deepLink بدون أصل يرجع نص فاضي', BarcodeService.deepLink('28241', '') === '')
}

// ---------- Scenario 6: البحث لا يعدّل البيانات ----------
console.log('\nScenario 6: البحث للقراءة فقط')
{
  const before = ProductService.list({}).map((p) => `${p.id}:${p.quantity}`).sort().join('|')
  ProductService.list({ active: true, barcode: '065828401337' })
  ProductService.list({ active: true, barcode: 'http://192.168.1.5:3000/l/065828401337' })
  ProductService.list({ active: true, q: 'منتج' })
  const after = ProductService.list({}).map((p) => `${p.id}:${p.quantity}`).sort().join('|')
  ok('لا يغيّر الكميات', before === after)
}

db.close()
for (const suffix of ['', '-wal', '-shm']) {
  const file = `${tempDb}${suffix}`
  if (fs.existsSync(file)) fs.unlinkSync(file)
}
console.log(`\nالنتيجة: ${passed} ناجح، ${failed} فاشل`)
process.exit(failed > 0 ? 1 : 0)
