import { Router } from 'express'
import { SupplyInvoiceController } from '../controllers/supplyInvoiceController.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permission.js'

const router = Router()

router.post(
  '/',
  requireAuth,
  requirePermission('CREATE_SUPPLY_INVOICE'),
  SupplyInvoiceController.create
)

export default router