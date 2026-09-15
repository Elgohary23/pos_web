import { ProductService } from '../services/productService.js'
import { publicProduct } from '../utils/helpers.js'

export const ProductController = {
  list(req, res) {
    const { q, categoryId, active, limit } = req.query || {}
    const products = ProductService.list({ q, categoryId, active: active === '1', limit }).map(publicProduct)
    res.json({ success: true, data: { products }, message: 'تم جلب المنتجات' })
  },

  get(req, res) {
    const product = ProductService.findOne(req.params.id)
    res.json({ success: true, data: { product: publicProduct(product) }, message: 'تم جلب المنتج' })
  },

  create(req, res) {
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null
    const { name, wholesalePrice, retailPrice, barcode, categoryId, quantity } = req.body || {}
    const product = ProductService.create({
      name,
      wholesalePrice,
      retailPrice,
      barcode,
      imageUrl,
      categoryId,
      quantity,
    })
    res.json({ success: true, data: { product: publicProduct(product) }, message: 'تم إنشاء المنتج' })
  },

  update(req, res) {
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body?.imageUrl ?? undefined
    const { name, wholesalePrice, retailPrice, barcode, categoryId, quantity } = req.body || {}
    const product = ProductService.update(req.params.id, {
      name,
      wholesalePrice,
      retailPrice,
      barcode,
      imageUrl,
      categoryId,
      quantity,
    })
    res.json({ success: true, data: { product: publicProduct(product) }, message: 'تم تعديل المنتج' })
  },

  remove(req, res) {
    ProductService.delete(req.params.id)
    res.json({ success: true, data: null, message: 'تم حذف المنتج' })
  },
}