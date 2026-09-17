import bwipjs from 'bwip-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { ProductRepository } from '../repositories/productRepository.js'
import { AppError } from '../utils/AppError.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const barcodesDir = path.join(__dirname, '..', 'public', 'barcodes')

if (!fs.existsSync(barcodesDir)) {
  fs.mkdirSync(barcodesDir, { recursive: true })
}

const CHARS = '0123456789ABCDEF'

export const BarcodeService = {
  generateCode() {
    let code = ''
    let attempts = 0
    do {
      code = Array.from({ length: 12 }, () => CHARS[Math.floor(Math.random() * 16)]).join('')
      attempts += 1
    } while (ProductRepository.findByBarcode(code) && attempts < 100)

    if (attempts >= 100 || ProductRepository.findByBarcode(code)) {
      throw new AppError('INTERNAL_ERROR', 'تعذر توليد باركود فريد للمنتج', 500)
    }
    return code
  },

  async ensurePng(code) {
    const filePath = path.join(barcodesDir, `${code}.png`)
    if (!fs.existsSync(filePath)) {
      await this.generatePng(code)
    }
    return `/barcodes/${code}.png`
  },

  async ensurePngs(codes) {
    const urls = []
    for (const code of codes) {
      urls.push(await this.ensurePng(code))
    }
    return urls
  },

  async generatePng(code) {
    const filePath = path.join(barcodesDir, `${code}.png`)
    try {
      const png = await bwipjs.toBuffer({
        bcid: 'code128',
        text: code,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: 'center',
        backgroundcolor: 'FFFFFF',
        paddingwidth: 5,
        paddingheight: 5,
      })
      fs.writeFileSync(filePath, png)
    } catch (err) {
      console.error(`تعذر توليد صورة الباركود ${code}:`, err)
    }
    return `/barcodes/${code}.png`
  },
}