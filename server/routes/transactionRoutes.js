import { Router } from 'express'
import { TransactionController } from '../controllers/transactionController.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, requireAdmin, TransactionController.list)
router.get('/:id', requireAuth, requireAdmin, TransactionController.getById)

export default router