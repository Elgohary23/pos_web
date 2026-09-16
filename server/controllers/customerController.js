import { CustomerRepository } from '../repositories/customerRepository.js'
import { asyncHandler } from '../middleware/errorHandler.js'

export const CustomerController = {
  list: asyncHandler(async (req, res) => {
    const q = req.query?.q ? String(req.query.q) : ''
    const limit = req.query?.limit ? Number(req.query.limit) : 50
    const customers = CustomerRepository.list({ q, limit })
    res.json({ success: true, data: { customers }, message: 'تم جلب العملاء' })
  }),
}