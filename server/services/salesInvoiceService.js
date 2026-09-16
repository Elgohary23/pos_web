import db from '../database/db.js'
import { ProductRepository } from '../repositories/productRepository.js'
import { CustomerRepository } from '../repositories/customerRepository.js'
import { SalesInvoiceRepository } from '../repositories/salesInvoiceRepository.js'
import { AuditService } from '../services/auditService.js'
import { ValidationError, InsufficientStockError } from '../utils/errors.js'
import { money, round2, times, plus, minus } from '../utils/money.js'

function normalizeItem(raw, index) {
  const label = `البند ${index + 1}`
  const productId = Number(raw?.product_id)
  if (!Number.isInteger(productId) || productId < 1) {
    throw new ValidationError(`${label}: معرّف المنتج غير صالح`)
  }

  const product = ProductRepository.findById(productId)
  if (!product) {
    throw new ValidationError(`${label}: المنتج غير موجود`)
  }

  const qtyNum = Number(raw?.quantity)
  if (!Number.isInteger(qtyNum) || qtyNum < 1) {
    throw new ValidationError(`${label}: الكمية يجب أن تكون عددًا صحيحًا موجبًا`)
  }

  if (!product.is_service && Number(product.quantity) < qtyNum) {
    throw new InsufficientStockError(
      `${label}: المخزون غير كافٍ للمنتج «${product.name}» (المتوفر: ${Number(product.quantity)})`
    )
  }

  const originalPrice = round2(Number(product.retail_price) || 0)
  const unitPrice = raw?.unit_price !== undefined && raw?.unit_price !== ''
    ? round2(Number(raw.unit_price))
    : originalPrice

  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new ValidationError(`${label}: سعر الوحدة غير صالح`)
  }

  const costPriceAtSale = round2(Number(product.cost_price) || 0)
  const lineTotal = round2(times(unitPrice, qtyNum).toNumber())

  const catRow = product.category_id
    ? db.prepare('SELECT name FROM categories WHERE id = ?').get(product.category_id)
    : null

  return {
    product_id: product.id,
    quantity: qtyNum,
    original_price: originalPrice,
    unit_price: unitPrice,
    cost_price_at_sale: costPriceAtSale,
    line_total: lineTotal,
    product_name: product.name,
    category_name: catRow ? catRow.name : 'عام',
    barcode: product.barcode || null,
  }
}

export const SalesInvoiceService = {
  createSaleInvoice(dto, currentUser) {
    const invoiceType = dto?.invoice_type || 'product_sale'
    const validTypes = ['product_sale', 'service_sale', 'reservation']
    if (!validTypes.includes(invoiceType)) {
      throw new ValidationError('نوع الفاتورة غير صالح')
    }

    const rawItems = Array.isArray(dto?.items) ? dto.items : []
    if (rawItems.length === 0) {
      throw new ValidationError('الفاتورة فارغة — أضف بنودًا على الأقل')
    }

    const discountType = dto?.discount_type || 'none'
    const validDiscounts = ['none', 'predefined', 'variable', 'free', 'fixed']
    if (!validDiscounts.includes(discountType)) {
      throw new ValidationError('نوع الخصم غير صالح')
    }

    const userId = currentUser?.id
    const userRole = currentUser?.role

    if (userRole === 'employee' && discountType === 'free') {
      throw new ValidationError('لا يُسمح للموظف بإنشاء فاتورة مجانية')
    }

    const customerName = dto?.customer_name ? String(dto.customer_name).trim() : ''
    const customerPhone = dto?.customer_phone ? String(dto.customer_phone).trim() : null
    const notes = dto?.notes ? String(dto.notes).trim() : null

    if (userRole === 'employee' && (discountType === 'variable' || discountType === 'fixed')) {
      if (!customerName) {
        throw new ValidationError('يجب إدخال اسم العميل عند تطبيق خصم')
      }
      if (!notes) {
        throw new ValidationError('يجب إدخال ملاحظات إضافية عند تطبيق خصم')
      }
    }

    let discountPercent = round2(Number(dto?.discount_percent) || 0)
    if (discountType === 'free') {
      discountPercent = 100
    }
    if (discountType === 'none' || discountType === 'fixed') {
      discountPercent = 0
    }

    const paidAmountRaw = dto?.paid_amount
    const paidAmountNumber = paidAmountRaw !== undefined && paidAmountRaw !== ''
      ? round2(Number(paidAmountRaw))
      : 0

    const items = rawItems.map((item, i) => normalizeItem(item, i))

    let totalBeforeDiscount = money(0)
    for (const item of items) {
      totalBeforeDiscount = plus(totalBeforeDiscount, item.line_total)
    }

    let discountValue
    if (discountType === 'fixed') {
      discountValue = round2(Number(dto?.discount_value) || 0)
      if (!Number.isFinite(discountValue) || discountValue < 0) {
        throw new ValidationError('قيمة الخصم غير صالحة')
      }
      if (discountValue > totalBeforeDiscount.toNumber()) {
        throw new ValidationError('قيمة الخصم أكبر من إجمالي الفاتورة')
      }
    } else {
      discountValue = round2(times(totalBeforeDiscount.toNumber(), discountPercent).div(100).toNumber())
    }
    const totalAfterDiscount = round2(minus(totalBeforeDiscount.toNumber(), discountValue).toNumber())
    const remainingAmount = round2(minus(totalAfterDiscount, paidAmountNumber).toNumber())

    if (paidAmountNumber > totalAfterDiscount) {
      throw new ValidationError('المبلغ المدفوع أكبر من إجمالي الفاتورة')
    }

    let customerId = null
    if (customerName) {
      const customer = CustomerRepository.getOrCreate(customerName, customerPhone)
      customerId = customer.customer_id
    }

    const tx = db.transaction(() => {
      const invoiceId = SalesInvoiceRepository.createInvoice({
        invoiceType,
        customerId,
        userId,
        totalBeforeDiscount: totalBeforeDiscount.toNumber(),
        discountType,
        discountPercent: discountPercent,
        discountValue,
        totalAfterDiscount,
        paidAmount: paidAmountNumber,
        remainingAmount,
        status: 'completed',
        notes,
      })

      SalesInvoiceRepository.insertItems(invoiceId, items)

      for (const item of items) {
        const product = ProductRepository.findById(item.product_id)
        if (product && !product.is_service) {
          const result = ProductRepository.decreaseStock(item.product_id, item.quantity)
          if (result.changes === 0) {
            throw new InsufficientStockError(
              `المخزون غير كافٍ للمنتج «${item.product_name}»`
            )
          }
        }
      }

      AuditService.log({
        userId,
        action: 'SALE_INVOICE',
        entity: 'sales_invoice',
        entityId: invoiceId,
        details: {
          invoice_type: invoiceType,
          total: totalAfterDiscount,
          discount_type: discountType,
          items_count: items.length,
          customer_name: customerName || null,
        },
      })

      return invoiceId
    })

    const invoiceId = tx()

    return {
      invoice_id: invoiceId,
      invoice_type: invoiceType,
      total_before_discount: totalBeforeDiscount.toNumber(),
      discount_type: discountType,
      discount_percent: discountPercent,
      discount_value: discountValue,
      total_after_discount: totalAfterDiscount,
      paid_amount: paidAmountNumber,
      remaining_amount: remainingAmount,
    }
  },
}
