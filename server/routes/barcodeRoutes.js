import { Router } from 'express'
import { BarcodeController } from '../controllers/barcodeController.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = Router()

router.use(requireAuth, requireAdmin)

router.post('/ensure', asyncHandler(BarcodeController.ensure))

export default router
