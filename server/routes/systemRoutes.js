import { Router } from 'express'
import { SystemController } from '../controllers/systemController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, SystemController.info)

export default router