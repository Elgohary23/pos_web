import db from '../database/db.js'
import { ProductRepository } from '../repositories/productRepository.js'
import { CategoryRepository } from '../repositories/categoryRepository.js'
import { SupplierRepository } from '../repositories/supplierRepository.js'
import { SupplyInvoiceRepository } from '../repositories/supplyInvoiceRepository.js'
import { BarcodeService } from './barcodeService.js'
import { AuditService } from './auditService.js'
import { ValidationError, BusinessRuleError, InsufficientStockError } from '../utils/errors.js'
import { money, round2, times, plus, minus } from '../utils/money.js'

const DEFAULT_CATEGORY_NAME = 'عام'

function getDefaultCategoryId() {
  const existing = CategoryRepository.findByName(DEFAULT_CATEGORY_NAME)
  return existing ? existing.id : CategoryRepository.create({ name: DEFAULT_CATEGORY_NAME, parentId: null }).id
}

function normalizeItem(raw, index) {
  const label = `البند ${index + 1}`
  const name = raw && typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) throw new ValidationError(`${label}: اسم المنتج مطلوب`)

  const costNum = Number(raw?.unit_cost)
  if (raw?.unit_cost === undefined || raw?.unit_cost === null || raw?.unit_cost === '' || !Number.isFinite(costNum) || costNum < 0) {
    throw new ValidationError(`${label}: تكلفة الوحدة يجب أن تكون رقمًا موجبًا`)
  }

  let retailNum = null
  if (raw?.retail_price !== undefined && raw?.retail_price !== null && raw?.retail_price !== '') {
    retailNum = Number(raw.retail_price)
    if (!Number.isFinite(retailNum) || retailNum < 0) {
      throw new ValidationError(`${label}: سعر البيع يجب أن يكون رقمًا موجبًا`)
    }
    retailNum = round2(retailNum)
  }

  const qtyNum = Number(raw?.quantity)
  if (!Number.isInteger(qtyNum) || qtyNum < 1) {
    throw new ValidationError(`${label}: الكمية يجب أن تكون عددًا صحيحًا موجبًا`)
  }

  const categoryName = raw?.category_name ? String(raw.category_name).trim() : ''
  return { name, unit_cost: round2(costNum), retail_price: retailNum, quantity: qtyNum, category_name: categoryName }
}

export const SupplyService = {
  async createSupplyInvoice(dto, currentUser) {
    const kind = dto?.kind
    const rawItems = Array.isArray(dto?.items) ? dto.items : []

    if (kind !== 'supply' && kind !== 'return') {
      throw new ValidationError('نوع الفاتورة غير صالح')
    }
    if (rawItems.length === 0) {
      throw new ValidationError('فاتورة التوريد فارغة')
    }

    const items = rawItems.map(normalizeItem)

    const rawShipping = dto?.shipping_cost
    if (rawShipping !== undefined && rawShipping !== null && rawShipping !== '') {
      const shippingNum = Number(rawShipping)
      if (!Number.isFinite(shippingNum) || shippingNum < 0) {
        throw new ValidationError('مصاريف الشحن يجب أن تكون رقمًا موجبًا')
      }
    }

    const supplierName = dto?.supplier_name ? String(dto.supplier_name).trim() : ''
    const shippingCost = round2(dto?.shipping_cost ?? 0)
    const notes = dto?.notes ? String(dto.notes).trim() : null
    const userId = currentUser?.id

    if (kind === 'return') {
      for (const item of items) {
        const product = ProductRepository.findByName(item.name)
        if (!product) {
          throw new ValidationError(`المنتج «${item.name}» غير موجود ولا يمكن إرجاعه`)
        }
        if (product.is_service) {
          throw new BusinessRuleError('لا يمكن إرجاع خدمة')
        }
        if (Number(product.quantity) < item.quantity) {
          throw new InsufficientStockError(
            `المخزون غير كافٍ للمنتج «${product.name}» (المتوفر: ${Number(product.quantity)})`
          )
        }
      }
    }

    const newProducts = []
    let total = money(0)

    const tx = db.transaction(() => {
      const supplierId = supplierName ? SupplierRepository.getOrCreate(supplierName).supplier_id : null

      const itemRows = items.map((item) => {
        let product = ProductRepository.findByName(item.name)

        if (product) {
          if (!product.is_active) ProductRepository.reactivate(product.id)
          const categoryName = item.category_name || null
          if (categoryName) {
            const cat = CategoryRepository.getOrCreate(categoryName)
            if (Number(product.category_id) !== Number(cat.id)) {
              ProductRepository.updateCategory(product.id, cat.id)
            }
          }
        } else {
          if (kind === 'return') {
            throw new ValidationError(`المنتج «${item.name}» غير موجود ولا يمكن إرجاعه`)
          }
          if (item.retail_price === null || item.retail_price === undefined) {
            throw new ValidationError(`المنتج «${item.name}» جديد — سعر البيع مطلوب`)
          }
          const barcode = BarcodeService.generateCode()
          const categoryId = item.category_name
            ? CategoryRepository.getOrCreate(item.category_name).id
            : getDefaultCategoryId()
          product = ProductRepository.createFromSupply({
            name: item.name,
            barcode,
            costPrice: item.unit_cost,
            wholesalePrice: item.unit_cost,
            retailPrice: item.retail_price,
            categoryId,
          })
          newProducts.push({ product_id: product.id, name: product.name, barcode: product.barcode })
        }

        const lineTotal = round2(times(item.unit_cost, item.quantity).toNumber())

        if (kind === 'supply') {
          const newQty = Number(product.quantity) + item.quantity
          ProductRepository.updateStockAndPrices(product.id, {
            quantity: newQty,
            costPrice: item.unit_cost,
            retailPrice: item.retail_price,
          })
          total = plus(total, lineTotal)
        } else {
          const result = ProductRepository.decreaseStock(product.id, item.quantity)
          if (result.changes === 0) {
            throw new InsufficientStockError(`المخزون غير كافٍ للمنتج «${product.name}»`)
          }
          total = minus(total, lineTotal)
        }

        return { product_id: product.id, quantity: item.quantity, unit_cost: item.unit_cost, line_total: lineTotal }
      })

      total = plus(total, shippingCost)
      const grandTotal = round2(total.toNumber())

      const invoiceId = SupplyInvoiceRepository.createInvoice({
        invoiceKind: kind,
        userId,
        supplierId,
        shippingCost,
        totalAmount: grandTotal,
        notes,
      })

      SupplyInvoiceRepository.insertItems(invoiceId, itemRows)

      AuditService.log({
        userId,
        action: kind === 'supply' ? 'SUPPLY_SUPPLY' : 'SUPPLY_RETURN',
        entity: 'supply_invoice',
        entityId: invoiceId,
        details: { total: grandTotal, shipping: shippingCost, items_count: itemRows.length },
      })

      return { invoiceId, grandTotal }
    })

    const { invoiceId, grandTotal } = tx()

    const newProductsWithUrls = await Promise.all(
      newProducts.map(async (p) => ({ ...p, barcode_url: await BarcodeService.generatePng(p.barcode) }))
    )

    return {
      invoice_id: invoiceId,
      kind,
      total: grandTotal,
      new_products: newProductsWithUrls,
    }
  },
}