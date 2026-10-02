import { Router } from 'express'
import { BarcodeController } from '../controllers/barcodeController.js'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = Router()

router.use(requireAuth)

router.post('/ensure', asyncHandler(BarcodeController.ensure))
router.get('/qr.png', asyncHandler(BarcodeController.qrPng))

export default router
