import { Router } from 'express'
import { SupplierController } from '../controllers/supplierController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, SupplierController.list)

export default router