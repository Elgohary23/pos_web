import { SalesInvoiceService } from '../services/salesInvoiceService.js'
import { SalesInvoiceRepository } from '../repositories/salesInvoiceRepository.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { AppError } from '../utils/AppError.js'

export const SalesInvoiceController = {
  create: asyncHandler(async (req, res) => {
    const invoice = SalesInvoiceService.createSaleInvoice(req.body, {
      id: req.session.userId,
      role: req.session.userRole,
    })
    res.status(201).json({
      success: true,
      data: { invoice },
      message: 'تم حفظ فاتورة البيع بنجاح',
    })
  }),

  getById: asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      throw new AppError('VALIDATION_ERROR', 'رقم الفاتورة غير صالح', 400)
    }
    const invoice = SalesInvoiceRepository.findById(id)
    if (!invoice) {
      throw new AppError('NOT_FOUND', 'الفاتورة غير موجودة', 404)
    }
    const items = SalesInvoiceRepository.findItemsByInvoiceId(id)
    res.json({
      success: true,
      data: { invoice, items },
      message: 'تم جلب تفاصيل فاتورة البيع',
    })
  }),
}
