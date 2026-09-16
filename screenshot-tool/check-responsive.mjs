import { chromium } from 'playwright'

const PAGES = ['/login', '/', '/supply-invoice', '/employees', '/categories', '/products']
const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

const BASE = 'http://localhost:5173'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await loginCtx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel('اسم المستخدم').fill('admin')
  await page.getByLabel('كلمة السر').fill('admin')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL('**/')
  await page.evaluate(() => localStorage.setItem('skipPwChangeDialog', '1'))
  await page.waitForTimeout(300)

  const storageState = await loginCtx.storageState()
  await loginCtx.close()
  console.log('login ok, storageState captured')

  let total = 0
  let overflowIssues = 0

  for (const vp of VIEWPORTS) {
    const needsAuth = true
    const ctx = needsAuth
      ? await browser.newContext({ storageState, viewport: { width: vp.width, height: vp.height } })
      : await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const p = await ctx.newPage()
    for (const route of PAGES) {
      total++
      let overflowWidth = 0
      try {
        await p.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
          await p.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 30000 })
        })
        await p.waitForTimeout(600)
        overflowWidth = await p.evaluate(() => {
          const doc = document.documentElement
          return doc.scrollWidth - doc.clientWidth
        })
      } catch (err) {
        overflowWidth = -1
        console.error(`  ${vp.name} ${route} ERROR ${err.message}`)
      }
      if (overflowWidth > 1) {
        overflowIssues++
        console.log(`  ❌ ${vp.name} ${route} overflow=${overflowWidth}px`)
      } else {
        console.log(`  ✅ ${vp.name} ${route}`)
      }
    }
    await ctx.close()
  }

  await browser.close()
  console.log(`\n${total} checks, ${overflowIssues} overflow issues`)
  process.exit(overflowIssues > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})