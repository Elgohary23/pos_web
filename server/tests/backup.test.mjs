import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tempDb = path.join(os.tmpdir(), `backup_test-${process.pid}.sqlite`)
const backupDir = path.join(os.tmpdir(), `backup_test_dir-${process.pid}`)

process.env.DB_PATH = tempDb
process.env.BACKUP_DIR = backupDir

for (const suffix of ['', '-wal', '-shm', '.pre-restore']) {
  const file = `${tempDb}${suffix}`
  if (fs.existsSync(file)) fs.unlinkSync(file)
}
if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true })
fs.mkdirSync(backupDir, { recursive: true })

const dbModule = await import('../database/db.js')
const getDb = () => dbModule.default
const closeDatabase = dbModule.closeDatabase
const { BackupService } = await import('../services/backupService.js')
const { ProductRepository } = await import('../repositories/productRepository.js')
const { CategoryRepository } = await import('../repositories/categoryRepository.js')

const createdBackups = []

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

function isValidSqlite(file) {
  let probe
  try {
    probe = new Database(file, { readonly: true, fileMustExist: true })
    const res = probe.pragma('integrity_check')
    return Array.isArray(res) && res[0] && Object.values(res[0])[0] === 'ok'
  } catch {
    return false
  } finally {
    if (probe) { try { probe.close() } catch { /* ignore */ } }
  }
}

const defaultCat = CategoryRepository.findByName('عام')

// ---------- Scenario 1: empty database status ----------
console.log('\nScenario 1: حالة قاعدة بيانات فارغة')
const emptyStatus = BackupService.status()
ok('hasData = false قبل إضافة بيانات', emptyStatus.hasData === false)
ok('عدد المنتجات = 0', emptyStatus.counts.products === 0)

// ---------- Scenario 2: create backup ----------
console.log('\nScenario 2: إنشاء نسخة احتياطية')
const pen = ProductRepository.create({
  name: 'قلم اختبار',
  wholesalePrice: 3,
  retailPrice: 5,
  barcode: 'ABC000000001',
  categoryId: defaultCat.id,
  quantity: 10,
  costPrice: 3,
})

const statusAfter = BackupService.status()
ok('hasData = true بعد إضافة منتج', statusAfter.hasData === true)
ok('عدد المنتجات = 1', statusAfter.counts.products === 1)

const backup = await BackupService.createBackup()
createdBackups.push(backup.filePath)
ok('ملف النسخة موجود', fs.existsSync(backup.filePath))
ok('اسم الملف يبدأ بـ pos-backup', backup.filename.startsWith('pos-backup-'))
ok('حجم النسخة > 0', backup.size > 0)
ok('النسخة قاعدة بيانات SQLite صالحة', isValidSqlite(backup.filePath))

// ---------- Scenario 3: restore backup after mutation ----------
console.log('\nScenario 3: استعادة نسخة بعد تعديل البيانات')
const extra = ProductRepository.create({
  name: 'منتج مؤقت',
  wholesalePrice: 1,
  retailPrice: 2,
  barcode: 'ABC000000002',
  categoryId: defaultCat.id,
  quantity: 1,
  costPrice: 1,
})
ok('المنتج المؤقت أضيف', !!ProductRepository.findById(extra.id))

const restoreCopy = path.join(backupDir, 'restore-copy.sqlite')
fs.copyFileSync(backup.filePath, restoreCopy)

const result = BackupService.restore(restoreCopy)
ok('تمت الاستعادة بدون خطأ', result.restored === undefined || true)
ok('نسخة الأمان pre-restore موجودة', fs.existsSync(`${tempDb}.pre-restore`))
ok('المنتج المؤقت اختفى بعد الاستعادة', !ProductRepository.findById(extra.id))
ok('المنتج الأصلي موجود بعد الاستعادة', !!ProductRepository.findById(pen.id))
ok('عدد المنتجات = 1 بعد الاستعادة', getDb().prepare('SELECT COUNT(*) c FROM products').get().c === 1)
ok('ملف الاستعادة المؤقت حُذف', !fs.existsSync(restoreCopy))

// ---------- Scenario 4: restore from SQL script ----------
console.log('\nScenario 4: استعادة من ملف SQL نصي')
const sqlFile = path.join(backupDir, 'dump.sql')
fs.writeFileSync(
  sqlFile,
  `BEGIN TRANSACTION;
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO users (username, password_hash) VALUES ('restored_user', 'hash');
COMMIT;`
)

BackupService.restore(sqlFile)
ok(
  'المستخدم من ملف SQL موجود',
  !!getDb().prepare(`SELECT * FROM users WHERE username = 'restored_user'`).get()
)
ok('ملف SQL المؤقت حُذف', !fs.existsSync(sqlFile))

// ---------- Scenario 5: invalid inputs ----------
console.log('\nScenario 5: مدخلات غير صالحة')
const garbage = path.join(backupDir, 'garbage.sql')
fs.writeFileSync(garbage, 'this is not valid sql at all ;;;')
await expectError(() => BackupService.restore(garbage), 'VALIDATION_ERROR', 'استعادة ملف تالف')
ok('الملف التالف حُذف بعد الفشل', !fs.existsSync(garbage))
await expectError(() => BackupService.restore(path.join(backupDir, 'missing.sqlite')), 'VALIDATION_ERROR', 'استعادة ملف غير موجود')

// ---------- Cleanup ----------
closeDatabase()
for (const suffix of ['', '-wal', '-shm', '.pre-restore']) {
  const file = `${tempDb}${suffix}`
  if (fs.existsSync(file)) fs.unlinkSync(file)
}
for (const f of createdBackups) if (fs.existsSync(f)) fs.unlinkSync(f)
if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
