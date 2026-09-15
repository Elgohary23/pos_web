import { CategoryService } from '../services/categoryService.js'
import { publicCategory, publicProduct } from '../utils/helpers.js'

export const CategoryController = {
  list(req, res) {
    const categories = CategoryService.findAll().map(publicCategory)
    res.json({ success: true, data: { categories }, message: 'تم جلب التصنيفات' })
  },

  get(req, res) {
    const data = CategoryService.findOne(req.params.id)
    res.json({
      success: true,
      data: {
        category: publicCategory(data.category),
        children: data.children.map(publicCategory),
        products: data.products.map(publicProduct),
      },
      message: 'تم جلب التصنيف',
    })
  },

  create(req, res) {
    const { name, parentId } = req.body || {}
    const category = CategoryService.create({ name, parentId })
    res.json({ success: true, data: { category: publicCategory(category) }, message: 'تم إنشاء التصنيف' })
  },

  update(req, res) {
    const { name, parentId } = req.body || {}
    const category = CategoryService.update(req.params.id, { name, parentId })
    res.json({ success: true, data: { category: publicCategory(category) }, message: 'تم تعديل التصنيف' })
  },

  remove(req, res) {
    CategoryService.delete(req.params.id)
    res.json({ success: true, data: null, message: 'تم حذف التصنيف' })
  },
}