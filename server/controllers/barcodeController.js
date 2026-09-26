import { BarcodeService } from '../services/barcodeService.js'
import { SystemService } from '../services/systemService.js'
import { ValidationError } from '../utils/errors.js'

const CODE_PATTERN = /^[A-Za-z0-9]{1,64}$/
// Only the scheme/host/port shape is accepted, and the value only ever ends up
// as QR payload text on a printed label.
const LINK_BASE_PATTERN = /^https?:\/\/[A-Za-z0-9.-]{1,253}(:\d{1,5})?$/i

function normalizeLinkBase(value) {
  const clean = String(value || '').trim().replace(/\/+$/, '')
  if (!clean) return SystemService.origin()
  if (!LINK_BASE_PATTERN.test(clean)) {
    throw new ValidationError('رابط الاستجابة غير صالح')
  }
  return clean
}

export const BarcodeController = {
  async ensure(req, res) {
    const raw = req.body?.barcodes
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new ValidationError('لم يتم تحديد أي منتجات')
    }
    if (raw.length > 2000) {
      throw new ValidationError('عدد المنتجات المحددة كبير جدًا (الحد الأقصى 2000)')
    }
    const codes = [...new Set(raw.map((c) => String(c).trim()))]
    const invalid = codes.find((c) => !CODE_PATTERN.test(c))
    if (invalid) {
      throw new ValidationError('أحد الباركودات غير صالح')
    }
    const linkBase = normalizeLinkBase(req.body?.linkBase)
    await BarcodeService.ensurePngs(codes, linkBase)
    res.json({
      success: true,
      data: { generated: codes.length, linkBase },
      message: 'جارٍ تجهيز صور الباركود',
    })
  },

  // Streams a PNG instead of JSON, so it is written directly.
  async qrPng(req, res) {
    const png = await BarcodeService.qrPng(req.query.text)
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'no-store')
    res.send(png)
  },
}
