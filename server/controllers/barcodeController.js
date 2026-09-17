import { BarcodeService } from '../services/barcodeService.js'
import { ValidationError } from '../utils/errors.js'

const CODE_PATTERN = /^[A-Za-z0-9]{1,64}$/

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
    await BarcodeService.ensurePngs(codes)
    res.json({
      success: true,
      data: { generated: codes.length },
      message: 'جارٍ تجهيز صور الباركود',
    })
  },
}
