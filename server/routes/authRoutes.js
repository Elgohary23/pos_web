import { Router } from 'express'
import { AuthController } from '../controllers/authController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/me', requireAuth, AuthController.me)
router.post('/login', AuthController.login)
router.post('/logout', AuthController.logout)
router.post('/change-password', requireAuth, AuthController.changePassword)

export default router