import { chromium } from 'playwright'

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

  const ctx = await browser.newContext({ storageState, viewport: { width: 375, height: 812 } })
  const p = await ctx.newPage()
  let fails = 0

  for (const route of ['/employees', '/products']) {
    await p.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch(() => {})
    await p.waitForSelector('.data-table-cards tbody tr', { timeout: 5000 })
    await p.waitForTimeout(300)

    const info = await p.evaluate(() => {
      const table = document.querySelector('.data-table-cards')
      if (!table) return { missing: true }
      const theadHidden = getComputedStyle(table.querySelector('thead')).display === 'none'
      const firstTd = table.querySelector('tbody tr td')
      const labelVisible = firstTd ? firstTd.textContent.trim().length > 0 : false
      const firstBtn = table.querySelector('.row-actions .btn-danger')
      const btnWidth = firstBtn ? firstBtn.getBoundingClientRect().width : 0
      const cellW = firstTd ? firstTd.getBoundingClientRect().width : 0
      const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
      const rowCount = table.querySelectorAll('tbody tr').length
      return { theadHidden, labelVisible, btnWidth, cellW, docOverflow, rowCount }
    })

    const ok = !info.missing && info.theadHidden && info.labelVisible && info.btnWidth > info.cellW * 0.9 && info.docOverflow <= 1 && info.rowCount > 0
    console.log(`  ${ok ? '✅' : '❌'} mobile-375 ${route} ${JSON.stringify(info)}`)
    if (!ok) fails++
  }

  await browser.close()
  console.log(`${fails === 0 ? '✅' : '❌'} card layout: ${2 - fails}/2 ok`)
  process.exit(fails > 0 ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })