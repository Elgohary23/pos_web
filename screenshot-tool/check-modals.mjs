import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const VP = { name: 'mobile-375', width: 375, height: 812 }

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

  const ctx = await browser.newContext({ storageState, viewport: { width: VP.width, height: VP.height } })
  const p = await ctx.newPage()

  const checks = [
    { route: '/employees', action: async () => p.getByRole('button', { name: '+ إضافة موظف' }).click() },
    { route: '/categories', action: async () => p.getByRole('button', { name: '+ تصنيف رئيسي' }).click() },
    { route: '/products', action: async () => p.getByRole('button', { name: '+ إضافة منتج' }).click() },
  ]

  let fails = 0
  for (const c of checks) {
    await p.goto(`${BASE}${c.route}`, { waitUntil: 'networkidle' }).catch(() => {})
    await c.action()
    await p.waitForSelector('.modal-box', { timeout: 5000 })
    await p.waitForTimeout(300)
    const box = await p.locator('.modal-box').boundingBox()
    const info = await p.evaluate(() => ({
      vw: window.innerWidth,
      docW: document.documentElement.scrollWidth,
    }))
    const ok = box && box.x >= 0 && box.x + box.width <= info.vw + 1
    console.log(`  ${ok ? '✅' : '❌'} ${VP.name} ${c.route} modal[x=${box?.x.toFixed(0)},w=${box?.width.toFixed(0)}] docOverflow=${info.docW - info.vw}px`)
    if (!ok) fails++
    await p.keyboard.press('Escape')
    await p.waitForSelector('.modal-box', { state: 'detached' }).catch(() => {})
  }

  await browser.close()
  console.log(`${fails === 0 ? '✅' : '❌'} modals: ${3 - fails}/3 ok`)
  process.exit(fails > 0 ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })