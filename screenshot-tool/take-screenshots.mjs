import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const PAGES = [
  { path: '/login', name: 'login' },
  { path: '/', name: 'home' },
  { path: '/supply-invoice', name: 'supply-invoice' },
  { path: '/employees', name: 'employees' },
  { path: '/categories', name: 'categories' },
  { path: '/products', name: 'products' },
]

const VIEWPORTS = {
  mobile: { width: 375, height: 812, deviceScaleFactor: 2 },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 2 },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2 },
}

const DEFAULT_CREDS = { username: 'admin', password: 'admin' }

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    baseUrl: 'http://localhost:5173',
    outputDir: path.join(os.homedir(), 'Downloads', 'screenshots'),
    viewports: Object.keys(VIEWPORTS),
    username: DEFAULT_CREDS.username,
    password: DEFAULT_CREDS.password,
    fullPage: true,
    timeout: 30000,
  }

  const set = (flag, apply) => {
    const i = args.indexOf(flag)
    if (i !== -1 && args[i + 1] !== undefined) apply(args[i + 1])
  }

  set('--url', (v) => (opts.baseUrl = v.replace(/\/$/, '')))
  set('--pages', (v) => (opts.pages = v.split(',').map((p) => p.trim()).filter(Boolean)))
  set('--viewports', (v) => (opts.viewports = v.split(',').map((p) => p.trim()).filter(Boolean)))
  set('--output', (v) => (opts.outputDir = path.resolve(v)))
  set('--username', (v) => (opts.username = v))
  set('--password', (v) => (opts.password = v))
  opts.viewport = args.includes('--no-fullpage') ? false : true
  opts.headless = args.includes('--headed') ? false : true
  opts.skipLogin = args.includes('--no-login')

  return opts
}

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

function slugify(name) {
  return name
    .trim()
    .replace(/[\s/]+/g, '-')
    .replace(/[^a-zA-Z0-9\u0600-\u06FF_-]/g, '')
    .toLowerCase()
}

async function login(page, opts) {
  await page.goto(`${opts.baseUrl}/login`, { waitUntil: 'networkidle', timeout: opts.timeout })
  await page.getByLabel('اسم المستخدم').fill(opts.username)
  await page.getByLabel('كلمة السر').fill(opts.password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL('**/')
  await page.evaluate(() => localStorage.setItem('skipPwChangeDialog', '1'))
  await page.reload({ waitUntil: 'networkidle' })
}

async function captureOne(page, task, opts) {
  await page.goto(task.url, { waitUntil: 'networkidle', timeout: opts.timeout }).catch(async () => {
    await page.goto(task.url, { waitUntil: 'load', timeout: opts.timeout })
  })

  await page.evaluate(() => {
    const h = document.body?.scrollHeight || 0
    window.scrollTo(0, h)
  })
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(800)

  const filePath = path.join(opts.runDir, task.fileName)
  await page.screenshot({ path: filePath, fullPage: opts.fullPage })
  return { task, filePath, status: 'success' }
}

function buildTasks(opts) {
  const time = timestamp()
  opts.runDir = path.join(opts.outputDir, time)

  const tasks = []
  for (const vpName of opts.viewports) {
    const vp = VIEWPORTS[vpName]
    if (!vp) throw new Error(`Unknown viewport "${vpName}". Valid: ${Object.keys(VIEWPORTS).join(', ')}`)
    const pages = opts.pages || PAGES.map((p) => p.path + ':' + p.name)
    for (const entry of pages) {
      const [route, ...rest] = entry.split(':')
      const label = rest.join(':') || slugify(route)
      tasks.push({
        url: opts.baseUrl + route,
        fileName: `${label}-${vpName}-${vp.width}x${vp.height}.png`.replace(/\s+/g, '-'),
        viewport: vp,
        name: vpName,
        needLogin: route !== '/login',
      })
    }
  }
  return tasks
}

async function main() {
  const opts = parseArgs()
  const tasks = buildTasks(opts)

  let browser = await chromium.launch({ headless: opts.headless })
  let storageState = null
  if (!opts.skipLogin) {
    const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await loginCtx.newPage()
    await login(page, opts)
    storageState = await loginCtx.storageState()
    await loginCtx.close()
  }

  const results = []
  const CONCURRENCY = 2
  const queue = [...tasks]

  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift()
      const context = task.needLogin && storageState
        ? await browser.newContext({ storageState, viewport: task.viewport, deviceScaleFactor: task.viewport.deviceScaleFactor })
        : await browser.newContext({ viewport: task.viewport, deviceScaleFactor: task.viewport.deviceScaleFactor })
      const page = await context.newPage()
      try {
        const r = await captureOne(page, task, opts)
        results.push(r)
        console.log(`  [${task.name}] ${task.fileName} ✅`)
      } catch (err) {
        results.push({ task, status: 'failed', error: err.message })
        console.error(`  [${task.name}] ${task.fileName} ❌ ${err.message}`)
      } finally {
        await context.close()
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await browser.close()

  const ok = results.filter((r) => r.status === 'success').length
  const bad = results.filter((r) => r.status === 'failed').length

  const report = {
    baseUrl: opts.baseUrl,
    runDir: opts.runDir,
    generatedAt: new Date().toISOString(),
    total: results.length,
    success: ok,
    failed: bad,
    results,
  }
  const reportPath = path.join(opts.runDir, 'report.json')
  await mkdir(opts.runDir, { recursive: true })
  await import('node:fs/promises').then(({ writeFile }) =>
    writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
  )

  console.log(`\n📁 Saved to: ${opts.runDir}`)
  console.log(`✅ ${ok} succeeded, ❌ ${bad} failed, 📄 report: ${reportPath}`)
  process.exit(bad > 0 ? 1 : 0)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}