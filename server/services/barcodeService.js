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
const DEEP_LINK_PATH = '/l'

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

  async ensurePng(code, linkBase) {
    const filePath = path.join(barcodesDir, `${code}.png`)
    if (!fs.existsSync(filePath)) {
      await this.generatePng(code)
    }
    // The QR is regenerated whenever the label's target host changes (a new
    // router, a different adapter), so a stale file must not be reused.
    const qrPath = path.join(barcodesDir, `${code}-qr.png`)
    const stamp = linkBase ? Buffer.from(linkBase).toString('base64url') : ''
    const qrStampPath = path.join(barcodesDir, `${code}-qr.stamp`)
    const currentStamp = fs.existsSync(qrStampPath) ? fs.readFileSync(qrStampPath, 'utf8') : ''
    if (!fs.existsSync(qrPath) || currentStamp !== stamp) {
      await this.generateQrPng(code, linkBase)
      fs.writeFileSync(qrStampPath, stamp, 'utf8')
    }
    return `/barcodes/${code}.png`
  },

  async ensurePngs(codes, linkBase) {
    const urls = []
    for (const code of codes) {
      urls.push(await this.ensurePng(code, linkBase))
    }
    return urls
  },

  // A phone's own camera app opens the URL inside a printed QR, which reaches
  // the product page over plain HTTP - no certificate and no browser camera
  // permission involved. The Code128 next to it stays the raw code so the
  // desktop scanner keeps working unchanged.
  deepLink(code, linkBase) {
    const base = String(linkBase || '').trim().replace(/\/+$/, '')
    return base ? `${base}${DEEP_LINK_PATH}/${encodeURIComponent(code)}` : ''
  },

  async generateQrPng(code, linkBase) {
    const payload = this.deepLink(code, linkBase)
    if (!payload) return ''
    const filePath = path.join(barcodesDir, `${code}-qr.png`)
    try {
      const png = await bwipjs.toBuffer({
        bcid: 'qrcode',
        text: payload,
        scale: 4,
        includetext: false,
        backgroundcolor: 'FFFFFF',
        paddingwidth: 4,
        paddingheight: 4,
      })
      fs.writeFileSync(filePath, png)
    } catch (err) {
      console.error(`تعذر توليد صورة QR للمنتج ${code}:`, err)
    }
    return `/barcodes/${code}-qr.png`
  },

  // Standalone QR for an arbitrary LAN URL, used by the Home page so a phone
  // can be enrolled once without typing an IP address.
  async qrPng(text) {
    const value = String(text || '').trim()
    if (!/^https?:\/\/[^\s]{1,300}$/i.test(value)) {
      throw new AppError('VALIDATION_ERROR', 'الرابط غير صالح')
    }
    return bwipjs.toBuffer({
      bcid: 'qrcode',
      text: value,
      scale: 5,
      includetext: false,
      backgroundcolor: 'FFFFFF',
      paddingwidth: 6,
      paddingheight: 6,
    })
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