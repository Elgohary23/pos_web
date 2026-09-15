import { SupplierService } from '../services/supplierService.js'

export const SupplierController = {
  list(req, res) {
    const suppliers = SupplierService.list().map((s) => ({
      id: s.supplier_id,
      name: s.name,
      phone: s.phone,
    }))
    res.json({ success: true, data: { suppliers }, message: 'تم جلب الموردين' })
  },
}