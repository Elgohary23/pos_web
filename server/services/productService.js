import { ProductRepository } from '../repositories/productRepository.js'
import { CategoryRepository } from '../repositories/categoryRepository.js'
import { AppError } from '../utils/AppError.js'
import { extractScanCode } from '../utils/scanCode.js'

function toPositivePrice(value, fieldName) {
  const num = Number(value)
  if (value === undefined || value === null || value === '' || Number.isNaN(num) || num < 0) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} يجب أن يكون رقمًا موجبًا`)
  }
  return Math.round(num * 100) / 100
}

function toPositiveQuantity(value) {
  const num = Number(value)
  if (value === undefined || value === null || value === '' || Number.isNaN(num) || num < 0) {
    throw new AppError('VALIDATION_ERROR', 'الكمية يجب أن تكون رقمًا موجبًا')
  }
  return Math.round(num * 1000) / 1000
}

function generateBarcode() {
  let code = ''
  for (let i = 0; i < 12; i += 1) {
    code += String(Math.floor(Math.random() * 10))
  }
  return code
}

function ensureUniqueBarcode(value) {
  if (ProductRepository.findByBarcode(value)) {
    throw new AppError('CONFLICT', 'هذا الباركود مستخدم بالفعل', 409)
  }
}

const MAX_BARCODE_LENGTH = 64
// Checked on the raw input, before any URL parsing: the WHATWG URL parser
// silently strips tabs and newlines, which would otherwise turn a malformed
// scan into a valid-looking code.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/

// Barcode lookup filter (exact match). The value can arrive straight from a
// desktop scanner (raw code) or from a phone camera that opened our deep link,
// so it is normalised down to a bare code first. Anything that cannot be a
// stored barcode is dropped rather than turned into a query.
function normalizeBarcodeFilter(value) {
  if (value === undefined || value === null) return ''
  const raw = String(value)
  if (CONTROL_CHARS.test(raw)) {
    throw new AppError('VALIDATION_ERROR', 'الكود المُدخل يحتوي على رموز غير مسموحة')
  }
  const code = extractScanCode(raw)
  if (code) return code
  const clean = raw.trim()
  if (!clean) return ''
  if (clean.length > MAX_BARCODE_LENGTH) {
    throw new AppError('VALIDATION_ERROR', 'الكود المُدخل أطول من الحد المسموح (64 حرفًا)')
  }
  throw new AppError('VALIDATION_ERROR', 'الكود المُدخل لا يمثل باركود منتج')
}

export const ProductService = {
  list({ q, categoryId, active = false, barcode, limit = null } = {}) {
    const cleanCategory =
      categoryId !== undefined && categoryId !== null && categoryId !== '' ? Number(categoryId) : null
    return ProductRepository.list({
      q: String(q ?? '').trim(),
      categoryId: cleanCategory,
      active,
      barcode: normalizeBarcodeFilter(barcode),
      limit,
    })
  },

  findOne(id) {
    const product = ProductRepository.findById(Number(id))
    if (!product) throw new AppError('NOT_FOUND', 'المنتج غير موجود', 404)
    return product
  },

  create({ name, wholesalePrice, retailPrice, barcode, imageUrl, categoryId, quantity }) {
    const cleanName = name !== undefined ? String(name).trim() : ''
    if (!cleanName) throw new AppError('VALIDATION_ERROR', 'اسم المنتج مطلوب')

    const catId = Number(categoryId)
    if (!catId || !CategoryRepository.findById(catId)) {
      throw new AppError('VALIDATION_ERROR', 'يجب اختيار تصنيف للمنتج')
    }

    const wholesale = toPositivePrice(wholesalePrice, 'سعر الجملة')
    const retail = toPositivePrice(retailPrice, 'سعر البيع')
    const productQuantity = toPositiveQuantity(quantity)

    let finalBarcode = barcode !== undefined && barcode !== null && String(barcode).trim() !== ''
      ? String(barcode).trim()
      : generateBarcode()
    ensureUniqueBarcode(finalBarcode)

    return ProductRepository.create({
      name: cleanName,
      wholesalePrice: wholesale,
      retailPrice: retail,
      barcode: finalBarcode,
      imageUrl: imageUrl ?? null,
      categoryId: catId,
      quantity: productQuantity,
    })
  },

  update(id, { name, wholesalePrice, retailPrice, barcode, imageUrl, categoryId, quantity } = {}) {
    const product = ProductRepository.findById(Number(id))
    if (!product) throw new AppError('NOT_FOUND', 'المنتج غير موجود', 404)

    const cleanName = name !== undefined ? String(name).trim() : product.name
    if (!cleanName) throw new AppError('VALIDATION_ERROR', 'اسم المنتج مطلوب')

    let catId = product.category_id
    if (categoryId !== undefined) {
      catId = Number(categoryId)
      if (!catId || !CategoryRepository.findById(catId)) {
        throw new AppError('VALIDATION_ERROR', 'يجب اختيار تصنيف صالح للمنتج')
      }
    }

    const wholesale = wholesalePrice !== undefined ? toPositivePrice(wholesalePrice, 'سعر الجملة') : product.wholesale_price
    const retail = retailPrice !== undefined ? toPositivePrice(retailPrice, 'سعر البيع') : product.retail_price
    const productQuantity = quantity !== undefined ? toPositiveQuantity(quantity) : product.quantity

    let finalBarcode = product.barcode
    if (barcode !== undefined && barcode !== null && String(barcode).trim() !== '') {
      finalBarcode = String(barcode).trim()
      if (finalBarcode !== product.barcode) ensureUniqueBarcode(finalBarcode)
    }

    return ProductRepository.update(product.id, {
      name: cleanName,
      wholesalePrice: wholesale,
      retailPrice: retail,
      barcode: finalBarcode,
      imageUrl: imageUrl !== undefined ? imageUrl : product.image_url,
      categoryId: catId,
      quantity: productQuantity,
    })
  },

  delete(id) {
    const product = ProductRepository.findById(Number(id))
    if (!product) throw new AppError('NOT_FOUND', 'المنتج غير موجود', 404)
    ProductRepository.delete(product.id)
    return product
  },
}
