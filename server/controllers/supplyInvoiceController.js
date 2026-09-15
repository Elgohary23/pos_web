import { SupplyService } from '../services/supplyService.js'

export const SupplyInvoiceController = {
  async create(req, res) {
    const invoice = await SupplyService.createSupplyInvoice(req.body, {
      id: req.session.userId,
      username: req.session.username,
    })
    res.status(201).json({
      success: true,
      data: { invoice },
      message: invoice.kind === 'supply' ? 'تم حفظ فاتورة التوريد بنجاح' : 'تم حفظ فاتورة المرتجع بنجاح',
    })
  },
}