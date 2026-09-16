import { TransactionLogService } from '../services/transactionLogService.js'
import { asyncHandler } from '../middleware/errorHandler.js'

function localDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const TransactionController = {
  list: asyncHandler(async (req, res) => {
    const date = req.query?.date || localDateStr()
    const data = TransactionLogService.getDailyTransactions(date)
    res.json({ success: true, data, message: 'تم جلب سجل المعاملات' })
  }),

  getById: asyncHandler(async (req, res) => {
    const data = TransactionLogService.getInvoiceDetails(req.params.id)
    res.json({ success: true, data, message: 'تم جلب تفاصيل الفاتورة' })
  }),
}