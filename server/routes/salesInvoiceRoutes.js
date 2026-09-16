import { Router } from 'express'
import { SalesInvoiceController } from '../controllers/salesInvoiceController.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permission.js'

const router = Router()

router.post('/', requireAuth, requirePermission('CREATE_SALE_INVOICE'), SalesInvoiceController.create)
router.get('/:id', requireAuth, requireAdmin, SalesInvoiceController.getById)

export default router
