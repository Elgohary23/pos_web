import { Router } from 'express'
import { CustomerController } from '../controllers/customerController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, CustomerController.list)

export default router