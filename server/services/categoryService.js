import { CategoryRepository } from '../repositories/categoryRepository.js'
import { ProductRepository } from '../repositories/productRepository.js'
import { AppError } from '../utils/AppError.js'

export const CategoryService = {
  findAll() {
    return CategoryRepository.listAll()
  },

  findOne(id) {
    const category = CategoryRepository.findById(Number(id))
    if (!category) throw new AppError('NOT_FOUND', 'التصنيف غير موجود', 404)
    const children = CategoryRepository.childrenOf(category.id)
    const products = ProductRepository.list({ categoryId: category.id })
    return { category, children, products }
  },

  create({ name, parentId }) {
    const cleanName = name !== undefined ? String(name).trim() : ''
    if (!cleanName) throw new AppError('VALIDATION_ERROR', 'اسم التصنيف مطلوب')

    let cleanParent = null
    if (parentId !== undefined && parentId !== null && parentId !== '') {
      cleanParent = Number(parentId)
      if (!CategoryRepository.findById(cleanParent)) {
        throw new AppError('VALIDATION_ERROR', 'التصنيف الأب غير موجود')
      }
    }
    return CategoryRepository.create({ name: cleanName, parentId: cleanParent })
  },

  update(id, { name, parentId } = {}) {
    const category = CategoryRepository.findById(Number(id))
    if (!category) throw new AppError('NOT_FOUND', 'التصنيف غير موجود', 404)

    const cleanName = name !== undefined && name !== null ? String(name).trim() : category.name
    if (!cleanName) throw new AppError('VALIDATION_ERROR', 'اسم التصنيف مطلوب')

    let cleanParent = category.parent_id
    if (parentId !== undefined) {
      cleanParent = parentId === null || parentId === '' ? null : Number(parentId)
    }

    if (cleanParent !== null) {
      if (cleanParent === category.id) {
        throw new AppError('VALIDATION_ERROR', 'لا يمكن جعل التصنيف أبًا لنفسه')
      }
      if (!CategoryRepository.findById(cleanParent)) {
        throw new AppError('VALIDATION_ERROR', 'التصنيف الأب غير موجود')
      }
      if (this.isDescendant(cleanParent, category.id)) {
        throw new AppError('VALIDATION_ERROR', 'لا يمكن نقل التصنيف داخل أحد أبنائه (منع الدوائر)')
      }
    }

    return CategoryRepository.update(category.id, { name: cleanName, parentId: cleanParent })
  },

  delete(id) {
    const category = CategoryRepository.findById(Number(id))
    if (!category) throw new AppError('NOT_FOUND', 'التصنيف غير موجود', 404)

    const children = CategoryRepository.countChildren(category.id)
    if (children > 0) {
      throw new AppError('CONFLICT', 'لا يمكن حذف تصنيف يحتوي على تصنيفات فرعية', 409)
    }
    const products = ProductRepository.countInCategory(category.id)
    if (products > 0) {
      throw new AppError('CONFLICT', 'لا يمكن حذف تصنيف يحتوي على منتجات', 409)
    }
    CategoryRepository.delete(category.id)
    return category
  },

  isDescendant(parentId, ancestorId) {
    let current = CategoryRepository.findById(parentId)
    let hops = 0
    while (current && hops < 1000) {
      if (current.parent_id === ancestorId) return true
      current = current.parent_id ? CategoryRepository.findById(current.parent_id) : null
      hops += 1
    }
    return false
  },
}